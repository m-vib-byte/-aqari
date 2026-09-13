import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
export const OWNER_GOVERNANCE_POLICY_ID = 'owner-governance-2026-09-13-kuwait';
export const REQUIRED_DEVICE_FLOWS = [
  'login',
  'session',
  'save',
  'reopen',
  'permissions',
  'contracts',
  'printing',
];

function normalizedSha(value) {
  return String(value || '').trim().toLowerCase();
}

function evidencePresent(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim());
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireTrue(errors, value, message) {
  if (value !== true) errors.push(message);
}

function requireFalse(errors, value, message) {
  if (value !== false) errors.push(message);
}

function requireSameSha(errors, value, candidateSha, label) {
  const sha = normalizedSha(value);
  if (!FULL_SHA_RE.test(sha)) {
    errors.push(`${label} commit SHA must be a full 40-character hexadecimal commit SHA`);
  } else if (sha !== candidateSha) {
    errors.push(`${label} evidence is not tied to the exact candidate SHA`);
  }
}

function validateDevice(errors, device, candidateSha, label, { physical = false } = {}) {
  const value = device && typeof device === 'object' ? device : {};
  requireTrue(errors, value.accepted, `${label} acceptance must be explicitly true`);
  requireTrue(errors, value.realAccount, `${label} must use a real authenticated account`);
  requireFalse(errors, value.simulated, `${label} acceptance must explicitly state simulated=false`);
  requireFalse(errors, value.emulated, `${label} acceptance must explicitly state emulated=false`);
  if (physical) requireTrue(errors, value.physical, `${label} must be performed on the physical device`);
  if (!nonEmptyText(value.browser)) errors.push(`${label} acceptance must identify the browser used`);
  if (!nonEmptyText(value.device)) errors.push(`${label} acceptance must identify the tested device`);
  requireSameSha(errors, value.commitSha, candidateSha, label);
  const flows = value.flows && typeof value.flows === 'object' ? value.flows : {};
  for (const flow of REQUIRED_DEVICE_FLOWS) {
    requireTrue(errors, flows[flow], `${label} flow ${flow} must be accepted`);
  }
  if (!evidencePresent(value.evidence)) errors.push(`${label} acceptance evidence is required`);
}

function validateOwnerGovernance(errors, governance, candidateSha) {
  const value = governance && typeof governance === 'object' ? governance : {};
  if (value.policyId !== OWNER_GOVERNANCE_POLICY_ID) {
    errors.push(`owner governance policyId must be exactly ${OWNER_GOVERNANCE_POLICY_ID}`);
  }
  requireSameSha(errors, value.candidateSha, candidateSha, 'owner governance');
  requireFalse(
    errors,
    value.automaticProductionAuthorization,
    'automatic Production authorization must be explicitly revoked',
  );
  requireFalse(
    errors,
    value.previewApprovalCountsAsProductionApproval,
    'Preview/design/luxury approval must not count as Production approval',
  );
  requireTrue(
    errors,
    value.finalOwnerPracticalTestRequired,
    'final owner practical testing must remain required',
  );
  requireTrue(
    errors,
    value.laterExactShaProductionApprovalRequired,
    'later explicit owner Production approval for the exact candidate SHA must remain required',
  );
  if (!evidencePresent(value.evidence)) errors.push('owner governance supersession evidence is required');
}

