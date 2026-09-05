'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function load(relativePath){
  return import(pathToFileURL(path.join(root, relativePath)).href);
}

async function invoke(handler, method = 'GET'){
  const output = { statusCode:0, headers:{}, body:undefined };
  const response = {
    setHeader(key, value){ output.headers[key.toLowerCase()] = value; },
    status(statusCode){ output.statusCode = statusCode; return this; },
    json(body){ output.body = body; return output; },
    end(){ return output; }
  };
  await handler({ method }, response);
  return output;
}

test('release identity is explicit and public config matches it', async () => {
  const release = await load('lib/release-config.js');
  assert.equal(release.API_CONTRACT_VERSION, 'V198');
  assert.equal(release.PRODUCT_VERSION, 'V266');

  const source = fs.readFileSync(path.join(root, 'public-config.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  assert.equal(window.AQARI_PUBLIC_CONFIG.version, 'V198');
  assert.equal(window.AQARI_PUBLIC_CONFIG.apiContractVersion, release.API_CONTRACT_VERSION);
  assert.equal(window.AQARI_PUBLIC_CONFIG.productVersion, release.PRODUCT_VERSION);
  assert.equal(window.AQARI_PUBLIC_CONFIG.supabaseUrl, release.SUPABASE_PUBLIC_CONFIG.url);
  assert.equal(window.AQARI_PUBLIC_CONFIG.supabasePublishableKey, release.SUPABASE_PUBLIC_CONFIG.publishableKey);
});

test('Supabase probe succeeds through the data-free health RPC', async () => {
  const probe = await load('lib/supabase-probe.js');
  probe.resetSupabaseProbeForTests();
  let request;
  const connection = await probe.probeSupabase({
    url:'https://example.supabase.co',
    publishableKey:'sb_publishable_test',
    fetchImpl:async (url, options) => {
      request = { url, options };
      return { ok:true, status:200, async json(){ return true; } };
    }
  });
  assert.equal(connection.state, 'up');
  assert.equal(connection.connected, true);
  assert.equal(connection.verified, true);
  assert.equal(request.options.method, 'GET');
  assert.match(request.url, /\/rest\/v1\/rpc\/aqari_runtime_health$/);
  assert.doesNotMatch(request.url, /aqari_workspaces|select=|limit=/);
  assert.equal(request.options.headers.apikey, 'sb_publishable_test');
  assert.equal(request.options.body, undefined);
});

test('health RPC is public, invoker-safe, and reads no application data', () => {
  const sql = fs.readFileSync(path.join(
    root,
    'supabase/migrations/20260905010500_v211_1_2_runtime_health_rpc.sql'
  ), 'utf8');
  assert.match(sql, /create or replace function public\.aqari_runtime_health\(\)/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.aqari_runtime_health\(\) from public/i);
  assert.match(sql, /grant execute on function public\.aqari_runtime_health\(\) to anon, authenticated/i);
  assert.doesNotMatch(sql, /security definer|from\s+public\.|insert|update|delete/i);
});

test('Supabase probe distinguishes down, timeout, and misconfigured states', async () => {
  const probe = await load('lib/supabase-probe.js');

  probe.resetSupabaseProbeForTests();
  const down = await probe.probeSupabase({
    url:'https://example.supabase.co', publishableKey:'sb_publishable_test',
    fetchImpl:async () => ({ ok:false, status:503, async json(){ return null; } })
  });
  assert.equal(down.state, 'down');
  assert.equal(down.connected, false);
  assert.equal(down.verified, true);
  assert.equal(down.httpStatus, 503);

  probe.resetSupabaseProbeForTests();
  const timeout = await probe.probeSupabase({
    url:'https://example.supabase.co', publishableKey:'sb_publishable_test', timeoutMs:5,
    fetchImpl:(_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once:true });
    })
  });
  assert.equal(timeout.state, 'timeout');
  assert.equal(timeout.connected, null);
  assert.equal(timeout.verified, false);

  probe.resetSupabaseProbeForTests();
  let calls = 0;
  const misconfigured = await probe.probeSupabase({
    url:'', publishableKey:'', fetchImpl:async () => { calls += 1; }
  });
  assert.equal(misconfigured.state, 'misconfigured');
  assert.equal(misconfigured.connected, null);
  assert.equal(misconfigured.verified, false);
  assert.equal(calls, 0);
});

