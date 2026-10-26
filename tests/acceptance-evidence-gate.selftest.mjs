import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40);
const keys = [
  'hosted_preview_real_account',
  'database_auth_storage_backup_complete',
  'independent_restore_complete',
  'business_auth_fingerprints_equal',
  'storage_bytes_hashes_equal',
  'data_preserving_rollback_tested',
  'desktop_practical_pass',
  'iphone_physical_practical_pass',
  'ipad_physical_practical_pass',
  'contract_payment_receipt_print_pass',
  'all_requirements_evidence_complete',
  'required_ci_green',
  'production_configuration_verified'
];
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aqari-gate-'));
const evidencePath = path.join(directory, 'evidence.json');
const script = path.resolve('scripts/acceptance-evidence-gate.mjs');
const valid = () => ({
  candidate_sha: sha,
  environment: 'isolated-preview',
  production_deployed: false,
  checks: Object.fromEntries(keys.map(key => [key, {
    passed: true, candidate_sha: sha, evidence_url: 'https://example.org/evidence/' + key
  }]))
});
function run(document, givenSha = sha) {
  fs.writeFileSync(evidencePath, JSON.stringify(document));
  return spawnSync(process.execPath, [script, evidencePath, givenSha], {encoding:'utf8'});
}
function expectBlocked(label, doc, givenSha) {
  const result = run(doc, givenSha);
  assert.notEqual(result.status, 0, label);
  assert.match(result.stderr, /ACCEPTANCE BLOCKED:/, label);
  console.log('BLOCKED:', label);
}
try {
  assert.equal(run(valid()).status, 0, 'complete synthetic checklist should pass format validation');
  console.log('PASS: syntactically complete synthetic checklist (NOT real release acceptance)');
  const missing = valid(); delete missing.checks[keys[0]];
  expectBlocked('missing evidence', missing);
  const failed = valid(); failed.checks[keys[1]].passed = false;
  expectBlocked('failed check', failed);
  const wrongEvidenceSha = valid(); wrongEvidenceSha.checks[keys[2]].candidate_sha = 'b'.repeat(40);
  expectBlocked('mismatched evidence SHA', wrongEvidenceSha);
  expectBlocked('mismatched candidate SHA', valid(), 'b'.repeat(40));
  const wrongEnv = valid(); wrongEnv.environment = 'production';
  expectBlocked('non-isolated environment', wrongEnv);
  const production = valid(); production.production_deployed = true;
  expectBlocked('production already deployed', production);
  const badUrl = valid(); badUrl.checks[keys[3]].evidence_url = 'file:///tmp/evidence';
  expectBlocked('non-HTTPS evidence reference', badUrl);
  expectBlocked('invalid expected commit SHA', valid(), 'short');
  console.log('All 9 gate self-test scenarios passed.');
} finally {
  fs.rmSync(directory, {recursive:true, force:true});
}
