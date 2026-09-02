'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function invoke(handler, method = 'GET') {
  const output = { statusCode: 0, headers: {}, body: undefined };
  const response = {
    setHeader(key, value) {
      output.headers[key.toLowerCase()] = value;
    },
    status(statusCode) {
      output.statusCode = statusCode;
      return this;
    },
    json(body) {
      output.body = body;
      return output;
    },
    end() {
      return output;
    },
  };

  handler({ method }, response);
  return output;
}

for (const relativePath of ['api/health.js', 'api/health/deep.js', 'api/release.js']) {
  test(`${relativePath} follows the HTTP contract`, () => {
    const handler = require(path.join(root, relativePath));
    const get = invoke(handler, 'GET');
    assert.equal(get.statusCode, 200);
    assert.equal(get.body.ok, true);
    assert.equal(get.headers['cache-control'], 'no-store, max-age=0');
    assert.equal(invoke(handler, 'HEAD').statusCode, 200);
    assert.equal(invoke(handler, 'POST').statusCode, 405);
  });
}

test('PWA files referenced by index.html exist and parse', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.match(html, /register\('\/sw\.js'\)/);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.lang, 'ar');
  assert.ok(fs.existsSync(path.join(root, 'sw.js')));
  assert.ok(fs.existsSync(path.join(root, 'aqari-icon.svg')));
});

test('Vercel security headers are configured', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const names = new Set(config.headers.flatMap((rule) => rule.headers.map((header) => header.key)));
  for (const name of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
});
