import fs from 'node:fs';
import process from 'node:process';

// Read-only evidence *structure* gate, not release approval or verification of linked artifacts.
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
function fail(message) { console.error('EVIDENCE CHECKLIST BLOCKED:', message); process.exit(1); }
function acceptableEvidenceUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') ||
        host === 'example.com' || host === 'example.org' || host === 'example.net' ||
        host.endsWith('.example') || host.endsWith('.test') || host.endsWith('.invalid')) return false;
    return true;
  } catch { return false; }
}
if (!file || !/^[0-9a-f]{40}$/.test(expectedSha || '')) fail('Provide evidence JSON and exact 40-character candidate SHA');
let doc;
try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch { fail('Evidence file missing or invalid JSON'); }
if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('Evidence must be an object');
if (doc.candidate_sha !== expectedSha) fail('Candidate SHA does not match');
if (doc.environment !== 'isolated-preview') fail('Only isolated Preview evidence is accepted');
if (doc.production_deployed !== false) fail('Production deployment is not an acceptance prerequisite');
if (!doc.checks || typeof doc.checks !== 'object' || Array.isArray(doc.checks)) fail('Missing checks object');
for (const key of required) {
  const item = doc.checks[key];
  if (!item || item.passed !== true || !acceptableEvidenceUrl(item.evidence_url)) {
    fail('Missing supported non-placeholder evidence reference for ' + key);
  }
  if (item.candidate_sha !== expectedSha) fail('Evidence SHA mismatch for ' + key);
}
console.log('Evidence reference STRUCTURE: PASS for', expectedSha);
console.log('NOT VERIFIED: URL contents, authenticity, CI, restoration, device operation, and owner approval require independent checks.');
