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
      const authorization = ['Bearer', env.ACTIONS_ID_TOKEN_REQUEST_TOKEN].join(' ');
      response = await fetchToken(endpoint, {
        headers: { authorization },
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
    // Only non-secret identity claims are diagnostic; never log the JWT or runner credential.
    if (env.AQARI_PREVIEW_OIDC_DIAGNOSTICS === '1') {
      console.log('GitHub Preview identity scope:', JSON.stringify(Object.fromEntries(
        ['iss', 'aud', 'sub', 'repository', 'repository_id', 'ref', 'workflow_ref']
          .map(key => [key, claims[key]])
      )));
    }
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

export class PreviewResolverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PreviewResolverError';
    this.code = code;
  }
}

function resolverError(code, message) {
  return new PreviewResolverError(code, message);
}

const retryableResolverCodes = new Set([
  'LOOKUP_DEPLOYMENTS_FAILED',
  'LOOKUP_DEPLOYMENTS_HTTP',
  'LOOKUP_STATUSES_FAILED',
  'LOOKUP_STATUSES_HTTP',
  'NO_EXACT_SHA_DEPLOYMENT',
  'NO_EXACT_SHA_MATCH'
]);

export function shouldRetryPreviewResolverError(error) {
  return retryableResolverCodes.has(error?.code);
}

function parseSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw resolverError('CONFIG_EXPECTED_SHA_INVALID', 'AQARI_EXPECTED_SHA is missing or invalid.');
  return sha;
}

function parseApiBase(apiBase) {
  let parsed;
  try { parsed = new URL(String(apiBase || 'https://api.github.com')); } catch {
    throw resolverError('CONFIG_API_ENDPOINT_INVALID', 'GitHub API endpoint is missing or invalid.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw resolverError('CONFIG_API_ENDPOINT_UNSAFE', 'GitHub API endpoint must be a clean HTTPS origin.');
  }
  return parsed;
}

async function readJson(response) {
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error('GitHub API response exceeded the size limit.');
  return JSON.parse(body);
}

function selectPreviewUrl(urlCandidate, project, team) {
  if (typeof urlCandidate !== 'string' || !urlCandidate.trim()) return null;
  let url;
  try { url = new URL(urlCandidate); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'myaqari.com' || hostname === 'www.myaqari.com' || hostname === `${project}.vercel.app`) return null;
  if (!hostname.startsWith(`${project}-git-`) || !hostname.endsWith(`-${team}.vercel.app`)) return null;
  return url.toString();
}

function hasSafeStatusesQuery(searchParams) {
  for (const [key, value] of searchParams) {
    if (!['page', 'per_page'].includes(key) || !/^\d+$/.test(value)) return false;
  }
  return true;
}

function isApprovedStatusesPath(pathname, owner, repo) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 6 || segments[0] !== 'repos' || segments[3] !== 'deployments' || segments[5] !== 'statuses') {
    return false;
  }
  try {
    return decodeURIComponent(segments[1]) === owner &&
      decodeURIComponent(segments[2]) === repo &&
      /^\d+$/.test(segments[4]);
  } catch {
    return false;
  }
}

function githubApiRequestOptions(token) {
  return {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: ['Bearer', token].join(' '),
      'x-github-api-version': '2022-11-28'
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  };
}

