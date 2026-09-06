'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const protectedFiles = {
  'index.html': '9081e8a29e50a3533f719361caede32ab2a6bb08',
  'supabase-adapter.js': 'e21623796eea6678a36ea6a31b075ac31783132a',
  'secure-auth-bridge.js': '768f10e46fddadce5a376b27f8226bb1d41b3248',
  'final-release-ui.js': 'fcd501f3a05e8c4fc96d704180868be6819e260b',
  'v205-simplified-shell.js': '2eb92612991ce2905aa7f95da0378d2f791f8204'
};
for (const [name, expected] of Object.entries(protectedFiles)) {
  test('approved gateway preserves deployed repair file: ' + name, () => {
    const data = fs.readFileSync(path.join(root, name));
    const actual = crypto.createHash('sha1').update(Buffer.from('blob ' + data.length + '\0')).update(data).digest('hex');
    assert.equal(actual, expected);
  });
}
test('compiled gateway uses approved contact links without changing the account input', () => {
  const html = read('login.html');
  assert.match(html, /content="approved-gateway-1"/);
  assert.match(html, /href="mailto:myaqari\.kw@gmail\.com"/);
  for (const phone of ['50721277','51119040','55521007','25640025']) assert.ok(html.includes('href="tel:+965' + phone + '"'));
  assert.doesNotMatch(html, /dhahawikw\.com|dhahawitower@gmail\.com/);
  const emailInput = html.match(/<input\b[^>]*\bid="email"[^>]*>/);
  assert.ok(emailInput);
  assert.doesNotMatch(emailInput[0], /\bvalue\s*=/);
});
test('integration preserves the real app route rather than replacing it with a design or recovery page', () => {
  const config = JSON.parse(read('vercel.json'));
  const route = source => config.rewrites.find(item => item.source === source)?.destination;
  assert.equal(route('/'), '/login.html');
  assert.equal(route('/login'), '/login.html');
  assert.equal(route('/app'), '/index.html');
  assert.equal(config.outputDirectory, '.');
});
test('both independently verified workspace boundaries remain required before optional UI startup', () => {
  const source = read('final-release-ui.js');
  assert.match(source, /AQARI_DATA_GATE/);
  assert.match(source, /AQARI_EARLY_STORAGE_GATE/);
  assert.match(source, /authenticatedUIReady/);
  assert.ok(read('v205-simplified-shell.js').includes("target.closest('button[data-v205-route],a[data-v205-route]')"));
});
