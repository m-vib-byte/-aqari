import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_GOVERNANCE_POLICY_ID,
  REQUIRED_DEVICE_FLOWS,
  validateReleaseGateManifest,
} from '../scripts/v267-release-gate-manifest.mjs';

const SHA = '861cfac1fea37f38d878526fea9422b63d216852';
const OTHER_SHA = '13a219e7930db89ebf2f9b44d30007499efa6ccf';
const PREVIEW_URL = 'https://requirements-proof.vercel.app/app?release=V267';
const DEPLOYMENT_ID = 'dpl_Requirements155Proof123';

function requirementItems() {
  return Array.from({ length: 155 }, (_, index) => ({
    id: index + 1,
    status: 'accepted',
    commitSha: SHA,
    evidence: [`evidence/requirements/${String(index + 1).padStart(3, '0')}.json`],
  }));
}

function device(name) {
  return {
    accepted: true,
    realAccount: true,
    simulated: false,
    emulated: false,
    physical: true,
    browser: name === 'Desktop' ? 'Chrome' : 'Mobile Safari',
    device: name,
    commitSha: SHA,
    hostedPreviewUrl: PREVIEW_URL,
    deploymentId: DEPLOYMENT_ID,
    flows: Object.fromEntries(REQUIRED_DEVICE_FLOWS.map((flow) => [flow, true])),
    evidence: [`evidence/devices/${name.toLowerCase()}.json`],
  };
}

function fullManifest() {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    status: 'accepted',
    ownerGovernance: {
      policyId: OWNER_GOVERNANCE_POLICY_ID,
      candidateSha: SHA,
      automaticProductionAuthorization: false,
      previewApprovalCountsAsProductionApproval: false,
      finalOwnerPracticalTestRequired: true,
      laterExactShaProductionApprovalRequired: true,
      evidence: ['evidence/governance.json'],
    },
    requirements155: {
      accepted: true,
      acceptedCount: 155,
      evidence: ['evidence/requirements/index.json'],
      items: requirementItems(),
    },
    ci: {
      allRequiredPassed: true,
      commitSha: SHA,
      evidence: ['evidence/ci.json'],
    },
    hostedPreview: {
      accepted: true,
      applicationRuntimeReached: true,
      realAccountTested: true,
      buildReadyOnly: false,
      simulated: false,
      commitSha: SHA,
      runtimeGitSha: SHA,
      deploymentId: DEPLOYMENT_ID,
      releaseStage: 'preview',
      environment: 'preview',
      url: PREVIEW_URL,
      evidence: ['evidence/preview.json'],
    },
    devices: {
      desktop: device('Desktop'),
      iphone: device('iPhone'),
      ipad: device('iPad'),
    },
    backup: {
      current: true,
      database: true,
      auth: true,
      storage: true,
      attachmentBytesIncluded: true,
      evidence: ['evidence/backup.json'],
    },
    restore: {
      independent: true,
      passed: true,
      attachmentBytesVerified: true,
      evidence: ['evidence/restore.json'],
    },
    rollback: {
      tested: true,
      preservesCurrentTransactions: true,
      preservesNewTransactions: true,
      evidence: ['evidence/rollback.json'],
    },
    productionConfig: {
      correct: true,
      candidateSha: SHA,
      evidence: ['evidence/production-config.json'],
    },
  };
}

test('accepts a complete 1..155 per-item evidence matrix on the exact candidate', () => {
  const result = validateReleaseGateManifest(fullManifest(), SHA);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('rejects aggregate 155/155 booleans without 155 individual requirement records', () => {
  const manifest = fullManifest();
  delete manifest.requirements155.items;
  const result = validateReleaseGateManifest(manifest, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /exactly 155 requirement records/);
});

test('rejects duplicate or missing requirement ids even when acceptedCount remains 155', () => {
  const manifest = fullManifest();
  manifest.requirements155.items[154].id = 154;
  const result = validateReleaseGateManifest(manifest, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicated|cover every requirement id/);
});

test('rejects per-requirement evidence that is stale, unaccepted, or empty', () => {
  for (const mutate of [
    (m) => { m.requirements155.items[0].commitSha = OTHER_SHA; },
    (m) => { m.requirements155.items[1].status = 'partial'; },
    (m) => { m.requirements155.items[2].evidence = []; },
  ]) {
    const manifest = fullManifest();
    mutate(manifest);
    const result = validateReleaseGateManifest(manifest, SHA);
    assert.equal(result.ok, false, JSON.stringify(result.errors));
  }
});
