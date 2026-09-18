import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_C_BUNDLE_FORMAT,
  stageCEvidenceSha256,
  stageCBundleSha256,
  validateStageCReleaseBundle,
} from '../scripts/v267-stage-c-release-bundle-gate.mjs';
import {validateExactPreviewBinding,validateOwnerProductionApprovalForCli} from '../scripts/v267-owner-production-approval.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';
const OTHER_SHA='13a219e7930db89ebf2f9b44d30007499efa6ccf';
const ROLLBACK_SHA='2'.repeat(40);
const REHEARSAL_ID='3'.repeat(32);
const DIGEST='a'.repeat(64);
const PREVIEW_DEPLOYMENT='dpl_AqariExactPreview123';
const PREVIEW_URL='https://aqari-exact-preview-123.vercel.app';
const AQARI_PREVIEW_URL='https://aqari-exact-preview-123-m-vib-5421.vercel.app';
const REQUIRED_FLOWS=['login','session','save','reopen','permissions','contracts','printing'];

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
    device_instance:`physical-${deviceClass}-01`,
    browser:deviceClass==='desktop'?'Chrome':'Mobile Safari',
    flows:{login:true,session:true,save:true,reopen:true,permissions:true,contracts:true,printing:true},
    flow_evidence:flowEvidence,
    evidence:Object.values(flowEvidence).flat().sort(),
  };
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
      backup_set:DIGEST,
      backup_storage_bytes:'b'.repeat(64),
      independent_restore:'c'.repeat(64),
      rollback_rehearsal:'d'.repeat(64),
      physical_devices:'e'.repeat(64),
    },
    storage:{object_count:2,total_bytes:156509,manifest_sha256:'f'.repeat(64)},
    restore:{
      format:'AQARI-V267-RESTORE-EQUIVALENCE-1',
      verified:true,
      candidate_sha:SHA,
      source_project_ref:'aqari-preview-source',
      restore_project_ref:'aqari-preview-restore',
      source_generated_at:'2026-09-17T06:00:10Z',
      restored_generated_at:'2026-09-17T06:10:10Z',
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

function recompute(value){
  value.bundle_sha256=stageCBundleSha256(value);
  return value;
}

test('accepts only a canonical Stage-C bundle tied to the exact candidate, Preview deployment and independent restore project',()=>{
  const result=validateStageCReleaseBundle(validBundle(),SHA);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects mixed candidate, same-project restore, byte digest drift, rollback loss, or nonphysical device evidence',()=>{
  const mutations=[
    (b)=>{b.candidate_sha=OTHER_SHA},
    (b)=>{b.restore_project_ref=b.source_project_ref},
    (b)=>{b.storage.manifest_sha256='bad'},
    (b)=>{b.rollback.after_record_count=14},
    (b)=>{b.devices.desktop.physical=false},
    (b)=>{b.devices.iphone.real_account=false},
    (b)=>{b.devices.ipad.flows.printing=false},
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    recompute(value);
    assert.equal(validateStageCReleaseBundle(value,SHA).ok,false);
  }
});

test('rejects device evidence from a different, non-Preview, or mutable hosted target even when commit SHA matches',()=>{
  const mutations=[
    (b)=>{b.devices.iphone.preview_deployment_id='dpl_DifferentDeployment456'},
    (b)=>{b.devices.ipad.preview_url='https://aqari-other-preview.vercel.app'},
    (b)=>{b.preview.environment='production'},
    (b)=>{b.preview.release_stage='production'},
    (b)=>{b.preview.url='https://myaqari.com'},
    (b)=>{b.preview.candidate_sha=OTHER_SHA},
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    recompute(value);
    const result=validateStageCReleaseBundle(value,SHA);
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),/Preview|preview/);
  }
});

test('rejects independent restore evidence without canonical forward chronology or matching source/target identity',()=>{
  const mutations=[
    (b)=>{delete b.restore.source_generated_at},
    (b)=>{b.restore.source_generated_at='2026-09-17T06:00:10+00:00'},
    (b)=>{b.restore.restored_generated_at=b.restore.source_generated_at},
    (b)=>{b.restore.restored_generated_at='2026-09-17T05:59:59Z'},
    (b)=>{b.restore.restored_generated_at='2026-02-30T06:10:10Z'},
    (b)=>{b.restore.source_project_ref='another-source-project'},
    (b)=>{b.restore.restore_project_ref='another-restore-project'},
    (b)=>{b.restore.candidate_sha=OTHER_SHA},
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    value.evidence_sha256.independent_restore=stageCEvidenceSha256(value.restore);
    recompute(value);
    const result=validateStageCReleaseBundle(value,SHA);
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),/restore|restored|source/i);
  }
});

test('rejects rollback evidence that does not prove both pre-existing and newly created transactions',()=>{
  const mutations=[
    (b)=>{
      b.rollback.checkpoint_record_count=0;
      b.rollback.after_record_count=b.rollback.new_record_count;
      b.rollback.counts_by_kind={payment:b.rollback.new_record_count};
    },
    (b)=>{
      b.rollback.new_record_count=0;
      b.rollback.after_record_count=b.rollback.checkpoint_record_count;
      b.rollback.counts_by_kind={payment:b.rollback.checkpoint_record_count};
    },
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    recompute(value);
    const result=validateStageCReleaseBundle(value,SHA);
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),/positive integer proving/);
  }
});

