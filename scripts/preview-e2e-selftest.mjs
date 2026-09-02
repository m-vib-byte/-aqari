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

if (failed) process.exit(1);
console.log('AQARI V198 preview E2E package self-test: PASS');
