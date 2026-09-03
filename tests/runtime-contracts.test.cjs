'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function loadHandler(relativePath) {
  const url = pathToFileURL(path.join(root, relativePath)).href;
  const module = await import(url);
  assert.equal(typeof module.default, 'function', relativePath + ' must default-export a handler');
  return module.default;
}

async function invoke(handler, method = 'GET') {
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

  await handler({ method }, response);
  return output;
}

for (const relativePath of [
  'api/health.js',
  'api/health/deep.js',
  'api/ops/status.js',
  'api/release.js',
  'api/config-status.js',
  'api/supabase-status.js',
  'api/migration-status.js',
  'api/autosync-status.js',
  'api/cloud-sync-status.js',
  'api/production-readiness.js',
  'api/final-release-status.js',
  'api/production-meta.js',
]) {
  test(relativePath + ' follows the read-only HTTP contract', async () => {
    const handler = await loadHandler(relativePath);
    const get = await invoke(handler, 'GET');
    assert.equal(get.statusCode, 200);
    assert.equal(get.body.ok, true);
    assert.equal(get.headers['cache-control'], 'no-store, max-age=0');
    assert.equal(get.headers['x-content-type-options'], 'nosniff');
    assert.equal((await invoke(handler, 'HEAD')).statusCode, 200);
    const post = await invoke(handler, 'POST');
    assert.equal(post.statusCode, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
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

test('Vercel security headers preserve the hardened contract', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const dbStatusRewrites = config.rewrites.filter((rewrite) => rewrite.source === '/api/db/status');
  const allRule = config.headers.find((rule) => rule.source === '/(.*)');
  const apiRule = config.headers.find((rule) => rule.source === '/api/(.*)');
  const values = Object.fromEntries(allRule.headers.map((header) => [header.key, header.value]));
  assert.deepEqual(dbStatusRewrites, [{
    source: '/api/db/status',
    destination: '/api/supabase-status',
  }]);
  assert.equal(fs.existsSync(path.join(root, 'api/db/status.js')), false);
  assert.equal(values['X-Frame-Options'], 'DENY');
  assert.equal(values['X-Content-Type-Options'], 'nosniff');
  assert.equal(apiRule.headers.find((header) => header.key === 'Cache-Control').value, 'no-store, max-age=0');
});

test('V198 secure cloud bridge replaces local-only authentication', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');

  assert.match(html, /id="aqari-v198-secure-cloud-js"/);
  assert.match(html, /document\.title=s\.appName\+' • AQARI V198'/);
  assert.match(html, /#auth,#loginGateV120\{display:none!important\}/);
  assert.ok(html.lastIndexOf('aqari-v198-secure-cloud-js') > html.lastIndexOf('production-lockdown.js'));
  assert.match(bridge, /window\.login = window\.cloudLoginV198/);
  assert.match(bridge, /window\.loginLocalV120 = window\.cloudLoginV198/);
  assert.match(bridge, /AQARI_SUPABASE\.signIn/);
  assert.match(bridge, /membership\?\.is_active/);
  assert.match(bridge, /source: 'supabase'/);
  assert.doesNotMatch(bridge, /1234/);
  assert.match(adapter, /storage: window\.sessionStorage/);
  assert.match(adapter, /\.eq\('revision', expected\)/);
  assert.doesNotMatch(adapter, /\.upsert\(/);
  const profileQueryStart = adapter.indexOf(".from('aqari_profiles')");
  const profileQueryEnd = adapter.indexOf('if(profileError)', profileQueryStart);
  assert.notEqual(profileQueryStart, -1);
  assert.notEqual(profileQueryEnd, -1);
  const profileQuery = adapter.slice(profileQueryStart, profileQueryEnd);
  assert.match(profileQuery, /\.select\('user_id, display_name, created_at, updated_at'\)/);
  assert.doesNotMatch(profileQuery, /\brole\b|\bis_active\b/);
  assert.match(sync, /SENSITIVE_KEY/);
});

test('V201 quiet-luxury experience preserves the V198 secure runtime', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'v199-ui.css'), 'utf8');
  const luxury = fs.readFileSync(path.join(root, 'v200-luxury.css'), 'utf8');
  const easy = fs.readFileSync(path.join(root, 'v201-easy.css'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'v199-ui.js'), 'utf8');
  const experience = fs.readFileSync(path.join(root, 'v201-experience.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');

  assert.match(html, /id="aqari-v198-secure-cloud-js"/);
  assert.match(loader, /installV199Preview/);
  assert.match(loader, /stylesheet\.href = '\/v199-ui\.css'/);
  assert.match(loader, /script\.src = '\/v199-ui\.js'/);
  assert.match(loader, /luxury\.href = '\/v200-luxury\.css'/);
  assert.match(loader, /easy\.href = '\/v201-easy\.css'/);
  assert.match(loader, /experience\.src = '\/v201-experience\.js'/);
  assert.match(loader, /script\.addEventListener\('load', installV201Experience/);
  assert.match(loader, /DOMContentLoaded', installV199Preview/);
  assert.match(css, /body\.aq-v199 #home>\*:not\(#aqariV199Dashboard\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(ui, /id='aqariV199Dashboard'/);
  assert.match(ui, /meta\[name="aqari-design"\]/);
  assert.match(ui, /viewport-fit=cover/);
  assert.match(ui, /window\.cloudLoginV198/);
  assert.match(ui, /data-v199-go="properties"/);
  assert.match(ui, /aria-live','polite'/);
  assert.match(ui, /V200 LUXURY/);
  assert.match(ui, /meta\.content='V200-preview'/);
  assert.match(luxury, /AQARI V200 luxury presentation/);
  assert.match(luxury, /z-index:1400!important/);
  assert.match(easy, /AQARI V201 quiet-luxury experience/);
  assert.match(easy, /--v201-gold-dark:#684819/);
  assert.match(easy, /\.v201-create-sheet/);
  assert.match(easy, /\.v201-card-table/);
  assert.match(experience, /V201-preview/);
  assert.match(experience, /id='v201CreateMenu'|id="v201CreateMenu"/);
  assert.match(experience, /data-v201-create/);
  assert.match(experience, /الدخل المسجل/);
  assert.match(experience, /المقبوضات المسجلة/);
  assert.match(experience, /المطلوب اليوم/);
  assert.match(experience, /إبرام عقد/);
  assert.match(experience, /وصل إيجار/);
  assert.match(experience, /كشف الإيجار/);
  assert.match(experience, /property360Page/);
  assert.match(experience, /smartContractsPage/);
  assert.match(experience, /receiptDoc/);
  assert.match(experience, /role','progressbar'/);
  assert.doesNotMatch(experience, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(ui, /AQARI_SUPABASE\s*=/);
});

test('Supabase adapter memoizes concurrent client initialization', async () => {
  const source = fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8');
  const client = { auth: {} };
  let createClientCalls = 0;
  const window = {
    AQARI_PUBLIC_CONFIG: {
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
    },
    sessionStorage: {},
    supabase: {
      createClient() {
        createClientCalls += 1;
        return client;
      },
    },
  };

  vm.runInNewContext(source, { window }, { filename: 'supabase-adapter.js' });
  const clients = await Promise.all([
    window.AQARI_SUPABASE.getClient(),
    window.AQARI_SUPABASE.getClient(),
    window.AQARI_SUPABASE.getClient(),
  ]);

  assert.equal(createClientCalls, 1);
  assert.ok(clients.every((value) => value === client));
});

test('operational endpoints report the V198 cloud mode', async () => {
  const health = (await invoke(await loadHandler('api/health.js'))).body;
  const deep = (await invoke(await loadHandler('api/health/deep.js'))).body;
  const ops = (await invoke(await loadHandler('api/ops/status.js'))).body;
  const release = (await invoke(await loadHandler('api/release.js'))).body;

  assert.equal(health.version, 'V198');
  assert.equal(health.mode, 'supabase_cloud');
  assert.equal(deep.version, 'V198');
  assert.equal(deep.mode, 'supabase_cloud');
  assert.equal(deep.checks.cloudIntegration.required, true);
  assert.equal(ops.version, 'V198');
  assert.equal(ops.mode, 'supabase_cloud');
  assert.equal(ops.capabilities.cloudAuth, 'supabase_rls');
  assert.equal(ops.capabilities.centralizedDataApi, true);
  assert.equal(release.version, 'V198');
  assert.equal(release.ok, true);
});

test('canonical Supabase status provides transparent legacy compatibility metadata', async () => {
  const status = (await invoke(await loadHandler('api/supabase-status.js'))).body;

  assert.equal(status.version, 'V198');
  assert.equal(status.provider, 'supabase');
  assert.equal(status.mode, 'supabase_cloud');
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.connectionVerified, false);
  assert.equal(status.authMode, 'Supabase Auth + RLS');
  assert.deepEqual(status.tables, []);
  assert.match(status.note, /no live database query/i);
});
