import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  readReleaseGateManifest,
  validateReleaseGateManifest,
} from './v267-release-gate-manifest.mjs';
import {validateStageCReleaseBundle} from './v267-stage-c-release-bundle-gate.mjs';
import {validateProductionConfigForCli} from './v267-production-config-gate.mjs';
import {validateSameShaCiEvidence} from './v267-ci-evidence-gate.mjs';

export const REQUIRED_DECISION = 'approved_for_production';
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

function parseIsoDate(value) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function validateOwnerProductionApproval(input = {}) {
  const candidateSha = String(input.candidateSha || '').trim().toLowerCase();
  const finalTestedSha = String(input.finalTestedSha || '').trim().toLowerCase();
  const approvedSha = String(input.approvedSha || '').trim().toLowerCase();
  const decision = String(input.decision || '').trim();
  const finalTestCompletedAt = String(input.finalTestCompletedAt || '').trim();
  const approvedAt = String(input.approvedAt || '').trim();
  const approvalActor = String(input.approvalActor || '').trim().toLowerCase();
  const repositoryOwner = String(input.repositoryOwner || '').trim().toLowerCase();

  const errors = [];
  if (!FULL_SHA_RE.test(candidateSha)) errors.push('candidate SHA must be a full 40-character hexadecimal commit SHA');
  if (!FULL_SHA_RE.test(finalTestedSha)) errors.push('final-tested SHA must be a full 40-character hexadecimal commit SHA');
  if (!FULL_SHA_RE.test(approvedSha)) errors.push('owner-approved SHA must be a full 40-character hexadecimal commit SHA');

  if (candidateSha && finalTestedSha && candidateSha !== finalTestedSha) {
    errors.push('final owner testing is not recorded for the exact candidate SHA');
  }
  if (candidateSha && approvedSha && candidateSha !== approvedSha) {
    errors.push('owner production approval is not tied to the exact candidate SHA');
  }
  if (decision !== REQUIRED_DECISION) {
    errors.push(`owner decision must be exactly ${REQUIRED_DECISION}; preview/design approval is not production approval`);
  }

  if (!approvalActor) errors.push('approval actor is required');
  if (!repositoryOwner) errors.push('repository owner is required');
  if (approvalActor && repositoryOwner && approvalActor !== repositoryOwner) {
    errors.push('explicit production approval must be dispatched by the repository owner');
  }

  const finalTestMs = parseIsoDate(finalTestCompletedAt);
  const approvedMs = parseIsoDate(approvedAt);
  if (finalTestMs === null) errors.push('final-test completion timestamp must be a valid ISO-8601 date/time');
  if (approvedMs === null) errors.push('owner production-approval timestamp must be a valid ISO-8601 date/time');
  if (finalTestMs !== null && approvedMs !== null && approvedMs <= finalTestMs) {
    errors.push('owner production approval must occur after final owner testing');
  }

  if (!input.releaseGateManifest) {
    errors.push('full release gate manifest is required before owner Production approval can pass');
  } else if (FULL_SHA_RE.test(candidateSha)) {
    const gate = validateReleaseGateManifest(input.releaseGateManifest, candidateSha);
    for (const error of gate.errors) errors.push(`release gate: ${error}`);
  }

  return {
    ok: errors.length === 0,
    candidateSha,
    decision,
    approvalActor,
    repositoryOwner,
    errors,
  };
}

// CLI/Production path is intentionally stricter than the compatibility validator above.
// It requires executed same-SHA GitHub CI evidence, the deterministic Stage-C bundle produced
// from the actual backup/restore/rollback/device evidence and a cross-bound Production target.
// Preview/design approval still cannot satisfy this path.
export function validateOwnerProductionApprovalForCli(input = {}) {
  const base = validateOwnerProductionApproval(input);
  const errors = [...base.errors];
  if (FULL_SHA_RE.test(base.candidateSha)) {
    const ci = validateSameShaCiEvidence(input.releaseGateManifest?.ci, base.candidateSha);
    for (const error of ci.errors) errors.push(`release gate CI evidence: ${error}`);

    const stageC = validateStageCReleaseBundle(input.releaseGateManifest?.stageCBundle, base.candidateSha);
    for (const error of stageC.errors) errors.push(`release gate Stage C bundle: ${error}`);
    if (stageC.ok) {
      const production = validateProductionConfigForCli({
        productionConfig: input.releaseGateManifest?.productionConfig,
        stageCBundle: input.releaseGateManifest?.stageCBundle,
        productionTarget: input.productionTarget,
      }, base.candidateSha);
      for (const error of production.errors) errors.push(`release gate Production configuration: ${error}`);
    }
  } else {
    errors.push('release gate CI evidence cannot be validated without the exact candidate SHA');
    errors.push('release gate Stage C bundle cannot be validated without the exact candidate SHA');
  }
  return {...base, ok: errors.length === 0, errors};
}

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

export function inputFromProcess(argv = process.argv.slice(2), env = process.env) {
  const args = readArgs(argv);
  return {
    candidateSha: args['candidate-sha'] || env.V267_CANDIDATE_SHA,
    releaseGateManifestPath: args['release-gate-manifest'] || env.V267_RELEASE_GATE_MANIFEST_PATH,
    finalTestedSha: env.V267_OWNER_FINAL_TESTED_SHA,
    approvedSha: env.V267_OWNER_PRODUCTION_APPROVAL_SHA,
    decision: env.V267_OWNER_PRODUCTION_APPROVAL_DECISION,
    finalTestCompletedAt: env.V267_OWNER_FINAL_TEST_COMPLETED_AT,
    approvedAt: env.V267_OWNER_PRODUCTION_APPROVAL_AT,
    approvalActor: env.V267_OWNER_APPROVAL_ACTOR,
    repositoryOwner: env.V267_REPOSITORY_OWNER,
  };
}

function main() {
  const input = inputFromProcess();
  try {
    input.releaseGateManifest = readReleaseGateManifest(input.releaseGateManifestPath);
  } catch (error) {
    console.error('V267 OWNER PRODUCTION GATE: HOLD');
    console.error(`- unable to load full release gate manifest: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  try {
    input.productionTarget = JSON.parse(readFileSync(new URL('../config/production-target.json', import.meta.url), 'utf8'));
  } catch (error) {
    console.error('V267 OWNER PRODUCTION GATE: HOLD');
    console.error(`- unable to load Production target configuration: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = validateOwnerProductionApprovalForCli(input);
  if (!result.ok) {
    console.error('V267 OWNER PRODUCTION GATE: HOLD');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`V267 OWNER PRODUCTION GATE: PASS for ${result.candidateSha} by ${result.approvalActor}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
