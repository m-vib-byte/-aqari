import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_C_BUNDLE_FORMAT,
  stageCBundleSha256,
  validateStageCReleaseBundle,
} from '../scripts/v267-stage-c-release-bundle-gate.mjs';
import {validateOwnerProductionApprovalForCli} from '../scripts/v267-owner-production-approval.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';
const OTHER_SHA='13a219e7930db89ebf2f9b44d30007499efa6ccf';
const DIGEST='a'.repeat(64);

function device(deviceClass){
  return {
    accepted:true,
    real_account:true,
    simulated:false,
    emulated:false,
    physical:true,
    candidate_sha:SHA,
    device_instance:`physical-${deviceClass}-01`,
    browser:deviceClass==='desktop'?'Chrome':'Mobile Safari',
    flows:{login:true,session:true,save:true,reopen:true,permissions:true,contracts:true,printing:true},
    evidence:[`evidence/${deviceClass}.json`],
  };
}

function validBundle(){
  const value={
    format:STAGE_C_BUNDLE_FORMAT,
    accepted:true,
    candidate_sha:SHA,
    source_project_ref:'aqari-preview-source',
    restore_project_ref:'aqari-preview-restore',
    evidence_sha256:{
      backup_set:DIGEST,
      backup_storage_bytes:'b'.repeat(64),
      independent_restore:'c'.repeat(64),
      rollback_rehearsal:'d'.repeat(64),
      physical_devices:'e'.repeat(64),
    },
    storage:{object_count:2,total_bytes:156509,manifest_sha256:'f'.repeat(64)},
    rollback:{checkpoint_record_count:12,new_record_count:3,after_record_count:15},
    devices:{desktop:device('desktop'),iphone:device('iphone'),ipad:device('ipad')},
  };
  value.bundle_sha256=stageCBundleSha256(value);
  return value;
}

function recompute(value){
  value.bundle_sha256=stageCBundleSha256(value);
  return value;
}

test('accepts only a canonical Stage-C bundle tied to the exact candidate and independent restore project',()=>{
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

test('rejects tampering when the canonical bundle digest is not recomputed',()=>{
  const value=validBundle();
  value.rollback.new_record_count=4;
  assert.equal(validateStageCReleaseBundle(value,SHA).ok,false);
  assert.match(validateStageCReleaseBundle(value,SHA).errors.join('\n'),/bundle_sha256/);
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
