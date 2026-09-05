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
  'summary.required <= 0',
  'summary.ready !== (summary.passed === summary.required)',
  "body.ready !== true",
  "body.checks?.supabaseConnection?.state !== 'up'",
  'operational readiness checks',
  'status requests were not coalesced',
  'blocking startup dialog'
]) {
  if (!e2e.includes(contract)) {
    console.error('Missing Preview E2E contract:', contract);
    failed = true;
  }
}
if (!e2e.includes('legacy secret footprint leaked from readiness payload')) {
  console.error('Preview E2E must reject leaked legacy secret metadata');
  failed = true;
}

if (failed) process.exit(1);
console.log('AQARI V198 preview E2E package self-test: PASS');
