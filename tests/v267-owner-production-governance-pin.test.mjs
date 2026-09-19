import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_REPOSITORY_OWNER,
  OWNER_GOVERNANCE_EFFECTIVE_AT,
  REQUIRED_DECISION,
  validateOwnerProductionApproval,
} from '../scripts/v267-owner-production-approval.mjs';

const SHA='861cfac1fea37f38d878526fea9422b63d216852';

function base(){
  return {
    candidateSha:SHA,
    finalTestedSha:SHA,
    approvedSha:SHA,
    decision:REQUIRED_DECISION,
    finalTestCompletedAt:'2026-09-13T00:00:00+03:00',
    approvedAt:'2026-09-13T00:05:00+03:00',
    approvalActor:EXPECTED_REPOSITORY_OWNER,
    repositoryOwner:EXPECTED_REPOSITORY_OWNER,
    releaseGateManifest:{},
  };
}

test('rejects a self-declared alternate repository owner even when the approval actor matches it',()=>{
  const result=validateOwnerProductionApproval({
    ...base(),
    approvalActor:'alternate-maintainer',
    repositoryOwner:'alternate-maintainer',
  });
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/repository owner must be exactly m-vib-byte/);
  assert.match(result.errors.join('\n'),/dispatched by m-vib-byte/);
});

test('rejects replayed final-test and approval timestamps from before the controlling 13 Sep 2026 Kuwait governance',()=>{
  const result=validateOwnerProductionApproval({
    ...base(),
    finalTestCompletedAt:'2026-09-12T23:50:00+03:00',
    approvedAt:'2026-09-12T23:55:00+03:00',
  });
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/controlling owner governance effective/);
  assert.equal(OWNER_GOVERNANCE_EFFECTIVE_AT,'2026-09-13T00:00:00+03:00');
});

test('owner identity remains case-insensitive but pinned to the actual repository owner',()=>{
  const result=validateOwnerProductionApproval({
    ...base(),
    approvalActor:'M-VIB-BYTE',
    repositoryOwner:'M-VIB-BYTE',
  });
  assert.doesNotMatch(result.errors.join('\n'),/repository owner must be exactly|dispatched by m-vib-byte/);
});
