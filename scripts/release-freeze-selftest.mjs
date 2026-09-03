import fs from 'node:fs';
import crypto from 'node:crypto';

const required = [
  'index.html',
  'vercel.json',
  'package.json',
  'VERSION.json',
  'FILE_INVENTORY.json',
  'public-config.js',
  'supabase-adapter.js',
  'cloud-sync.js',
  'first-run-migration.js',
  'safe-autosync.js',
  'safe-autosync-ui.js',
  'production-lockdown.js',
  'api/health.js',
  'api/release.js',
  'api/supabase-status.js',
  'api/migration-status.js',
  'api/autosync-status.js',
  'api/final-release-status.js',
  'api/production-meta.js'
];

let failed = false;

for (const f of required) {
  if (!fs.existsSync(f)) {
    console.error('Missing required file:', f);
    failed = true;
  }
}

const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('V198')) {
  console.error('V198 release marker missing');
  failed = true;
}

const inv = JSON.parse(fs.readFileSync('FILE_INVENTORY.json', 'utf8'));
if (inv.version !== 'V198') {
  console.error('Inventory version mismatch');
  failed = true;
}

for (const row of inv.files) {
  if (!fs.existsSync(row.path)) {
    console.error('Inventory file missing:', row.path);
    failed = true;
    continue;
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(row.path)).digest('hex');
  if (hash !== row.sha256) {
    console.error('Checksum mismatch:', row.path);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('AQARI V198 release freeze self-test: PASS');
