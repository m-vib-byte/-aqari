import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_DECISION,
  validateOwnerProductionApproval,
} from '../scripts/v267-owner-production-approval.mjs';

const SHA = '861cfac1fea37f38d878526fea9422b63d216852';
const OTHER_SHA = '13a219e7930db89ebf2f9b44d30007499efa6ccf';
const BASE = {
  candidateSha: SHA,
  finalTestedSha: SHA,
  approvedSha: SHA,
  decision: REQUIRED_DECISION,
  finalTestCompletedAt: '2026-09-13T00:00:00+03:00',
  approvedAt: '2026-09-13T00:05:00+03:00',
};

test('passes only when final testing and later production approval target the exact candidate', () => {
  assert.equal(validateOwnerProductionApproval(BASE).ok, true);
});

test('rejects design or preview approval as production approval', () => {
  for (const decision of ['approved', 'design_approved', 'preview_approved', 'luxury_approved', '']) {
    const result = validateOwnerProductionApproval({ ...BASE, decision });
    assert.equal(result.ok, false, decision);
    assert.match(result.errors.join('\n'), /preview\/design approval is not production approval/);
  }
});

test('rejects owner approval for a different SHA', () => {
  const result = validateOwnerProductionApproval({ ...BASE, approvedSha: OTHER_SHA });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /exact candidate SHA/);
});

test('rejects final testing performed on a different SHA', () => {
  const result = validateOwnerProductionApproval({ ...BASE, finalTestedSha: OTHER_SHA });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /final owner testing/);
});

test('rejects approval that predates or equals final testing', () => {
  for (const approvedAt of ['2026-09-12T23:59:59+03:00', BASE.finalTestCompletedAt]) {
    const result = validateOwnerProductionApproval({ ...BASE, approvedAt });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /must occur after final owner testing/);
  }
});

test('rejects short, missing, or malformed SHAs and timestamps', () => {
  const cases = [
    { candidateSha: '861cfac1' },
    { finalTestedSha: '' },
    { approvedSha: 'not-a-sha' },
    { finalTestCompletedAt: 'not-a-date' },
    { approvedAt: '' },
  ];
  for (const patch of cases) {
    assert.equal(validateOwnerProductionApproval({ ...BASE, ...patch }).ok, false);
  }
});
