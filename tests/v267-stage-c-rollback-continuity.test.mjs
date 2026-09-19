import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStageCRollbackContinuity} from '../scripts/v267-stage-c-rollback-continuity.mjs';

const DIGEST_A='1'.repeat(64);
const DIGEST_B='2'.repeat(64);
const DIGEST_C='3'.repeat(64);

function bundle(overrides={}){
  return {
    rollback:{
      verified:true,
      rehearsal_window_seconds:180,
      checkpoint_record_count:12,
      new_record_count:3,
      after_record_count:15,
      checkpoint_records_sha256:DIGEST_A,
      during_records_sha256:DIGEST_B,
      after_records_sha256:DIGEST_B,
      ...overrides,
    },
  };
}

test('accepts a rollback rehearsal only when the pre-rollback and post-rollback canonical transaction sets are identical',()=>{
  const result=validateStageCRollbackContinuity(bundle());
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects a rollback rehearsal that loses or mutates current/new transactions after application rollback',()=>{
  const result=validateStageCRollbackContinuity(bundle({after_records_sha256:DIGEST_C}));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/during and after digests must match exactly/);
});

test('rejects a rehearsal that claims new transactions but the canonical set never changed',()=>{
  const result=validateStageCRollbackContinuity(bundle({during_records_sha256:DIGEST_A,after_records_sha256:DIGEST_A}));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/newly created transactions changed/);
});

test('rejects zero-duration or malformed continuity evidence',()=>{
  for(const overrides of [
    {rehearsal_window_seconds:0},
    {checkpoint_records_sha256:'bad'},
    {during_records_sha256:'bad'},
    {after_records_sha256:'bad'},
    {verified:false},
  ]){
    const result=validateStageCRollbackContinuity(bundle(overrides));
    assert.equal(result.ok,false,JSON.stringify(overrides));
  }
});
