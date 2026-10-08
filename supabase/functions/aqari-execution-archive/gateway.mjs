import {environmentFor, verifyWorkload} from './auth.mjs';

const MAX_BODY = 9 * 1024 * 1024;
const COMMIT = '/rest/v1/rpc/aqari_contract_execution_package_commit';
const SOURCE = '/rest/v1/rpc/aqari_contract_execution_package_source';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ['p_package_id', 'p_actor_id', 'p_source', 'p_receipt_artifacts',
  'p_renderer_version', 'p_receipt_pdf_base64', 'p_receipt_pdf_sha256',
  'p_tenant_pdf_base64', 'p_tenant_pdf_sha256', 'p_owner_pdf_base64', 'p_owner_pdf_sha256'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, expected) => object(value) && Object.keys(value).length === expected.length
  && expected.every(key => Object.hasOwn(value, key));
const canonical = value => JSON.stringify(value, (_, item) => object(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const reply = (status, body) => new Response(JSON.stringify(body), {status, headers: {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
}});

async function boundedJson(message, limit) {
  const reader = message.body?.getReader();
  if (!reader) throw Error('INVALID_BODY');
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error('INVALID_BODY');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } finally { await reader.cancel().catch(() => {}); }
}

export function archiveConfig(getEnv) {
  const url = getEnv('SUPABASE_URL');
  const environment = environmentFor(url);
  // Secrets remain inside Supabase. Neither diagnostics nor error responses
  // return their values; there is no endpoint that reads arbitrary environment.
  const secretKeys = JSON.parse(getEnv('SUPABASE_SECRET_KEYS') || '{}');
  const secret = secretKeys.default || getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const publishableKeys = JSON.parse(getEnv('SUPABASE_PUBLISHABLE_KEYS') || '{}');
  const publicKey = publishableKeys.default || getEnv('SUPABASE_ANON_KEY');
  if (typeof secret !== 'string' || !secret || typeof publicKey !== 'string' || !publicKey) {
    throw Error('UNCONFIGURED_PROJECT');
  }
  return {url, environment, secret, publicKey};
}

export function createHandler({getEnv, fetcher = fetch, verify = verifyWorkload}) {
  return async request => {
    if (request.method !== 'POST') return reply(405, {error: 'METHOD_NOT_ALLOWED'});
    let config;
    try { config = archiveConfig(getEnv); }
    catch { return reply(503, {error: 'ARCHIVE_UNAVAILABLE'}); }
    try {
      const authorization = request.headers.get('Authorization') || '';
      if (!authorization.startsWith('Bearer ')) throw Error('ACCESS_DENIED');
      await verify(authorization.slice(7), config.environment);
    } catch { return reply(401, {error: 'ACCESS_DENIED'}); }

    let body;
    try {
      if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json'
          || request.headers.get('Content-Encoding')
          || Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw Error('INVALID_BODY');
      body = await boundedJson(request, MAX_BODY);
      if (exactKeys(body, ['operation']) && body.operation === 'check') {
        // Authenticates a real deployment, but makes no database call or write.
        return reply(200, {configured: true});
      }
      if (!exactKeys(body, ['operation', 'payload']) || body.operation !== 'commit'
          || !exactKeys(body.payload, fields)) throw Error('INVALID_BODY');
      const p = body.payload;
      if (!UUID.test(p.p_package_id) || !UUID.test(p.p_actor_id) || !object(p.p_source)
          || p.p_source.actor_id !== p.p_actor_id
          || p.p_renderer_version !== 'v267-execution-package-1') throw Error('INVALID_BODY');
      for (const role of ['tenant', 'owner', 'receipt']) {
        const pdf = p[`p_${role}_pdf_base64`], hash = p[`p_${role}_pdf_sha256`];
        if (role === 'receipt' && pdf === null && hash === null) continue;
        if (typeof pdf !== 'string' || pdf.length < 12 || pdf.length > 2796204
            || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdf) || !/^[a-f0-9]{64}$/.test(hash)) throw Error('INVALID_BODY');
      }
    } catch { return reply(400, {error: 'INVALID_REQUEST'}); }

    // Independent user verification keeps this narrow workload identity from
    // becoming an impersonation proxy. All user RLS and source guards run again.
    const userAuthorization = request.headers.get('X-Aqari-User-Authorization') || '';
    if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(userAuthorization)
        || userAuthorization.length > 16391) return reply(403, {error: 'ACCESS_DENIED'});
    const p = body.payload;
    const userHeaders = {apikey: config.publicKey, Authorization: userAuthorization,
      'Content-Type': 'application/json', Accept: 'application/json'};
    const read = async (path, headers, payload, max = 1048576) => {
      const response = await fetcher(config.url + path, {method: payload ? 'POST' : 'GET', headers,
        body: payload ? JSON.stringify(payload) : undefined, redirect: 'error', signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('UPSTREAM_REJECTED');
      return boundedJson(response, max);
    };
    try {
      const user = await read('/auth/v1/user', userHeaders);
      if (user.id !== p.p_actor_id) throw Error('ACTOR_MISMATCH');
      const s = p.p_source;
      const source = await read(SOURCE, userHeaders, {
        p_workspace_id: s.workspace_id, p_contract_ref: s.contract_ref,
        p_settlement_id: s.settlement_id, p_contract_document_id: s.contract_document_id,
        p_prepared_at: s.prepared_at, p_receipt_no: s.receipt_no,
        p_contract_receipt_sequence: s.contract_receipt_sequence,
      });
      if (canonical(source) !== canonical(s)) throw Error('SOURCE_CHANGED');
    } catch { return reply(403, {error: 'ACCESS_DENIED'}); }

    try {
      const headers = {apikey: config.secret, 'Content-Type': 'application/json', Accept: 'application/json'};
      if (!config.secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${config.secret}`;
      // Fixed operation, fixed project, no client-specified URL/RPC/SQL, no redirects.
      const result = await read(COMMIT, headers, p, 16384);
      if (!object(result) || result.package_id !== p.p_package_id || !Number.isFinite(Date.parse(result.expires_at))) {
        throw Error('ARCHIVE_WRITE_NOT_CONFIRMED');
      }
      // Allowlist output so database messages and credentials cannot escape.
      return reply(200, {package_id: result.package_id, expires_at: result.expires_at, replayed: result.replayed === true});
    } catch { return reply(502, {error: 'ARCHIVE_WRITE_NOT_CONFIRMED'}); }
  };
}
