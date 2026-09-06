'use strict';
// Reviewed baseline: deployed auth/runtime repairs plus the V205 menu-focus fix.
// Local build only: no network, credentials, database or account operations.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const protectedFiles = {
  'index.html': '9081e8a29e50a3533f719361caede32ab2a6bb08',
  'supabase-adapter.js': 'e21623796eea6678a36ea6a31b075ac31783132a',
  'secure-auth-bridge.js': '768f10e46fddadce5a376b27f8226bb1d41b3248',
  'final-release-ui.js': 'fcd501f3a05e8c4fc96d704180868be6819e260b',
  'v205-simplified-shell.js': 'a3d4760c800cc29ffad93bfb888b5701a5acf2b5'
};
function verifyRuntime() {
  for (const [name, expected] of Object.entries(protectedFiles)) {
    const data = fs.readFileSync(path.join(root, name));
    const actual = crypto.createHash('sha1').update(Buffer.from('blob ' + data.length + '\0')).update(data).digest('hex');
    assert.equal(actual, expected, 'Approved presentation must preserve the reviewed runtime baseline: ' + name);
  }
}
verifyRuntime();
require('./build-login-luxury.cjs');
verifyRuntime();
const inventoryPath = path.join(root, 'FILE_INVENTORY.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
for (const name of ['scripts/build-approved-integration.cjs', 'tests/approved-login-integration.test.cjs', 'v205-simplified-shell.js', 'tests/quick-menu-stability.test.cjs']) {
  const data = fs.readFileSync(path.join(root, name));
  const entry = {path:name, size:data.length, sha256:crypto.createHash('sha256').update(data).digest('hex')};
  const existing = inventory.files.find(item => item.path === name);
  if (existing) Object.assign(existing, entry); else inventory.files.push(entry);
}
fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2) + '\n');
console.log('Reviewed baseline verified: four deployed auth/app files unchanged; V205 menu-focus correction pinned.');
// Keep vercel.json buildCommand short; run the full declared gate here.
const commands = [
  ['--test', 'tests/luxury-login.test.cjs', 'tests/login-navigation.test.cjs',
   'tests/approved-login-integration.test.cjs', 'tests/startup-ui-loading.test.cjs',
   'tests/auth-data-gate.test.cjs', 'tests/v209-loader.test.cjs', 'tests/quick-menu-stability.test.cjs'],
  ['tests/mobile-login-shell.test.cjs'],
  ['scripts/release-freeze-selftest.mjs']
];
for (const args of commands) {
  const run = spawnSync(process.execPath, args, {cwd:root, stdio:'inherit', timeout:90000});
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status || 1);
}
verifyRuntime();
