import fs from 'node:fs';

const required = [
  'tests/preview.e2e.mjs',
  '.github/workflows/preview-e2e.yml',
  'PREVIEW_E2E_GATE.md'
];

let failed = false;
for (const f of required) {
  if (!fs.existsSync(f)) {
    console.error('Missing', f);
    failed = true;
  }
}

const e2e = fs.readFileSync('tests/preview.e2e.mjs', 'utf8');
for (const contract of [
  "error.stack || error.message",
  "body.deployment?.environment !== 'preview'",
  "typeof configured[key] !== 'boolean'",
  'summary.required <= 0',
  'summary.required !== keys.length',
  'summary.present !== present',
  'summary.ready !== (summary.present === summary.required)',
  'production environment configuration visible to Preview'
]) {
  if (!e2e.includes(contract)) {
    console.error('Missing Preview E2E contract:', contract);
    failed = true;
  }
}
if (e2e.includes('body.summary?.ready !== true')) {
  console.error('Preview E2E must not require Production secrets to be injected into Preview');
  failed = true;
}

if (failed) process.exit(1);
console.log('AQARI V203 preview E2E package self-test: PASS');

