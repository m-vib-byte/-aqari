const test = require('node:test');
const assert = require('node:assert/strict');

const env = {
  GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY_OWNER: 'm-vib-byte',
  GITHUB_REPOSITORY: 'm-vib-byte/-aqari',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/oidc?api-version=2',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-runner-credential'
};
function identity(exp, overrides = {}) {
  return 'eyJhbGciOiJSUzI1NiJ9.' + Buffer.from(JSON.stringify({
    iss: 'https://token.actions.githubusercontent.com', aud: 'https://github.com/m-vib-byte',
    repository: 'm-vib-byte/-aqari', exp, ...overrides
  })).toString('base64url') + '.synthetic';
}
function response(value, status = 200) {
  return { status, text: async () => JSON.stringify({ value }) };
}

test('GitHub identities are masked, coalesced and renewed before expiration', async () => {
  const { createGitHubOidcTokenProvider } = await import('./github-preview-oidc.mjs');
  let clock = 1_000_000, requests = 0;
  const masked = [];
  const getToken = createGitHubOidcTokenProvider({ env, now: () => clock, mask: value => masked.push(value),
    fetchToken: async (url, options) => {
      requests++;
      assert.equal(url.searchParams.get('audience'), 'https://github.com/m-vib-byte');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer synthetic-runner-credential');
      return response(identity(clock / 1000 + 300));
    }
  });
  const first = await Promise.all(Array.from({ length: 20 }, () => getToken()));
  assert.equal(requests, 1);
  assert.equal(new Set(first).size, 1);
  assert.equal(masked.length, 1);
  clock += 239_000;
  assert.equal(await getToken(), first[0]);
  clock += 2_000;
  assert.notEqual(await getToken(), first[0]);
  assert.equal(requests, 2);
  assert.equal(masked.length, 2);
});

test('Runner credentials never reach untrusted token endpoints', async () => {
  const { createGitHubOidcTokenProvider } = await import('./github-preview-oidc.mjs');
  for (const url of ['https://attacker.example/token', 'http://pipelines.actions.githubusercontent.com/token',
    'https://pipelines.actions.githubusercontent.com.attacker.example/token',
    'https://user@pipelines.actions.githubusercontent.com/token', 'https://pipelines.actions.githubusercontent.com:444/token']) {
    const getToken = createGitHubOidcTokenProvider({ env: { ...env, ACTIONS_ID_TOKEN_REQUEST_URL: url },
      fetchToken: () => assert.fail('must reject before transmitting the runner credential') });
    await assert.rejects(getToken, /approved GitHub runner host/);
  }
});

test('OIDC failures do not fall back to an unauthenticated request or expose response content', async () => {
  const { createGitHubOidcTokenProvider } = await import('./github-preview-oidc.mjs');
  for (const overrides of [{ iss: 'https://other.example' }, { aud: 'https://github.com/other' },
    { repository: 'other/repo' }, { exp: 1001 }]) {
    const getToken = createGitHubOidcTokenProvider({ env, now: () => 1_000_000,
      mask: () => assert.fail('invalid identity must not be used'),
      fetchToken: async () => response(identity(1300, overrides)) });
    await assert.rejects(getToken, /^Error: GitHub OIDC returned an invalid, expired, or mismatched identity\.$/);
  }
  let attempts = 0;
  const getToken = createGitHubOidcTokenProvider({ env, now: () => 1_000_000, mask: () => {},
    fetchToken: async () => { if (++attempts === 1) throw new Error('synthetic-private-error'); return response(identity(1300)); } });
  await assert.rejects(getToken, error => !error.message.includes('synthetic-private-error'));
  assert.equal(await getToken(), identity(1300), 'a transient failure must not poison the cache');
});

test('OIDC request headers stay on the exact Preview origin and never survive a redirect', async () => {
  const { githubPreviewAccess } = await import('./github-preview-oidc.mjs');
  const { routePreviewRequest, previewAccess } = await import('./preview-access.mjs');
  let tokens = 0;
  const access = githubPreviewAccess('https://preview.example/', async () => { tokens++; return 'synthetic-oidc'; });
  const inherited = { 'X-Vercel-Trusted-Oidc-Idp-Token': 'stale', 'x-vercel-protection-bypass': 'old',
    'x-vercel-set-bypass-cookie': 'true', accept: 'application/json' };
  for (const target of ['https://other.example/', 'https://preview.example.attacker.test/', 'https://preview.example:444/', 'http://preview.example/']) {
    assert.deepEqual(await access.headersFor(target, inherited), { accept: 'application/json' });
  }
  assert.equal(tokens, 0, 'external resources must not cause identity issuance');
  let fetched, fulfilled;
  const redirect = { status: 302, location: 'https://other.example/' };
  await routePreviewRequest({ request: () => ({ url: () => 'https://preview.example/', headers: () => inherited }),
    fetch: async options => { fetched = options; return redirect; },
    fulfill: async result => { fulfilled = result; },
    continue: () => assert.fail('protected request must fetch only one hop') }, access);
  assert.equal(fetched.maxRedirects, 0);
  assert.deepEqual(fetched.headers, { accept: 'application/json', 'x-vercel-trusted-oidc-idp-token': 'synthetic-oidc' });
  assert.equal(fulfilled.response, redirect);
  assert.throws(() => previewAccess('https://preview.example/?x-vercel-trusted-oidc-idp-token=synthetic'));
});
