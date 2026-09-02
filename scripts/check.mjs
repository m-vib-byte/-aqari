import fs from 'node:fs';

const requiredFiles = [
  'index.html',
  'vercel.json',
  'api/health.js',
  'api/release.js',
  'api/config-status.js',
  '.env.example'
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    failed = true;
  }
}

const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('V198')) {
  console.error('index.html does not contain V198 release marker');
  failed = true;
}

if (failed) process.exit(1);
console.log('AQARI V198 package check: PASS');