test('rejects rollback summaries that bypass the verified same-rehearsal and data-preserving semantics',()=>{
  const mutations=[
    (b)=>{delete b.rollback.rehearsal_id},
    (b)=>{b.rollback.rehearsal_id='A'.repeat(32)},
    (b)=>{b.rollback.verified=false},
    (b)=>{b.rollback.candidate_sha=OTHER_SHA},
    (b)=>{b.rollback.rollback_application_sha=SHA},
    (b)=>{b.rollback.database_project_ref='another-source-project'},
    (b)=>{b.rollback.database_rollback_performed=true},
    (b)=>{b.rollback.rehearsal_window_seconds=-1},
    (b)=>{b.rollback.counts_by_kind={payment:15,receipt:1}},
    (b)=>{b.rollback.checkpoint_records_sha256='bad'},
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    recompute(value);
    const result=validateStageCReleaseBundle(value,SHA);
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),/rollback|rehearsal/i);
  }
});

test('rejects generic, reused, incomplete or mismatched physical-device flow evidence',()=>{
  const mutations=[
    (b)=>{delete b.devices.desktop.flow_evidence},
    (b)=>{b.devices.iphone.flow_evidence.login=['evidence/shared.json'];b.devices.iphone.flow_evidence.session=['evidence/shared.json'];b.devices.iphone.evidence=Object.values(b.devices.iphone.flow_evidence).flat().sort()},
    (b)=>{b.devices.ipad.flow_evidence.printing=[];b.devices.ipad.evidence=Object.values(b.devices.ipad.flow_evidence).flat().sort()},
    (b)=>{b.devices.desktop.evidence=['evidence/desktop/login.json']},
    (b)=>{b.devices.ipad.flow_evidence.login=[b.devices.iphone.flow_evidence.login[0]];b.devices.ipad.evidence=Object.values(b.devices.ipad.flow_evidence).flat().sort()},
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    recompute(value);
    const result=validateStageCReleaseBundle(value,SHA);
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),/evidence|flow/);
  }
});

test('rejects embedded Storage, restore, rollback, or physical-device tampering even when bundle_sha256 is recomputed',()=>{
  const mutations=[
    (b)=>{b.storage.total_bytes+=1},
    (b)=>{b.restore.restored_generated_at='2026-09-17T06:11:10Z'},
    (b)=>{b.rollback.rehearsal_window_seconds+=1},
    (b)=>{b.devices.desktop.browser='Chrome Stable - altered'},
  ];
  for(const mutate of mutations){
    const value=validBundle();
    mutate(value);
    recompute(value);
    const result=validateStageCReleaseBundle(value,SHA);
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),/evidence digest/i);
  }
});

test('rejects tampering when the canonical bundle digest is not recomputed',()=>{
  const value=validBundle();
  value.rollback.new_record_count=4;
  assert.equal(validateStageCReleaseBundle(value,SHA).ok,false);
  assert.match(validateStageCReleaseBundle(value,SHA).errors.join('\n'),/bundle_sha256/);
});

test('owner Production preview binding requires the exact AQARI Vercel hostname and deployment identity',()=>{
  const stageCBundle=validBundle();
  stageCBundle.preview.url=AQARI_PREVIEW_URL;
  const manifest={
    hostedPreview:{url:`${AQARI_PREVIEW_URL}/app?release=V267`,deploymentId:PREVIEW_DEPLOYMENT},
    stageCBundle,
  };
  const accepted=validateExactPreviewBinding(manifest);
  assert.equal(accepted.ok,true,JSON.stringify(accepted.errors));

  const mutations=[
    (m)=>{m.hostedPreview.deploymentId='dpl_DifferentDeployment456'},
    (m)=>{m.stageCBundle.preview.url='https://aqari-other-build-m-vib-5421.vercel.app'},
    (m)=>{m.stageCBundle.preview.url='https://aqari-test-build-m-vib-5421.vercel.app'},
    (m)=>{m.stageCBundle.preview.url='https://unrelated-preview.vercel.app'},
  ];
  for(const mutate of mutations){
    const value=JSON.parse(JSON.stringify(manifest));
    mutate(value);
    const result=validateExactPreviewBinding(value);
    assert.equal(result.ok,false,JSON.stringify(value));
    assert.match(result.errors.join('\n'),/Preview|preview|deployment|hostname|AQARI/);
  }
});

test('owner Production CLI path fails closed when deterministic Stage-C bundle is absent',()=>{
  const result=validateOwnerProductionApprovalForCli({
    candidateSha:SHA,
    finalTestedSha:SHA,
    approvedSha:SHA,
    decision:'approved_for_production',
    finalTestCompletedAt:'2026-09-17T09:00:00+03:00',
    approvedAt:'2026-09-17T09:01:00+03:00',
    approvalActor:'m-vib-byte',
    repositoryOwner:'m-vib-byte',
    releaseGateManifest:{},
  });
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/release gate Stage C bundle/);
});