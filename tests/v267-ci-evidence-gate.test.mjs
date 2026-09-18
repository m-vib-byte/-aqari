import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_CI_WORKFLOWS, validateSameShaCiEvidence } from '../scripts/v267-ci-evidence-gate.mjs';

const SHA = 'b719c9cc2b4a8f4d0024ad0a0b6f9ff200cd72b9';
const OTHER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function fullCi() {
  return {
    allRequiredPassed: true,
    commitSha: SHA,
    evidence: ['evidence/ci/summary.json'],
    workflows: REQUIRED_CI_WORKFLOWS.map((name, index) => ({
      name,
      commitSha: SHA,
      runId: 1000 + index,
      status: 'completed',
      conclusion: 'success',
      evidence: [`https://github.com/m-vib-byte/-aqari/actions/runs/${1000 + index}`],
      jobs: [{
        jobId: 2000 + index,
        runnerId: 3000 + index,
        runnerName: 'GitHub Actions 1',
        stepsExecuted: 5,
        status: 'completed',
        conclusion: 'success',
        evidence: [`https://api.github.com/repos/m-vib-byte/-aqari/actions/jobs/${2000 + index}`],
      }],
    })),
  };
}

test('accepts only complete same-SHA successful CI with real runner and executed steps evidence', () => {
  const result = validateSameShaCiEvidence(fullCi(), SHA);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('rejects a missing or duplicated required workflow', () => {
  const missing = fullCi();
  missing.workflows.pop();
  assert.equal(validateSameShaCiEvidence(missing, SHA).ok, false);

  const duplicated = fullCi();
  duplicated.workflows[1] = structuredClone(duplicated.workflows[0]);
  const result = validateSameShaCiEvidence(duplicated, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicated|missing required CI workflow/);
});

test('rejects stale-SHA or failed workflow evidence', () => {
  for (const mutate of [
    (ci) => { ci.commitSha = OTHER_SHA; },
    (ci) => { ci.workflows[0].commitSha = OTHER_SHA; },
    (ci) => { ci.workflows[0].status = 'queued'; },
    (ci) => { ci.workflows[0].conclusion = 'failure'; },
  ]) {
    const ci = fullCi();
    mutate(ci);
    assert.equal(validateSameShaCiEvidence(ci, SHA).ok, false);
  }
});

test('rejects pre-runner failures even when the top-level boolean says passed', () => {
  const ci = fullCi();
  ci.workflows[0].jobs[0].runnerId = 0;
  ci.workflows[0].jobs[0].runnerName = '';
  ci.workflows[0].jobs[0].stepsExecuted = 0;
  const result = validateSameShaCiEvidence(ci, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /runner was assigned/);
  assert.match(result.errors.join('\n'), /workflow step executed/);
});

test('rejects empty or duplicate evidence references', () => {
  const ci = fullCi();
  ci.workflows[0].evidence = [];
  ci.workflows[1].jobs[0].evidence = ['same', 'same'];
  const result = validateSameShaCiEvidence(ci, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /evidence is required/);
});

test('rejects reused run or job identities across different required workflows', () => {
  const ci = fullCi();
  ci.workflows[1].runId = ci.workflows[0].runId;
  ci.workflows[1].evidence = [...ci.workflows[0].evidence];
  ci.workflows[2].jobs[0].jobId = ci.workflows[0].jobs[0].jobId;
  ci.workflows[2].jobs[0].evidence = [...ci.workflows[0].jobs[0].evidence];
  const result = validateSameShaCiEvidence(ci, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /reuses runId/);
  assert.match(result.errors.join('\n'), /reuses jobId/);
});

test('rejects nonempty CI evidence that does not identify the declared run and job', () => {
  const ci = fullCi();
  ci.workflows[0].evidence = ['https://github.com/m-vib-byte/-aqari/actions/runs/999999'];
  ci.workflows[1].jobs[0].evidence = ['https://api.github.com/repos/m-vib-byte/-aqari/actions/jobs/999999'];
  const result = validateSameShaCiEvidence(ci, SHA);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /exact GitHub Actions run URL/);
  assert.match(result.errors.join('\n'), /exact GitHub Actions job URL/);
});

test('rejects unsafe or unrelated CI evidence references even when the required run/job URL is present', () => {
  const badRefs = [
    'https://example.com/fake-ci.json',
    '../evidence/ci/run.json',
    'evidence/../ci/run.json',
    '/evidence/ci/run.json',
    'evidence/ci\\run.json',
    'evidence/ci/run.json?raw=1',
    ' evidence/ci/run.json',
    'evidence//ci/run.json',
  ];
  for (const badRef of badRefs) {
    const ci = fullCi();
    ci.evidence = [badRef];
    ci.workflows[0].evidence.push(badRef);
    ci.workflows[1].jobs[0].evidence.push(badRef);
    const result = validateSameShaCiEvidence(ci, SHA);
    assert.equal(result.ok, false, badRef);
    assert.match(result.errors.join('\n'), /canonical repository evidence paths|contain only the exact GitHub Actions/);
  }

  const unrelatedRun = fullCi();
  unrelatedRun.workflows[0].evidence.push('https://github.com/m-vib-byte/-aqari/actions/runs/999999');
  assert.equal(validateSameShaCiEvidence(unrelatedRun, SHA).ok, false);

  const unrelatedJob = fullCi();
  unrelatedJob.workflows[0].jobs[0].evidence.push('https://api.github.com/repos/m-vib-byte/-aqari/actions/jobs/999999');
  assert.equal(validateSameShaCiEvidence(unrelatedJob, SHA).ok, false);
});
