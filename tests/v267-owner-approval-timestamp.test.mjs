import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnerProductionApproval} from '../scripts/v267-owner-production-approval.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';

function input(patch={}){
  return {
    candidateSha:SHA,
    finalTestedSha:SHA,
    approvedSha:SHA,
    decision:'approved_for_production',
    finalTestCompletedAt:'2026-09-18T12:00:00+03:00',
    approvedAt:'2026-09-18T12:05:00+03:00',
    approvalActor:'m-vib-byte',
    repositoryOwner:'m-vib-byte',
    releaseGateManifest:{},
    ...patch,
  };
}

function timestampErrors(result){
  return result.errors.filter((error)=>/timestamp|after final owner testing|governance effective/i.test(error));
}

test('accepts canonical second-precision owner chronology with an explicit UTC or offset timezone',()=>{
  const cases=[
    input(),
    input({
      finalTestCompletedAt:'2026-09-18T09:00:00Z',
      approvedAt:'2026-09-18T09:05:00Z',
    }),
  ];
  for(const value of cases){
    const result=validateOwnerProductionApproval(value);
    assert.deepEqual(timestampErrors(result),[],JSON.stringify(result.errors));
  }
});

test('rejects ambiguous, date-only, fractional, impossible, or timezone-free owner timestamps',()=>{
  const malformed=[
    {finalTestCompletedAt:'2026-09-18'},
    {finalTestCompletedAt:'2026-09-18T12:00:00'},
    {finalTestCompletedAt:'2026-09-18T12:00:00.000Z'},
    {finalTestCompletedAt:'September 18, 2026 12:00:00 GMT+0300'},
    {finalTestCompletedAt:'2026-02-30T12:00:00+03:00'},
    {approvedAt:'2026-09-18'},
    {approvedAt:'2026-09-18T12:05:00'},
    {approvedAt:'2026-09-18T12:05:00.000Z'},
    {approvedAt:'2026-09-18T12:05:00+14:01'},
  ];
  for(const patch of malformed){
    const result=validateOwnerProductionApproval(input(patch));
    assert.equal(result.ok,false,JSON.stringify(patch));
    assert.match(result.errors.join('\n'),/canonical ISO-8601 second precision with an explicit timezone/);
  }
});

test('compares owner test and approval chronologically across different explicit offsets',()=>{
  const result=validateOwnerProductionApproval(input({
    finalTestCompletedAt:'2026-09-18T12:00:00+03:00',
    approvedAt:'2026-09-18T08:59:59Z',
  }));
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/must occur after final owner testing/);
});
