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
const PREVIEW_DEPLOYMENT='dpl_AqariExactPreview123';
const PREVIEW_URL='https://aqari-exact-preview-123.vercel.app';
const FLOWS=['login','session','save','reopen','permissions','contracts','printing'];

function device(deviceClass){
  const flow_evidence=Object.fromEntries(FLOWS.map((flow)=>[flow,[`evidence/${deviceClass}/${flow}.json`]]));
  return {
    accepted:true,
    real_account:true,
    simulated:false,
    emulated:false,
    physical:true,
    candidate_sha:SHA,
    preview_deployment_id:PREVIEW_DEPLOYMENT,
    preview_url:PREVIEW_URL,
    device_instance:`physical-${deviceClass}-01`,
    browser:deviceClass==='desktop'?'Chrome':'Mobile Safari',
    flows:Object.fromEntries(FLOWS.map((flow)=>[flow,true])),
    flow_evidence,
    evidence:Object.values(flow_evidence).flat().sort(),
  };
}

function seal(value){
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
  return seal({
    format:STAGE_C_BUNDLE_FORMAT,
    accepted:true,
    candidate_sha:SHA,
    source_project_ref:'aqari-preview-source',
    restore_project_ref:'aqari-preview-restore',
    preview:{deployment_id:PREVIEW_DEPLOYMENT,url:PREVIEW_URL,candidate_sha:SHA,environment:'preview',release_stage:'preview'},
    evidence_sha256:{backup_set:'a'.repeat(64),backup_storage_bytes:'b'.repeat(64),independent_restore:'c'.repeat(64),rollback_rehearsal:'d'.repeat(64),physical_devices:'e'.repeat(64)},
    storage:{object_count:2,total_bytes:156509,manifest_sha256:'f'.repeat(64)},
    backup:{
      format:'AQARI-V267-BACKUP-SET-MANIFEST-1',candidate_sha:SHA,project_ref:'aqari-preview-source',
      capture_started_at:'2026-09-17T06:00:00Z',capture_finished_at:'2026-09-17T06:00:30Z',capture_window_seconds:30,
      components:{
        database:{bytes:1000,sha256:'8'.repeat(64)},
        auth:{bytes:200,sha256:'9'.repeat(64)},
        storage:{bytes:300,sha256:'a'.repeat(64),object_count:2,object_bytes:156509,storage_manifest_sha256:'f'.repeat(64)},
      },
    },
    restore:{
      format:'AQARI-V267-RESTORE-EQUIVALENCE-1',verified:true,candidate_sha:SHA,
      source_project_ref:'aqari-preview-source',restore_project_ref:'aqari-preview-restore',
      source_generated_at:'2026-09-17T06:00:10Z',restored_generated_at:'2026-09-17T06:10:10Z',
      section_sha256:{business:'4'.repeat(64),schema_safe:'5'.repeat(64),auth_safe:'6'.repeat(64),storage_safe:'7'.repeat(64)},
      storage_object_count:2,storage_total_bytes:156509,storage_manifest_sha256:'f'.repeat(64),
    },
    rollback:{
      format:'AQARI-V267-ROLLBACK-REHEARSAL-1',verified:true,candidate_sha:SHA,rollback_application_sha:ROLLBACK_SHA,
      rehearsal_id:'3'.repeat(32),database_project_ref:'aqari-preview-source',database_rollback_performed:false,
      rehearsal_window_seconds:180,checkpoint_record_count:12,new_record_count:3,after_record_count:15,
      counts_by_kind:{payment:9,receipt:6},checkpoint_records_sha256:'1'.repeat(64),during_records_sha256:'2'.repeat(64),after_records_sha256:'3'.repeat(64),
    },
    devices:{desktop:device('desktop'),iphone:device('iphone'),ipad:device('ipad')},
  });
}

function replaceDesktopLogin(value,ref){
  value.devices.desktop.flow_evidence.login=[ref];
  value.devices.desktop.evidence=Object.values(value.devices.desktop.flow_evidence).flat().sort();
  return seal(value);
}

test('keeps canonical Unicode repository evidence paths valid',()=>{
  const value=replaceDesktopLogin(validBundle(),'evidence/desktop/تسجيل-الدخول.json');
  const result=validateStageCReleaseBundle(value,SHA);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects percent-encoded, control-character and bidi-obfuscated evidence paths even after all digests are recomputed',()=>{
  const badRefs=[
    'evidence/desktop/%2e%2e/login.json',
    'evidence/desktop/login%3Fraw.json',
    'evidence/desktop/login\n.json',
    'evidence/desktop/login\t.json',
    'evidence/desktop/\u202Elogin.json',
    'evidence/desktop/\u2066login.json',
  ];
  for(const badRef of badRefs){
    const result=validateStageCReleaseBundle(replaceDesktopLogin(validBundle(),badRef),SHA);
    assert.equal(result.ok,false,JSON.stringify({badRef,errors:result.errors}));
    assert.match(result.errors.join('\n'),/canonical repository evidence paths/);
  }
});
