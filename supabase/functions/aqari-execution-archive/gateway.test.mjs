import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, SignJWT} from 'jose';
import {environmentFor, verifyWorkload} from './auth.mjs';
import {archiveConfig, createHandler} from './gateway.mjs';

const {privateKey, publicKey} = await generateKeyPair('RS256');
const now = Math.floor(Date.now() / 1000);
const claims = {iss: 'https://oidc.vercel.com/m-vib-5421', aud: 'https://vercel.com/m-vib-5421',
  sub: 'owner:m-vib-5421:project:aqari:environment:preview', iat: now, nbf: now, exp: now + 7200,
  owner: 'm-vib-5421', owner_id: 'team_3JLkJpO4ZFRwQrkmAR9AQUT5', project: 'aqari',
  project_id: 'prj_qQcBwwuucyXoyUSbIVwjhPKmA97E', environment: 'preview'};
const sign = (patch = {}, key = privateKey, header = {}) => new SignJWT({...claims, ...patch})
  .setProtectedHeader({typ: 'JWT', alg: 'RS256', ...header}).sign(key);
const token = await sign();
const verify = (value, environment) => verifyWorkload(value, environment, publicKey);
const url = 'https://ofgmcsmxmdswlovsckqs.supabase.co';
const vars = {SUPABASE_URL: url, SUPABASE_SECRET_KEYS: '{"default":"sb_secret_LOCAL_TEST_ONLY"}',
  SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_LOCAL_TEST_ONLY"}'};
const actor = '00000000-0000-4000-8000-000000000001';
const packageId = '00000000-0000-4000-8000-000000000002';
const source = {actor_id: actor, workspace_id: '00000000-0000-4000-8000-000000000003',
  settlement_id: '00000000-0000-4000-8000-000000000004', contract_document_id: '00000000-0000-4000-8000-000000000005',
  contract_ref: 'SYNTHETIC', prepared_at: new Date().toISOString(), receipt_no: '', contract_receipt_sequence: null};
const payload = {p_package_id: packageId, p_actor_id: actor, p_source: source, p_receipt_artifacts: null,
  p_renderer_version: 'v267-execution-package-1', p_tenant_pdf_base64: 'JVBERi1maXh0dXJl', p_tenant_pdf_sha256: 'a'.repeat(64),
  p_owner_pdf_base64: 'JVBERi1maXh0dXJl', p_owner_pdf_sha256: 'b'.repeat(64),
  p_receipt_pdf_base64: null, p_receipt_pdf_sha256: null};
const fixture = ({env = {}, response, workloadVerify = verify} = {}) => {
  const calls = [];
  const handler = createHandler({getEnv: name => ({...vars, ...env})[name], verify: workloadVerify,
    fetcher: async (target, options) => {
      calls.push({target, options});
      if (response) return response(calls.length, target, options);
      const value = calls.length === 1 ? {id: actor} : calls.length === 2 ? source
        : {package_id: packageId, expires_at: new Date(Date.now() + 60000).toISOString(), replayed: false, secret: 'not-returned'};
      return Response.json(value);
    }});
  const request = (body = {operation: 'commit', payload}, headers = {}, method = 'POST') => handler(new Request('https://gateway.invalid', {
    method, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      'X-Aqari-User-Authorization': 'Bearer real.user.jwt', ...headers},
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  return {calls, request, handler};
};

test('signed workload is accepted only for its exact environment', async () => {
  await verify(token, 'preview');
  await assert.rejects(verify(token, 'production'));
  await assert.rejects(verify(token, 'development'));
});
for (const [name, patch] of Object.entries({
  issuer: {iss: 'https://attacker.invalid'}, globalIssuer: {iss: 'https://oidc.vercel.com'},
  audience: {aud: 'other'}, subject: {sub: 'owner:other:project:aqari:environment:preview'},
  owner: {owner: 'other'}, ownerId: {owner_id: 'team_other'}, project: {project: 'other'},
  projectId: {project_id: 'prj_other'}, environment: {environment: 'production'},
  expired: {exp: now - 30}, notYetValid: {nbf: now + 90}, missingExpiry: {exp: undefined},
  missingIssued: {iat: undefined}, missingNotBefore: {nbf: undefined}, excessiveLifetime: {exp: now + 10000},
})) test(`rejects signed but unauthorized workload: ${name}`, async () => {
  await assert.rejects(verify(await sign(patch), 'preview'));
});
test('forged signature, altered header and missing JWT type fail', async () => {
  const other = await generateKeyPair('RS256');
  await assert.rejects(verify(await sign({}, other.privateKey), 'preview'));
  await assert.rejects(verify(await sign({}, privateKey, {typ: undefined}), 'preview'));
  const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({...claims, project_id: 'prj_other'})).toString('base64url');
  await assert.rejects(verify(parts.join('.'), 'preview'));
  await assert.rejects(verify('x'.repeat(16385), 'preview'));
  await assert.rejects(verify('invalid', 'preview'));
});
test('unknown project and mismatched production mapping fail closed', () => {
  assert.equal(environmentFor('https://djkpkkgoibruaezdrchb.supabase.co'), 'production');
  for (const bad of ['https://other.supabase.co', url + '/', undefined, '__proto__']) assert.throws(() => environmentFor(bad));
  assert.throws(() => archiveConfig(() => undefined));
});
test('readiness authenticates workload and touches no user or database', async () => {
  const f = fixture(); const response = await f.request({operation: 'check'});
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {configured: true});
  assert.equal(f.calls.length, 0);
  const denied = await f.request({operation: 'check'}, {Authorization: 'Bearer forged.token.value'});
  assert.equal(denied.status, 401); assert.equal(f.calls.length, 0);
});
test('a preview workload cannot reach production and no authentication bypass exists', async () => {
  const f = fixture({env: {SUPABASE_URL: 'https://djkpkkgoibruaezdrchb.supabase.co'}});
  assert.equal((await f.request({operation: 'check'})).status, 401);
  assert.equal(f.calls.length, 0);
  const missing = fixture({env: {SUPABASE_SECRET_KEYS: '{}'}});
  assert.equal((await missing.request()).status, 503); assert.equal(missing.calls.length, 0);
});
test('commit independently checks real user, exact source and fixed operation', async () => {
  const f = fixture(); const response = await f.request();
  assert.equal(response.status, 200); assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls.map(x => x.target), [url + '/auth/v1/user', url + '/rest/v1/rpc/aqari_contract_execution_package_source', url + '/rest/v1/rpc/aqari_contract_execution_package_commit']);
  for (const call of f.calls) { assert.equal(call.options.redirect, 'error'); assert.ok(call.options.signal instanceof AbortSignal); }
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer real.user.jwt');
  assert.equal(f.calls[1].options.headers.apikey, 'sb_publishable_LOCAL_TEST_ONLY');
  assert.equal(f.calls[2].options.headers.apikey, 'sb_secret_LOCAL_TEST_ONLY');
  assert.equal(f.calls[2].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(f.calls[2].options.body), payload);
  assert.deepEqual(Object.keys(await response.json()).sort(), ['expires_at', 'package_id', 'replayed']);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
test('legacy credential remains server-only and is sent only to fixed commit', async () => {
  const f = fixture({env: {SUPABASE_SECRET_KEYS: '{}', SUPABASE_SERVICE_ROLE_KEY: 'legacy.local.test'}});
  assert.equal((await f.request()).status, 200);
  assert.equal(f.calls[2].options.headers.Authorization, 'Bearer legacy.local.test');
});
test('arbitrary operations, extra fields and invalid PDFs never reach database', async () => {
  for (const body of [{operation: 'delete'}, {operation: 'check', url: 'https://evil.invalid'},
    {operation: 'commit', payload: {...payload, url: 'evil'}}, {operation: 'commit', payload: {...payload, p_actor_id: 'wrong'}},
    {operation: 'commit', payload: {...payload, p_renderer_version: 'other'}},
    {operation: 'commit', payload: {...payload, p_tenant_pdf_base64: 'not-pdf'}},
    {operation: 'commit', payload: {...payload, p_receipt_pdf_sha256: '0'.repeat(64)}}]) {
    const f = fixture(); assert.equal((await f.request(body)).status, 400); assert.equal(f.calls.length, 0);
  }
});
test('invalid user, denied source and source drift never reach privileged commit', async () => {
  for (const [stage, value, status] of [[1, {id: 'wrong'}, 200], [1, {error: 'private'}, 401],
    [2, {error: 'MFA_REQUIRED'}, 403], [2, {...source, actor_id: 'wrong'}, 200]]) {
    const f = fixture({response: n => Response.json(n === stage ? value : {id: actor}, {status: n === stage ? status : 200})});
    const r = await f.request(); assert.equal(r.status, 403); assert.equal(f.calls.length, stage);
    assert.deepEqual(await r.json(), {error: 'ACCESS_DENIED'});
  }
  const f = fixture(); assert.equal((await f.request(undefined, {'X-Aqari-User-Authorization': ''})).status, 403);
  assert.equal(f.calls.length, 0);
});
test('body limits, wrong methods, compressed bodies and malformed JSON fail closed', async () => {
  const f = fixture();
  assert.equal((await f.request(undefined, {}, 'GET')).status, 405);
  assert.equal((await f.request(undefined, {'Content-Length': String(10 * 1024 * 1024)})).status, 400);
  assert.equal((await f.request(undefined, {'Content-Encoding': 'gzip'})).status, 400);
  assert.equal((await f.request({operation: 'commit', payload: 'x'.repeat(9 * 1024 * 1024)})).status, 400);
  const raw = new Request('https://gateway.invalid', {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: '{'});
  assert.equal((await f.handler(raw)).status, 400); assert.equal(f.calls.length, 0);
});
test('unknown, huge or failed commit response never reports success or leaks internal error', async () => {
  for (const result of [{package_id: 'other'}, {package_id: packageId, expires_at: 'bad'}, {error: 'private'}]) {
    const f = fixture({response: n => Response.json(n === 1 ? {id: actor} : n === 2 ? source : result)});
    const r = await f.request(); assert.equal(r.status, 502); assert.deepEqual(await r.json(), {error: 'ARCHIVE_WRITE_NOT_CONFIRMED'});
  }
  const f = fixture({response: n => n < 3 ? Response.json(n === 1 ? {id: actor} : source) : new Response('x'.repeat(16385))});
  assert.equal((await f.request()).status, 502);
});
