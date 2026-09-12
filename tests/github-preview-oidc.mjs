import { previewAccess } from './preview-access.mjs';

const issuer = 'https://token.actions.githubusercontent.com';

// Request the runner's own short-lived identity. Vercel verifies its signature
// and the project's trusted-source claims; no static secret is exported.
export function createGitHubOidcTokenProvider({
  env = process.env, fetchToken = globalThis.fetch, now = Date.now,
  mask = token => process.stdout.write(`::add-mask::${token}\n`)
} = {}) {
  let cached, pending;
  async function obtain() {
    const owner = env.GITHUB_REPOSITORY_OWNER;
    if (env.GITHUB_ACTIONS !== 'true' || !/^[a-zA-Z0-9-]+$/.test(owner || '') ||
        !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
      throw new Error('GitHub Preview OIDC requires the runner identity and id-token: write.');
    }
    let endpoint;
    try { endpoint = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL); } catch {
      throw new Error('GitHub OIDC request endpoint is missing or invalid.');
    }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        endpoint.port || endpoint.hash || !endpoint.hostname.endsWith('.actions.githubusercontent.com')) {
      throw new Error('GitHub OIDC request endpoint is not an approved GitHub runner host.');
    }
    const audience = `https://github.com/${owner}`;
    endpoint.searchParams.set('audience', audience);
    let response;
    try {
      response = await fetchToken(endpoint, {
        headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
        redirect: 'error', signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new Error('GitHub OIDC token request failed; no redirect or credential was exposed.');
    }
    if (response.status !== 200) throw new Error(`GitHub OIDC token request failed (HTTP ${response.status}).`);
    let token, claims;
    try {
      const body = await response.text();
      if (body.length > 65_536) throw new Error();
      token = JSON.parse(body).value;
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error();
      claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (claims.iss !== issuer || ![claims.aud].flat().includes(audience) ||
          claims.repository !== env.GITHUB_REPOSITORY || !Number.isFinite(claims.exp) ||
          claims.exp * 1000 <= now() + 60_000) throw new Error();
    } catch {
      throw new Error('GitHub OIDC returned an invalid, expired, or mismatched identity.');
    }
    mask(token);
    cached = { token, refreshAt: claims.exp * 1000 - 60_000 };
    return token;
  }
  return async () => {
    if (cached && now() < cached.refreshAt) return cached.token;
    if (!pending) pending = obtain().finally(() => { pending = undefined; });
    return pending;
  };
}

export function githubPreviewAccess(base, getToken = createGitHubOidcTokenProvider()) {
  const boundary = previewAccess(base);
  return {
    origin: boundary.origin,
    async headersFor(target, original = {}) {
      // Do not even request a token for off-origin resources.
      if (new URL(target).origin !== boundary.origin) return boundary.headersFor(target, original);
      return previewAccess(base, '', await getToken()).headersFor(target, original);
    }
  };
}
