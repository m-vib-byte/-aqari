import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sha = 'a'.repeat(40);
const keys = [
  'hosted_preview_real_account','database_auth_storage_backup_complete',
  'independent_restore_complete','business_auth_fingerprints_equal',
  'storage_bytes_hashes_equal','data_preserving_rollback_tested',
  'desktop_practical_pass','iphone_physical_practical_pass',
  'ipad_physical_practical_pass','contract_payment_receipt_print_pass',
  'all_requirements_evidence_complete','required_ci_green',
  'production_configuration_verified'
];
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aqari-gate-'));
const evidencePath = path.join(directory, 'evidence.json');
const script = path.resolve('scripts/acceptance-evidence-gate.mjs');
const valid = () => ({
  candidate_sha: sha, environment:'isolated-preview', production_deployed:false,
  checks: Object.fromEntries(keys.map(key => [key, {
    passed:true, candidate_sha:sha, evidence_url:'https://github.com/m-vib-byte/-aqari/issues/197#' + key
  }]))
});
function run(doc, expectedSha=sha) {
  fs.writeFileSync(evidencePath, JSON.stringify(doc));
  return spawnSync(process.execPath, [script, evidencePath, expectedSha], {encoding:'utf8'});
}
function blocked(label, doc, expectedSha) {
  const result=run(doc,expectedSha);
  assert.notEqual(result.status,0,label);
  assert.match(result.stderr,/EVIDENCE CHECKLIST BLOCKED:/,label);
  console.log('BLOCKED:',label);
}
try {
  const ok=run(valid());
  assert.equal(ok.status,0,ok.stderr);
  assert.match(ok.stdout,/NOT VERIFIED:/);
  console.log('PASS: valid reference syntax ONLY (not actual evidence verification)');
  let d=valid(); delete d.checks[keys[0]]; blocked('missing check',d);
  d=valid(); d.checks[keys[1]].passed=false; blocked('failed check',d);
  d=valid(); d.checks[keys[2]].candidate_sha='b'.repeat(40); blocked('mismatched check SHA',d);
  blocked('mismatched candidate SHA',valid(),'b'.repeat(40));
  d=valid(); d.environment='production'; blocked('production environment',d);
  d=valid(); d.production_deployed=true; blocked('deployed production',d);
  d=valid(); d.checks[keys[3]].evidence_url='file:///tmp/evidence'; blocked('file URL',d);
  blocked('invalid expected SHA',valid(),'short');
  d=valid(); d.checks[keys[0]].evidence_url='https://example.org/placeholder'; blocked('reserved placeholder URL',d);
  d=valid(); d.checks[keys[0]].evidence_url='https://localhost/item'; blocked('localhost URL',d);
  console.log('All 11 synthetic structure scenarios passed; practical acceptance remains OPEN.');
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
