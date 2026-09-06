const test = require('node:test');
const assert = require('node:assert/strict');

test('Preview protection is scoped to the exact origin, including subresources', async () => {
  const { previewAccess } = await import('./preview-access.mjs');
  const access = previewAccess('https://preview.example/app', 'synthetic-secret');
  assert.deepEqual(access.headersFor('https://preview.example/api/health'), {'x-vercel-protection-bypass':'synthetic-secret'});
  for (const target of ['https://cdn.example/sdk.js', 'https://preview.example.evil.test/', 'https://preview.example:444/', 'http://preview.example/']) {
    assert.deepEqual(access.headersFor(target, {'X-Vercel-Protection-Bypass':'synthetic-secret', 'x-vercel-set-bypass-cookie':'true', accept:'application/json'}), {accept:'application/json'});
  }
});

test('Preview access rejects unsupported share links and embedded credentials before requesting', async () => {
  const { previewAccess } = await import('./preview-access.mjs');
  for (const url of ['http://preview.example', 'https://user:pass@preview.example', 'https://preview.example/?_vercel_share=synthetic', 'https://preview.example/?x-vercel-protection-bypass=synthetic']) {
    assert.throws(() => previewAccess(url));
  }
  assert.deepEqual(previewAccess('https://preview.example').headersFor('https://preview.example/api/health'), {});
});

test('Preview routing does not carry a protection secret through automatic redirects', async () => {
  const { previewAccess, routePreviewRequest } = await import('./preview-access.mjs');
  const access = previewAccess('https://preview.example', 'synthetic-secret');
  const redirectedResponse = {status:302, location:'https://external.example/'};
  let options, fulfilled;
  await routePreviewRequest({
    request:() => ({url:() => 'https://preview.example/', headers:() => ({})}),
    fetch:async value => {options=value; return redirectedResponse;},
    fulfill:async value => {fulfilled=value;},
    continue:() => assert.fail('credentialed requests must not use continue across redirects')
  }, access);
  assert.equal(options.maxRedirects, 0);
  assert.equal(options.headers['x-vercel-protection-bypass'], 'synthetic-secret');
  assert.equal(fulfilled.response, redirectedResponse);
  let continued;
  await routePreviewRequest({
    request:() => ({url:() => 'https://external.example/', headers:() => ({'x-vercel-protection-bypass':'synthetic-secret'})}),
    continue:async value => {continued=value;},
    fetch:() => assert.fail('external resource must not be fetched with Preview credentials')
  }, access);
  assert.deepEqual(continued.headers, {});
});