test('Supabase probe deduplicates concurrent calls and caches for 60 seconds', async () => {
  const probe = await load('lib/supabase-probe.js');
  probe.resetSupabaseProbeForTests();
  let calls = 0;
  let clock = 1_000;
  const options = {
    url:'https://example.supabase.co', publishableKey:'sb_publishable_test',
    now:() => clock,
    fetchImpl:async () => {
      calls += 1;
      await new Promise(resolve => setTimeout(resolve, 2));
      return { ok:true, status:200, async json(){ return true; } };
    }
  };
  await Promise.all([probe.probeSupabase(options), probe.probeSupabase(options), probe.probeSupabase(options)]);
  assert.equal(calls, 1);
  clock += 59_999;
  await probe.probeSupabase(options);
  assert.equal(calls, 1);
  clock += 2;
  await probe.probeSupabase(options);
  assert.equal(calls, 2);
});

test('operational APIs expose accurate identity without legacy secret names', async () => {
  const forbidden = [
    'DATABASE_URL','AUTH_SECRET','MFA_ENCRYPTION_KEY','S3_ENDPOINT','S3_BUCKET',
    'S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','RESEND_API_KEY','WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID','PAYMENT_WEBHOOK_SECRET'
  ];
  const previous = {
    environment:process.env.VERCEL_ENV,
    gitSha:process.env.VERCEL_GIT_COMMIT_SHA,
    url:process.env.VERCEL_URL,
    fetch:global.fetch
  };
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
  process.env.VERCEL_URL = 'aqari-preview.vercel.app';
  global.fetch = async () => ({ ok:true, status:200, async json(){ return true; } });
  try{
    for(const relativePath of [
      'api/health.js','api/health/deep.js','api/release.js','api/production-meta.js',
      'api/ops/status.js','api/config-status.js','api/supabase-status.js',
      'api/production-readiness.js','api/final-release-status.js','api/cloud-sync-status.js',
      'api/migration-status.js','api/autosync-status.js'
    ]){
      const handler = (await load(relativePath)).default;
      const response = await invoke(handler);
      assert.equal(response.statusCode, 200, relativePath);
      assert.equal(response.body.version, 'V198', relativePath);
      assert.equal(response.body.apiContractVersion, 'V198', relativePath);
      assert.equal(response.body.productVersion, 'V266', relativePath);
      const serialized = JSON.stringify(response.body);
      for(const name of forbidden) assert.equal(serialized.includes(name), false, `${relativePath} leaked ${name}`);
      assert.equal(serialized.includes('releasePreparationSnapshot'), false, `${relativePath} leaked a stale snapshot`);
    }
  }finally{
    for(const [key, value] of [['VERCEL_ENV',previous.environment],['VERCEL_GIT_COMMIT_SHA',previous.gitSha],['VERCEL_URL',previous.url]]){
      if(value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = previous.fetch;
  }
});

test('readiness uses active public configuration and the real readiness flag', async () => {
  const previous = {
    environment:process.env.VERCEL_ENV,
    gitSha:process.env.VERCEL_GIT_COMMIT_SHA,
    url:process.env.VERCEL_URL,
    fetch:global.fetch
  };
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_GIT_COMMIT_SHA = 'b'.repeat(40);
  process.env.VERCEL_URL = 'aqari-preview.vercel.app';
  global.fetch = async () => ({ ok:true, status:200, async json(){ return true; } });
  (await load('lib/supabase-probe.js')).resetSupabaseProbeForTests();
  const readiness = (await load('api/production-readiness.js')).default;
  try{
    const response = await invoke(readiness);
    assert.equal(response.body.configured.SUPABASE_PUBLIC_URL, true);
    assert.equal(response.body.configured.SUPABASE_PUBLISHABLE_KEY, true);
    assert.equal(response.body.summary.passed, 3);
    assert.equal(response.body.summary.required, 3);
    assert.equal(response.body.ready, true);
    assert.equal(response.body.summary.ready, true);
    assert.equal(response.body.checks.supabaseConnection.state, 'up');
  }finally{
    for(const [key, value] of [['VERCEL_ENV',previous.environment],['VERCEL_GIT_COMMIT_SHA',previous.gitSha],['VERCEL_URL',previous.url]]){
      if(value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = previous.fetch;
  }

  const source = fs.readFileSync(path.join(root, 'production-status.js'), 'utf8');
  assert.match(source, /ready\?\.ready === true/);
  assert.doesNotMatch(source, /ready\?\.ok === true/);
});

test('Supabase status keeps browser no-store and enables 60-second CDN caching', async () => {
  const handler = (await load('api/supabase-status.js')).default;
  const response = await invoke(handler);
  assert.equal(response.headers['cache-control'], 'no-store, max-age=0');
  assert.match(response.headers['cdn-cache-control'], /s-maxage=60/);
  assert.match(response.headers['vercel-cdn-cache-control'], /s-maxage=60/);
});
