const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

function destinationFor(source){
  return config.rewrites.find(rule => rule.source === source)?.destination || null;
}

test('root login entry is handled once by static routing, without middleware', () => {
  assert.equal(fs.existsSync(path.join(root, 'middleware.js')), false);
  assert.equal(destinationFor('/'), '/login.html');
});

test('session and callback routes retain their own handlers', () => {
  const protectedApp = destinationFor('/app');
  const login = destinationFor('/login');
  assert.equal(protectedApp, '/index.html');
  assert.equal(login, '/login.html');
  assert.notEqual(protectedApp, '/login.html');
  assert.equal(destinationFor('/api/workspace-confirmation'), null);
  assert.equal(destinationFor('/api/owner-assistant'), null);
});
