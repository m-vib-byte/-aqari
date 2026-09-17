export const REQUIRED_CI_WORKFLOWS = Object.freeze([
  'V267 owner production approval policy',
  'Authenticated UI startup order',
  'App first paint',
  'V267 security integration accounting',
  'Runtime contracts',
  'V267 owner governance supersession',
]);

const FULL_SHA_RE = /^[0-9a-f]{40}$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function evidencePresent(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
  }
  return true;
}

function requireSameSha(errors, value, candidateSha, label) {
  const sha = text(value).toLowerCase();
  if (!FULL_SHA_RE.test(sha)) errors.push(`${label} commit SHA must be a full 40-character hexadecimal commit SHA`);
  else if (sha !== candidateSha) errors.push(`${label} evidence is not tied to the exact candidate SHA`);
}

export function validateSameShaCiEvidence(ci = {}, expectedCandidateSha = '') {
  const errors = [];
  const candidateSha = text(expectedCandidateSha).toLowerCase();
  if (!FULL_SHA_RE.test(candidateSha)) {
    return { ok: false, candidateSha, errors: ['expected candidate SHA must be a full 40-character hexadecimal commit SHA'] };
  }

  const value = ci && typeof ci === 'object' && !Array.isArray(ci) ? ci : {};
  if (value.allRequiredPassed !== true) errors.push('all required CI checks must pass');
  requireSameSha(errors, value.commitSha, candidateSha, 'CI');
  if (!evidencePresent(value.evidence)) errors.push('same-SHA CI evidence is required');

  const workflows = Array.isArray(value.workflows) ? value.workflows : [];
  if (workflows.length !== REQUIRED_CI_WORKFLOWS.length) {
    errors.push(`CI workflows must contain exactly ${REQUIRED_CI_WORKFLOWS.length} required workflow records`);
  }

  const required = new Set(REQUIRED_CI_WORKFLOWS);
  const seen = new Set();
  for (const row of workflows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push('every CI workflow record must be an object');
      continue;
    }
    const name = text(row.name);
    if (!required.has(name)) {
      errors.push(`unexpected CI workflow: ${name || '<missing>'}`);
      continue;
    }
    if (seen.has(name)) errors.push(`CI workflow is duplicated: ${name}`);
    seen.add(name);

    requireSameSha(errors, row.commitSha, candidateSha, `CI workflow ${name}`);
    if (!positiveInt(row.runId)) errors.push(`CI workflow ${name} runId must be a positive integer`);
    if (row.status !== 'completed') errors.push(`CI workflow ${name} status must be exactly completed`);
    if (row.conclusion !== 'success') errors.push(`CI workflow ${name} conclusion must be exactly success`);
    if (!evidencePresent(row.evidence)) errors.push(`CI workflow ${name} evidence is required`);

    const jobs = Array.isArray(row.jobs) ? row.jobs : [];
    if (jobs.length === 0) errors.push(`CI workflow ${name} must contain at least one executed job`);
    const jobIds = new Set();
    for (const job of jobs) {
      if (!job || typeof job !== 'object' || Array.isArray(job)) {
        errors.push(`CI workflow ${name} contains an invalid job record`);
        continue;
      }
      if (!positiveInt(job.jobId)) errors.push(`CI workflow ${name} jobId must be a positive integer`);
      else if (jobIds.has(job.jobId)) errors.push(`CI workflow ${name} jobId ${job.jobId} is duplicated`);
      else jobIds.add(job.jobId);
      if (!positiveInt(job.runnerId)) errors.push(`CI workflow ${name} must prove a runner was assigned`);
      if (!text(job.runnerName)) errors.push(`CI workflow ${name} runnerName is required`);
      if (!positiveInt(job.stepsExecuted)) errors.push(`CI workflow ${name} must prove at least one workflow step executed`);
      if (job.status !== 'completed') errors.push(`CI workflow ${name} job status must be exactly completed`);
      if (job.conclusion !== 'success') errors.push(`CI workflow ${name} job conclusion must be exactly success`);
      if (!evidencePresent(job.evidence)) errors.push(`CI workflow ${name} job evidence is required`);
    }
  }

  for (const name of REQUIRED_CI_WORKFLOWS) {
    if (!seen.has(name)) errors.push(`missing required CI workflow: ${name}`);
  }

  return { ok: errors.length === 0, candidateSha, errors };
}
