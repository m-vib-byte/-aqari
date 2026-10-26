import fs from 'node:fs';
import process from 'node:process';

// Independent, fail-closed evidence gate. It never reads credentials or modifies data.
// Usage: node scripts/acceptance-evidence-gate.mjs <evidence.json> <expected-full-git-sha>
const [file, expectedSha] = process.argv.slice(2);
const required = [
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
function fail(message) { console.error('ACCEPTANCE BLOCKED:', message); process.exit(1); }
if (!file || !/^[0-9a-f]{40}$/.test(expectedSha || '')) fail('Provide evidence JSON and exact 40-character candidate SHA');
let doc;
try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch { fail('Evidence file is missing or invalid JSON'); }
if (doc.candidate_sha !== expectedSha) fail('Evidence candidate SHA does not match');
if (doc.environment !== 'isolated-preview') fail('Evidence must be from isolated Preview');
for (const key of required) {
  const item = doc.checks?.[key];
  if (item?.passed !== true || typeof item?.evidence_url !== 'string' || !/^https:\/\//.test(item.evidence_url)) {
    fail('Missing verified evidence for ' + key);
  }
  if (item.candidate_sha !== expectedSha) fail('Evidence SHA mismatch for ' + key);
}
if (doc.production_deployed !== false) fail('Gate cannot validate a production deployment');
console.log('Candidate evidence gate: PASS for', expectedSha);
console.log('This is a document completeness check, not independent validation of linked evidence or owner approval.');
