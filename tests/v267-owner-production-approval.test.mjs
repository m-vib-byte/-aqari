import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_DECISION,
  validateOwnerProductionApproval,
} from '../scripts/v267-owner-production-approval.mjs';
import {
  OWNER_GOVERNANCE_POLICY_ID,
  validateReleaseGateManifest,
} from '../scripts/v267-release-gate-manifest.mjs';

const SHA = '861cfac1fea37f38d878526fea9422b63d216852';
const OTHER_SHA = '13a219e7930db89ebf2f9b44d30007499efa6ccf';

function deviceEvidence({ physical = false } = {}) {
  return {
    accepted: true,
    realAccount: true,
    ...(physical ? { physical: true } : {}),
    commitSha: SHA,
    flows: {
      login: true,
      session: true,
      save: true,
      reopen: true,
      permissions: true,
      contracts: true,
      printing: true,
    },
    evidence: ['evidence/device-run.json'],
  };
}

function fullGateManifest() {
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
      evidence: ['docs/V267-OWNER-GOVERNANCE-2026-09-13.json'],
    },
    requirements155: {
      accepted: true,
      acceptedCount: 155,
      evidence: ['docs/V267-REQUIREMENTS-155.md'],
    },
    ci: {
      allRequiredPassed: true,
      commitSha: SHA,
      evidence: ['https://github.com/m-vib-byte/-aqari/actions/runs/123'],
    },
    hostedPreview: {
      accepted: true,
      commitSha: SHA,
      url: 'https://example-preview.vercel.app/app?release=V267',
      evidence: ['evidence/preview-smoke.json'],
    },
    devices: {
      desktop: deviceEvidence(),
      iphone: deviceEvidence({ physical: true }),
      ipad: deviceEvidence({ physical: true }),
    },
    backup: {
      current: true,
      database: true,
      auth: true,
      storage: true,
      attachmentBytesIncluded: true,
      evidence: ['evidence/backup-manifest.json'],
    },
    restore: {
      independent: true,
      passed: true,
      attachmentBytesVerified: true,
      evidence: ['evidence/restore-report.json'],
    },
    rollback: {
      tested: true,
      preservesCurrentTransactions: true,
      preservesNewTransactions: true,
      evidence: ['evidence/rollback-report.json'],
    },
    productionConfig: {
      correct: true,
      candidateSha: SHA,
      evidence: ['evidence/production-config.json'],
    },
  };
}

const BASE = {
  candidateSha: SHA,
  finalTestedSha: SHA,
  approvedSha: SHA,
  decision: REQUIRED_DECISION,
  finalTestCompletedAt: '2026-09-13T00:00:00+03:00',
  approvedAt: '2026-09-13T00:05:00+03:00',
  approvalActor: 'm-vib-byte',
  repositoryOwner: 'm-vib-byte',
  releaseGateManifest: fullGateManifest(),
};

test('passes only when the full technical gate, final testing, and later production approval target the exact candidate', () => {
  assert.equal(validateOwnerProductionApproval(BASE).ok, true);
});

test('rejects owner production approval when the full release gate manifest is missing', () => {
  const result = validateOwnerProductionApproval({ ...BASE, releaseGateManifest: undefined });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /full release gate manifest is required/);
});

test('release gate validator fails closed across every owner-mandated technical gate', () => {
  const mutations = [
    (m) => { m.requirements155.acceptedCount = 154; },
    (m) => { m.ci.allRequiredPassed = false; },
    (m) => { m.hostedPreview.accepted = false; },
    (m) => { m.devices.desktop.flows.reopen = false; },
    (m) => { m.devices.iphone.physical = false; },
    (m) => { m.devices.ipad.realAccount = false; },
    (m) => { m.backup.attachmentBytesIncluded = false; },
    (m) => { m.restore.independent = false; },
    (m) => { m.rollback.preservesNewTransactions = false; },
    (m) => { m.productionConfig.correct = false; },
  ];

  for (const mutate of mutations) {
    const manifest = fullGateManifest();
    mutate(manifest);
    const result = validateReleaseGateManifest(manifest, SHA);
    assert.equal(result.ok, false, JSON.stringify(result.errors));
  }
});

test('release gate validator rejects superseded automatic-production authorization semantics', () => {
  const mutations = [
    (m) => { delete m.ownerGovernance; },
    (m) => { m.ownerGovernance.policyId = 'owner-governance-2026-09-12'; },
    (m) => { m.ownerGovernance.candidateSha = OTHER_SHA; },
    (m) => { m.ownerGovernance.automaticProductionAuthorization = true; },
    (m) => { m.ownerGovernance.previewApprovalCountsAsProductionApproval = true; },
    (m) => { m.ownerGovernance.finalOwnerPracticalTestRequired = false; },
    (m) => { m.ownerGovernance.laterExactShaProductionApprovalRequired = false; },
    (m) => { m.ownerGovernance.evidence = []; },
  ];

  for (const mutate of mutations) {
    const manifest = fullGateManifest();
    mutate(manifest);
    const result = validateReleaseGateManifest(manifest, SHA);
    assert.equal(result.ok, false, JSON.stringify(result.errors));
  }
});

test('release gate validator rejects evidence attached to any different candidate SHA', () => {
  for (const patch of [
    (m) => { m.candidateSha = OTHER_SHA; },
    (m) => { m.ownerGovernance.candidateSha = OTHER_SHA; },
    (m) => { m.ci.commitSha = OTHER_SHA; },
    (m) => { m.hostedPreview.commitSha = OTHER_SHA; },
    (m) => { m.devices.iphone.commitSha = OTHER_SHA; },
    (m) => { m.productionConfig.candidateSha = OTHER_SHA; },
  ]) {
    const manifest = fullGateManifest();
    patch(manifest);
    const result = validateReleaseGateManifest(manifest, SHA);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /exact candidate SHA/);
  }
});

test('release gate validator requires concrete evidence references, not boolean assertions alone', () => {
  const manifest = fullGateManifest();
  manifest.ownerGovernance.evidence = [];
  manifest.requirements155.evidence = [];
  manifest.ci.evidence = [];
  manifest.hostedPreview.evidence = [];
  manifest.devices.desktop.evidence = [];
  manifest.backup.evidence = [];
  manifest.restore.evidence = [];
  manifest.rollback.evidence = [];
  manifest.productionConfig.evidence = [];
  const result = validateReleaseGateManifest(manifest, SHA);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 9);
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

test('rejects production approval dispatched by anyone other than the repository owner', () => {
  for (const approvalActor of ['maintainer-user', '', 'M-VIB-BYTE-OTHER']) {
    const result = validateOwnerProductionApproval({ ...BASE, approvalActor });
    assert.equal(result.ok, false, approvalActor);
  }
  assert.match(
    validateOwnerProductionApproval({ ...BASE, approvalActor: 'maintainer-user' }).errors.join('\n'),
    /repository owner/,
  );
});

test('repository-owner actor comparison is case-insensitive', () => {
  const result = validateOwnerProductionApproval({ ...BASE, approvalActor: 'M-VIB-BYTE' });
  assert.equal(result.ok, true);
});

test('rejects short, missing, or malformed SHAs, timestamps, and owner identity', () => {
  const cases = [
    { candidateSha: '861cfac1' },
    { finalTestedSha: '' },
    { approvedSha: 'not-a-sha' },
    { finalTestCompletedAt: 'not-a-date' },
    { approvedAt: '' },
    { repositoryOwner: '' },
  ];
  for (const patch of cases) {
    assert.equal(validateOwnerProductionApproval({ ...BASE, ...patch }).ok, false);
  }
});
