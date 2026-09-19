import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_C_BUNDLE_FORMAT,
  stageCEvidenceSha256,
  stageCBundleSha256,
  validateStageCReleaseBundle,
} from '../scripts/v267-stage-c-release-bundle-gate.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';
const PREVIEW='https://aqari-stage-c-window-bound.vercel.app';
const DEPLOYMENT='dpl_AqariStageCWindowBound123';
const FLOWS=['login','session','save','reopen','permissions','contracts','printing'];

function device(kind){
  const flow_evidence=Object.fromEntries(FLOWS.map((flow)=>[flow,[`evidence/${kind}/${flow}.json`]]));
  return {
    accepted:true,real_account:true,simulated:false,emulated:false,physical:true,
    candidate_sha:SHA,preview_deployment_id:DEPLOYMENT,preview_url:PREVIEW,
    device_instance:`physical-${kind}-window-bound`,browser:kind==='desktop'?'Chrome':'Mobile Safari',
    flows:Object.fromEntries(FLOWS.map((flow)=>[flow,true])),flow_evidence,
    evidence:Object.values(flow_evidence).flat().sort(),
  };
}

function bundle(windowSeconds){
  const value={
    format:STAGE_C_BUNDLE_FORMAT,accepted:true,candidate_sha:SHA,
    source_project_ref:'aqari-preview-source',restore_project_ref:'aqari-preview-restore',
    preview:{deployment_id:DEPLOYMENT,url:PREVIEW,candidate_sha:SHA,environment:'preview',release_stage:'preview'},
    evidence_sha256:{backup_set:'',backup_storage_bytes:'',independent_restore:'',rollback_rehearsal:'',physical_devices:''},
    storage:{object_count:2,total_bytes:156509,manifest_sha256:'f'.repeat(64)},
    backup:{
      format:'AQARI-V267-BACKUP-SET-MANIFEST-1',candidate_sha:SHA,project_ref:'aqari-preview-source',
      capture_started_at:'2026-09-19T05:00:00Z',capture_finished_at:'2026-09-19T05:00:30Z',capture_window_seconds:30,
      components:{
        database:{bytes:1000,sha256:'8'.repeat(64)},auth:{bytes:200,sha256:'9'.repeat(64)},
        storage:{bytes:300,sha256:'a'.repeat(64),object_count:2,object_bytes:156509,storage_manifest_sha256:'f'.repeat(64)},
      },
    },
    restore:{
      format:'AQARI-V267-RESTORE-EQUIVALENCE-1',verified:true,candidate_sha:SHA,
      source_project_ref:'aqari-preview-source',restore_project_ref:'aqari-preview-restore',
      source_generated_at:'2026-09-19T05:00:10Z',restored_generated_at:'2026-09-19T05:10:10Z',
      section_sha256:{business:'4'.repeat(64),schema_safe:'5'.repeat(64),auth_safe:'6'.repeat(64),storage_safe:'7'.repeat(64)},
      storage_object_count:2,storage_total_bytes:156509,storage_manifest_sha256:'f'.repeat(64),
    },
    rollback:{
      format:'AQARI-V267-ROLLBACK-REHEARSAL-1',verified:true,candidate_sha:SHA,
      rollback_application_sha:'2'.repeat(40),rehearsal_id:'3'.repeat(32),database_project_ref:'aqari-preview-source',
      database_rollback_performed:false,rehearsal_window_seconds:windowSeconds,
      checkpoint_record_count:12,new_record_count:3,after_record_count:15,counts_by_kind:{payment:9,receipt:6},
      checkpoint_records_sha256:'1'.repeat(64),during_records_sha256:'2'.repeat(64),after_records_sha256:'3'.repeat(64),
    },
    devices:{desktop:device('desktop'),iphone:device('iphone'),ipad:device('ipad')},
  };
  value.evidence_sha256.backup_set=stageCEvidenceSha256(value.backup);
  value.evidence_sha256.backup_storage_bytes=stageCEvidenceSha256({format:'AQARI-V267-STORAGE-BYTE-MANIFEST-1',verified:true,...value.storage});
  value.evidence_sha256.independent_restore=stageCEvidenceSha256(value.restore);
  value.evidence_sha256.rollback_rehearsal=stageCEvidenceSha256(value.rollback);
  value.evidence_sha256.physical_devices=stageCEvidenceSha256(value.devices);
  value.bundle_sha256=stageCBundleSha256(value);
  return value;
}

test('Stage-C release bundle accepts the canonical 3600-second rollback rehearsal boundary',()=>{
  const result=validateStageCReleaseBundle(bundle(3600),SHA);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('Stage-C release bundle rejects rollback rehearsal evidence above 3600 seconds even with recomputed digests',()=>{
  const result=validateStageCReleaseBundle(bundle(3601),SHA);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/between 0 and 3600/);
});
