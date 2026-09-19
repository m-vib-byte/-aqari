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
      counts_by_kind:{payment:9,receipt:6},
      checkpoint_records_sha256:DIGEST_A,
      during_records_sha256:DIGEST_B,
      after_records_sha256:DIGEST_C,
      ...overrides,
    },
  };
}

test('accepts distinct checkpoint, new-subset and final-union digests with reconciled counts',()=>{
  const result=validateStageCRollbackContinuity(bundle());
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects a final digest that aliases either subset digest',()=>{
  for(const [after_records_sha256,pattern] of [
    [DIGEST_A,/checkpoint subset digest/],
    [DIGEST_B,/during-window new-transaction subset digest/],
  ]){
    const result=validateStageCRollbackContinuity(bundle({after_records_sha256}));
    assert.equal(result.ok,false);
    assert.match(result.errors.join('\n'),pattern);
  }
});

test('rejects a rehearsal that claims new transactions but checkpoint and new subset digests are identical',()=>{
  const result=validateStageCRollbackContinuity(bundle({during_records_sha256:DIGEST_A}));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/distinct newly-created transaction subset/);
});

test('requires proof that at least one new transaction was created with safe integer record counts',()=>{
  for(const overrides of [
    {new_record_count:undefined},
    {new_record_count:0,after_record_count:12},
    {new_record_count:-1,after_record_count:11},
    {new_record_count:1.5,after_record_count:13.5},
    {new_record_count:'3'},
    {new_record_count:Number.MAX_SAFE_INTEGER+1},
  ]){
    const result=validateStageCRollbackContinuity(bundle(overrides));
    assert.equal(result.ok,false,JSON.stringify(overrides));
    assert.match(result.errors.join('\n'),/positive integer new_record_count/);
  }
});

test('requires checkpoint and after counts to be positive safe integers',()=>{
  for(const overrides of [
    {checkpoint_record_count:0,after_record_count:3},
    {checkpoint_record_count:1.5,after_record_count:4.5},
    {after_record_count:0},
    {after_record_count:'15'},
  ]){
    const result=validateStageCRollbackContinuity(bundle(overrides));
    assert.equal(result.ok,false,JSON.stringify(overrides));
  }
});

test('requires the final transaction count to preserve the checkpoint plus every newly created transaction',()=>{
  const result=validateStageCRollbackContinuity(bundle({after_record_count:14}));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/must equal checkpoint_record_count \+ new_record_count/);
});

test('requires counts_by_kind to be non-empty, safe and exactly reconcile to the final transaction count',()=>{
  for(const counts_by_kind of [
    undefined,
    {},
    {payment:15,receipt:-1},
    {'':15},
    {payment:Number.MAX_SAFE_INTEGER+1},
    {payment:8,receipt:6},
  ]){
    const result=validateStageCRollbackContinuity(bundle({counts_by_kind}));
    assert.equal(result.ok,false,JSON.stringify(counts_by_kind));
    assert.match(result.errors.join('\n'),/counts_by_kind/);
  }
});

test('accepts the exact 3600-second rollback window boundary',()=>{
  const result=validateStageCRollbackContinuity(bundle({rehearsal_window_seconds:3600}));
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('rejects rollback evidence that exceeds the one-hour rehearsal window',()=>{
  const result=validateStageCRollbackContinuity(bundle({rehearsal_window_seconds:3601}));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/no greater than 3600 seconds/);
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
