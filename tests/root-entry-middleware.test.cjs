const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

function destinationFor(source){
  return config.rewrites.find(rule => rule.source === source)?.destination || null;
}

test('public root is rewritten before the physical app index is served', async () => {
  const {default: middleware, config: routing} = await import('../middleware.js');
  assert.equal(routing.matcher, '/');
  assert.equal(routing.runtime, 'nodejs');
  for(const method of ['GET','HEAD']){
    const response = middleware(new Request('https://preview.example/?manual=1', {method}));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-rewrite'), 'https://preview.example/login.html?manual=1');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal(destinationFor('/'), '/login.html');
});

test('root middleware leaves application, auth, assets and mutations untouched', async () => {
  const {default: middleware} = await import('../middleware.js');
  for(const route of ['/app','/login.html','/api/workspace-confirmation','/api/owner-assistant','/public-config.js']){
    const response = middleware(new Request('https://preview.example'+route));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('x-middleware-rewrite'), null);
  }
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
    const response = middleware(new Request('https://preview.example/', {method}));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('x-middleware-rewrite'), null);
  }
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