export function validateReleaseGateManifest(manifest = {}, expectedCandidateSha = '') {
  const errors = [];
  const candidateSha = normalizedSha(expectedCandidateSha);
  if (!FULL_SHA_RE.test(candidateSha)) {
    errors.push('expected candidate SHA must be a full 40-character hexadecimal commit SHA');
    return { ok: false, candidateSha, errors };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, candidateSha, errors: ['release gate manifest must be a JSON object'] };
  }

  if (manifest.schemaVersion !== 1) errors.push('release gate manifest schemaVersion must be 1');
  requireSameSha(errors, manifest.candidateSha, candidateSha, 'release gate manifest');
  if (manifest.status !== 'accepted') errors.push('release gate manifest status must be exactly accepted');

  validateOwnerGovernance(errors, manifest.ownerGovernance, candidateSha);

  const requirements = manifest.requirements155 || {};
  requireTrue(errors, requirements.accepted, 'all 155 requirements must be explicitly accepted');
  if (requirements.acceptedCount !== 155) errors.push('requirements155.acceptedCount must equal 155');
  if (!evidencePresent(requirements.evidence)) errors.push('155/155 acceptance evidence is required');

  const ci = manifest.ci || {};
  requireTrue(errors, ci.allRequiredPassed, 'all required CI checks must pass');
  requireSameSha(errors, ci.commitSha, candidateSha, 'CI');
  if (!evidencePresent(ci.evidence)) errors.push('same-SHA CI evidence is required');

  const preview = manifest.hostedPreview || {};
  requireTrue(errors, preview.accepted, 'hosted Preview must be accepted');
  requireTrue(errors, preview.applicationRuntimeReached, 'hosted Preview acceptance must reach the AQARI application runtime');
  requireTrue(errors, preview.realAccountTested, 'hosted Preview acceptance must include a real authenticated account');
  requireFalse(errors, preview.buildReadyOnly, 'Vercel READY/build success alone must not count as hosted Preview acceptance');
  requireFalse(errors, preview.simulated, 'hosted Preview acceptance must explicitly state simulated=false');
  requireSameSha(errors, preview.commitSha, candidateSha, 'hosted Preview');
  if (typeof preview.url !== 'string' || !/^https:\/\//.test(preview.url)) errors.push('hosted Preview URL is required');
  if (!evidencePresent(preview.evidence)) errors.push('hosted Preview acceptance evidence is required');

  const devices = manifest.devices || {};
  validateDevice(errors, devices.desktop, candidateSha, 'Desktop');
  validateDevice(errors, devices.iphone, candidateSha, 'iPhone', { physical: true });
  validateDevice(errors, devices.ipad, candidateSha, 'iPad', { physical: true });

  const backup = manifest.backup || {};
  requireTrue(errors, backup.current, 'backup must be current for the release candidate review');
  requireTrue(errors, backup.database, 'backup must include Database');
  requireTrue(errors, backup.auth, 'backup must include Auth');
  requireTrue(errors, backup.storage, 'backup must include Storage');
  requireTrue(errors, backup.attachmentBytesIncluded, 'backup must include attachment bytes, not metadata only');
  if (!evidencePresent(backup.evidence)) errors.push('complete backup evidence is required');

  const restore = manifest.restore || {};
  requireTrue(errors, restore.independent, 'restore must be independent');
  requireTrue(errors, restore.passed, 'independent restore must pass');
  requireTrue(errors, restore.attachmentBytesVerified, 'restored attachment bytes must be verified');
  if (!evidencePresent(restore.evidence)) errors.push('independent restore evidence is required');

  const rollback = manifest.rollback || {};
  requireTrue(errors, rollback.tested, 'rollback must be rehearsed');
  requireTrue(errors, rollback.preservesCurrentTransactions, 'rollback must preserve current transactions');
  requireTrue(errors, rollback.preservesNewTransactions, 'rollback must preserve transactions created after the checkpoint');
  if (!evidencePresent(rollback.evidence)) errors.push('transaction-preserving rollback evidence is required');

  const productionConfig = manifest.productionConfig || {};
  requireTrue(errors, productionConfig.correct, 'Production configuration must be verified correct');
  requireSameSha(errors, productionConfig.candidateSha, candidateSha, 'Production configuration');
  if (!evidencePresent(productionConfig.evidence)) errors.push('Production configuration evidence is required');

  return { ok: errors.length === 0, candidateSha, errors };
}

export function readReleaseGateManifest(filePath, { cwd = process.cwd() } = {}) {
  const requested = String(filePath || '').trim();
  if (!requested) throw new Error('release gate manifest path is required');
  if (isAbsolute(requested)) throw new Error('release gate manifest path must be repository-relative');

  const root = resolve(cwd);
  const resolved = resolve(root, requested);
  const rel = relative(root, resolved);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') throw new Error('release gate manifest path escapes the repository');
  const normalized = rel.split(sep).join('/');
  if (!normalized.startsWith('docs/release-gates/') || !normalized.endsWith('.json')) {
    throw new Error('release gate manifest must be a JSON file under docs/release-gates/');
  }

  const parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  return parsed;
}
