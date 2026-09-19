import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_C_BUNDLE_FORMAT,
  stageCEvidenceSha256,
  stageCBundleSha256,
  validateStageCReleaseBundle,
} from '../scripts/v267-stage-c-release-bundle-gate.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';
const ROLLBACK_SHA='2'.repeat(40);
const REHEARSAL_ID='3'.repeat(32);
const PREVIEW_DEPLOYMENT='dpl_AqariSafeIntegerPreview123';
const PREVIEW_URL='https://aqari-safe-integer-preview.vercel.app';
const REQUIRED_FLOWS=['login','session','save','reopen','permissions','contracts','printing'];
const UNSAFE=Number.MAX_SAFE_INTEGER+1;

function device(deviceClass){
  const flowEvidence=Object.fromEntries(REQUIRED_FLOWS.map((flow)=>[flow,[`evidence/${deviceClass}/${flow}.json`]]));
  return {
    accepted:true,
    real_account:true,
    simulated:false,
    emulated:false,
    physical:true,
    candidate_sha:SHA,
    preview_deployment_id:PREVIEW_DEPLOYMENT,
    preview_url:PREVIEW_URL,
    device_instance:`physical-${deviceClass}-safe-int`,
    browser:deviceClass==='desktop'?'Chrome':'Mobile Safari',
    flows:Object.fromEntries(REQUIRED_FLOWS.map((flow)=>[flow,true])),
    flow_evidence:flowEvidence,
    evidence:Object.values(flowEvidence).flat().sort(),
  };
}

function refreshDigests(value){
  value.evidence_sha256.backup_set=stageCEvidenceSha256(value.backup);
  value.evidence_sha256.backup_storage_bytes=stageCEvidenceSha256({
    format:'AQARI-V267-STORAGE-BYTE-MANIFEST-1',
    verified:true,
    object_count:value.storage.object_count,
    total_bytes:value.storage.total_bytes,
    manifest_sha256:value.storage.manifest_sha256,
  });
  value.evidence_sha256.independent_restore=stageCEvidenceSha256(value.restore);
  value.evidence_sha256.rollback_rehearsal=stageCEvidenceSha256(value.rollback);
  value.evidence_sha256.physical_devices=stageCEvidenceSha256(value.devices);
  value.bundle_sha256=stageCBundleSha256(value);
  return value;
}

function validBundle(){
  const value={
    format:STAGE_C_BUNDLE_FORMAT,
    accepted:true,
    candidate_sha:SHA,
    source_project_ref:'aqari-preview-source',
    restore_project_ref:'aqari-preview-restore',
    preview:{
      deployment_id:PREVIEW_DEPLOYMENT,
      url:PREVIEW_URL,
      candidate_sha:SHA,
      environment:'preview',
      release_stage:'preview',
    },
    evidence_sha256:{
      backup_set:'a'.repeat(64),
      backup_storage_bytes:'b'.repeat(64),
      independent_restore:'c'.repeat(64),
      rollback_rehearsal:'d'.repeat(64),
      physical_devices:'e'.repeat(64),
    },
    storage:{object_count:2,total_bytes:156509,manifest_sha256:'f'.repeat(64)},
    backup:{
      format:'AQARI-V267-BACKUP-SET-MANIFEST-1',
      candidate_sha:SHA,
      project_ref:'aqari-preview-source',
      capture_started_at:'2026-09-19T08:00:00Z',
      capture_finished_at:'2026-09-19T08:00:30Z',
      capture_window_seconds:30,
      components:{
        database:{bytes:1000,sha256:'8'.repeat(64)},
        auth:{bytes:200,sha256:'9'.repeat(64)},
        storage:{
          bytes:300,
          sha256:'a'.repeat(64),
          object_count:2,
          object_bytes:156509,
          storage_manifest_sha256:'f'.repeat(64),
        },
      },
    },
    restore:{
      format:'AQARI-V267-RESTORE-EQUIVALENCE-1',
      verified:true,
      candidate_sha:SHA,
      source_project_ref:'aqari-preview-source',
      restore_project_ref:'aqari-preview-restore',
      source_generated_at:'2026-09-19T08:00:10Z',
      restored_generated_at:'2026-09-19T08:10:10Z',
      section_sha256:{
        business:'4'.repeat(64),
        schema_safe:'5'.repeat(64),
        auth_safe:'6'.repeat(64),
        storage_safe:'7'.repeat(64),
      },
      storage_object_count:2,
      storage_total_bytes:156509,
      storage_manifest_sha256:'f'.repeat(64),
    },
    rollback:{
      format:'AQARI-V267-ROLLBACK-REHEARSAL-1',
      verified:true,
      candidate_sha:SHA,
      rollback_application_sha:ROLLBACK_SHA,
      rehearsal_id:REHEARSAL_ID,
      database_project_ref:'aqari-preview-source',
      database_rollback_performed:false,
      rehearsal_window_seconds:180,
      checkpoint_record_count:12,
      new_record_count:3,
      after_record_count:15,
      counts_by_kind:{payment:9,receipt:6},
      checkpoint_records_sha256:'1'.repeat(64),
      during_records_sha256:'2'.repeat(64),
      after_records_sha256:'3'.repeat(64),
    },
    devices:{desktop:device('desktop'),iphone:device('iphone'),ipad:device('ipad')},
  };
  return refreshDigests(value);
}

test('baseline Stage-C bundle remains accepted',()=>{
  const result=validateStageCReleaseBundle(validBundle(),SHA);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects unsafe storage byte totals even when every correlated field and digest is recomputed',()=>{
  const value=validBundle();
  value.storage.total_bytes=UNSAFE;
  value.backup.components.storage.object_bytes=UNSAFE;
  value.restore.storage_total_bytes=UNSAFE;
  refreshDigests(value);
  const result=validateStageCReleaseBundle(value,SHA);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/Storage total bytes|Storage object bytes|restored Storage bytes/i);
});

test('rejects unsafe backup component byte sizes with otherwise self-consistent evidence',()=>{
  const value=validBundle();
  value.backup.components.database.bytes=UNSAFE;
  refreshDigests(value);
  const result=validateStageCReleaseBundle(value,SHA);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/backup database byte size/i);
});

test('rejects unsafe rollback counters even when arithmetic and counts-by-kind reconcile',()=>{
  const value=validBundle();
  value.rollback.checkpoint_record_count=UNSAFE;
  value.rollback.new_record_count=2;
  value.rollback.after_record_count=UNSAFE+2;
  value.rollback.counts_by_kind={payment:UNSAFE,receipt:2};
  refreshDigests(value);
  const result=validateStageCReleaseBundle(value,SHA);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/checkpoint_record_count|counts_by_kind|after_record_count/i);
});
