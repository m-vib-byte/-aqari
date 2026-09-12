import { pathToFileURL } from 'node:url';

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

  const finalTestMs = parseIsoDate(finalTestCompletedAt);
  const approvedMs = parseIsoDate(approvedAt);
  if (finalTestMs === null) errors.push('final-test completion timestamp must be a valid ISO-8601 date/time');
  if (approvedMs === null) errors.push('owner production-approval timestamp must be a valid ISO-8601 date/time');
  if (finalTestMs !== null && approvedMs !== null && approvedMs <= finalTestMs) {
    errors.push('owner production approval must occur after final owner testing');
  }

  return {
    ok: errors.length === 0,
    candidateSha,
    decision,
    errors,
  };
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
    finalTestedSha: env.V267_OWNER_FINAL_TESTED_SHA,
    approvedSha: env.V267_OWNER_PRODUCTION_APPROVAL_SHA,
    decision: env.V267_OWNER_PRODUCTION_APPROVAL_DECISION,
    finalTestCompletedAt: env.V267_OWNER_FINAL_TEST_COMPLETED_AT,
    approvedAt: env.V267_OWNER_PRODUCTION_APPROVAL_AT,
  };
}

function main() {
  const result = validateOwnerProductionApproval(inputFromProcess());
  if (!result.ok) {
    console.error('V267 OWNER PRODUCTION GATE: HOLD');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`V267 OWNER PRODUCTION GATE: PASS for ${result.candidateSha}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