export async function resolveGitHubPreviewDeploymentUrl({
  env = process.env, fetchApi = globalThis.fetch
} = {}) {
  const expectedSha = parseSha(env.AQARI_EXPECTED_SHA);
  const repository = String(env.GITHUB_REPOSITORY || '').trim();
  const token = String(env.GITHUB_TOKEN || '').trim();
  const project = String(env.AQARI_PROJECT_SLUG || '').trim().toLowerCase();
  const team = String(env.AQARI_TEAM_SLUG || '').trim().toLowerCase();
  const repositoryMatch = repository.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!repositoryMatch || !token || !/^[a-z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(team)) {
    throw resolverError('CONFIG_INCOMPLETE', 'Preview deployment resolver configuration is incomplete.');
  }
  const [, owner, repo] = repositoryMatch;
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const apiBase = parseApiBase(env.GITHUB_API_URL);
  const perPage = 100;
  const deploymentsUrl = new URL(`/repos/${encodedOwner}/${encodedRepo}/deployments`, apiBase);
  deploymentsUrl.searchParams.set('sha', expectedSha);
  deploymentsUrl.searchParams.set('per_page', String(perPage));
  const matching = [];
  let sawAnyDeployment = false;
  for (let page = 1; ; page++) {
    deploymentsUrl.searchParams.set('page', String(page));
    let response;
    try {
      response = await fetchApi(deploymentsUrl, githubApiRequestOptions(token));
    } catch {
      throw resolverError('LOOKUP_DEPLOYMENTS_FAILED', 'GitHub deployments lookup failed.');
    }
    if (response.status !== 200) throw resolverError('LOOKUP_DEPLOYMENTS_HTTP', `GitHub deployments lookup failed (HTTP ${response.status}).`);
    let deployments;
    try { deployments = await readJson(response); } catch {
      throw resolverError('PAYLOAD_DEPLOYMENTS_INVALID', 'GitHub deployments payload is invalid.');
    }
    if (!Array.isArray(deployments)) {
      throw resolverError('PAYLOAD_DEPLOYMENTS_INVALID', 'GitHub deployments payload is invalid.');
    }
    if (!deployments.length) break;
    sawAnyDeployment = true;
    for (const deployment of deployments) {
      if (String(deployment?.sha || '').toLowerCase() === expectedSha) matching.push(deployment);
    }
    if (deployments.length < perPage) break;
  }
  if (!sawAnyDeployment) {
    throw resolverError('NO_EXACT_SHA_DEPLOYMENT', 'No GitHub deployment is registered for the exact SHA.');
  }
  if (!matching.length) throw resolverError('NO_EXACT_SHA_MATCH', 'GitHub deployments were found, but none match the exact SHA.');
  let foundStatusEndpoint = false;
  let foundStatusUrl = false;
  for (const deployment of matching) {
    const statusesUrl = String(deployment?.statuses_url || '').trim();
    if (!statusesUrl) continue;
    foundStatusEndpoint = true;
    let statusesEndpoint;
    try { statusesEndpoint = new URL(statusesUrl); } catch {
      throw resolverError('STATUS_ENDPOINT_INVALID', 'Matching GitHub deployment found, but its status endpoint is invalid.');
    }
    if (statusesEndpoint.origin !== apiBase.origin || statusesEndpoint.protocol !== 'https:' ||
        statusesEndpoint.username || statusesEndpoint.password || statusesEndpoint.hash) {
      throw resolverError('STATUS_ENDPOINT_UNAPPROVED_HOST', 'Matching GitHub deployment found, but its status endpoint is not an approved GitHub API host.');
    }
    if (!hasSafeStatusesQuery(statusesEndpoint.searchParams) || !isApprovedStatusesPath(statusesEndpoint.pathname, owner, repo)) {
      throw resolverError('STATUS_ENDPOINT_UNAPPROVED_URL', 'Matching GitHub deployment found, but its status endpoint is not an approved deployments statuses URL.');
    }
    let statusResponse;
    try {
      statusResponse = await fetchApi(statusesEndpoint, {
        ...githubApiRequestOptions(token)
      });
    } catch {
      throw resolverError('LOOKUP_STATUSES_FAILED', 'GitHub deployment status lookup failed.');
    }
    if (statusResponse.status !== 200) {
      throw resolverError('LOOKUP_STATUSES_HTTP', `GitHub deployment status lookup failed (HTTP ${statusResponse.status}).`);
    }
    let statuses;
    try { statuses = await readJson(statusResponse); } catch {
      throw resolverError('PAYLOAD_STATUSES_INVALID', 'GitHub deployment statuses payload is invalid.');
    }
    if (!Array.isArray(statuses)) throw resolverError('PAYLOAD_STATUSES_INVALID', 'GitHub deployment statuses payload is invalid.');
    for (const status of statuses) {
      const candidate = status?.environment_url ?? status?.target_url;
      if (typeof candidate === 'string' && candidate.trim()) foundStatusUrl = true;
      const previewUrl = selectPreviewUrl(candidate, project, team);
      if (previewUrl) return previewUrl;
    }
  }
  if (!foundStatusEndpoint) {
    throw resolverError('STATUS_ENDPOINT_MISSING', 'Matching GitHub deployment found, but no deployment status endpoint is available.');
  }
  if (!foundStatusUrl) {
    throw resolverError('STATUS_URL_MISSING', 'Matching GitHub deployment found, but statuses do not expose a Preview URL.');
  }
  throw resolverError('PREVIEW_URL_INVALID', 'Matching GitHub deployment found, but the Preview URL is invalid or non-Preview.');
}
