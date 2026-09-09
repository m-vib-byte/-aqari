'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const cachedStatusRoutes = new Set([
  'api/health/deep.js',
  'api/supabase-status.js',
  'api/production-readiness.js',
  'api/final-release-status.js',
]);

// Runtime contract tests must be deterministic and must never probe production.
global.fetch = async () => ({ ok:true, status:200, async json(){ return true; } });
process.env.VERCEL_ENV = 'preview';
process.env.VERCEL_GIT_COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA || 'c'.repeat(40);
process.env.VERCEL_URL = process.env.VERCEL_URL || 'aqari-contract-preview.vercel.app';

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
    if(cachedStatusRoutes.has(relativePath)){
      assert.match(get.headers['vercel-cdn-cache-control'], /s-maxage=60/);
    }
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
  const titleWriters = ['v199-ui.js', 'v201-experience.js', 'v205-simplified-shell.js']
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'));

  assert.match(html, /id="aqari-v198-secure-cloud-js"/);
  assert.match(html, /<title>عقاري V267 • Supabase Connected<\/title>/);
  assert.match(html, /<meta name="aqari-release" content="V267">/);
  assert.match(html, /<meta name="aqari-api-contract" content="V198">/);
  assert.match(html, /<meta name="aqari-stage" content="production">/);
  assert.match(html, /document\.title=s\.appName\+' • AQARI V267'/);
  assert.match(html, /window\.AQARI_API_CONTRACT='V198'/);
  assert.match(html, /window\.AQARI_RELEASE='V267'/);
  assert.match(html, /title\.textContent = 'V267 — جاهز للإنتاج'/);
  assert.doesNotMatch(html, /title\.textContent = 'V198 — Release Freeze'/);
  assert.doesNotMatch(html, /قبل مرحلة الربط النهائي والاختبارات الإنتاجية/);
  assert.doesNotMatch(html, /<meta name="aqari-stage" content="launch-candidate">/);
  for (const source of titleWriters) {
    assert.match(source, /meta\[name="aqari-release"\]/);
    assert.match(source, /document\.title='عقاري '\+productRelease/);
    assert.doesNotMatch(source, /document\.title='عقاري(?: V200)? •/);
  }
  assert.match(html, /#auth,#loginGateV120\{display:none!important\}/);
  assert.ok(html.lastIndexOf('aqari-v198-secure-cloud-js') > html.lastIndexOf('production-lockdown.js'));
  assert.match(bridge, /window\.login = window\.cloudLoginV198/);
  assert.match(bridge, /window\.loginLocalV120 = window\.cloudLoginV198/);
  assert.match(bridge, /AQARI_SUPABASE\.signIn/);
  assert.match(bridge, /membership\?\.is_active/);
  assert.match(bridge, /source: 'supabase'/);
  assert.doesNotMatch(bridge, /1234/);
  assert.doesNotMatch(adapter, /storage:\s*window\.(?:sessionStorage|localStorage)/);
  assert.doesNotMatch(adapter, /\block\s*:/);
  assert.match(adapter, /const storage = window\.localStorage/);
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

test('V204 tenant rent statement preserves the V198 secure runtime', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'v199-ui.css'), 'utf8');
  const luxury = fs.readFileSync(path.join(root, 'v200-luxury.css'), 'utf8');
  const easy = fs.readFileSync(path.join(root, 'v201-easy.css'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'v199-ui.js'), 'utf8');
  const experience = fs.readFileSync(path.join(root, 'v201-experience.js'), 'utf8');
  const prestige = fs.readFileSync(path.join(root, 'v202-prestige.css'), 'utf8');
  const propertyOS = fs.readFileSync(path.join(root, 'v202-property-os.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');

  assert.match(html, /id="aqari-v198-secure-cloud-js"/);
  assert.match(loader, /installV199Preview/);
  assert.match(loader, /PRODUCT_RELEASE='V267'/);
  assert.match(loader, /stylesheet\.href = releaseAsset\('\/v199-ui\.css'\)/);
  assert.match(loader, /script\.src = releaseAsset\('\/v199-ui\.js'\)/);
  assert.match(loader, /luxury\.href = releaseAsset\('\/v200-luxury\.css'\)/);
  assert.match(loader, /easy\.href = releaseAsset\('\/v201-easy\.css'\)/);
  assert.match(loader, /experience\.src = releaseAsset\('\/v201-experience\.js'\)/);
  assert.match(loader, /prestige\.href = '\/v202-prestige\.css'/);
  assert.match(loader, /propertyOS\.src = '\/v202-property-os\.js'/);
  assert.match(loader, /script\.addEventListener\('load', installV201Experience/);
  assert.match(loader, /experience\.addEventListener\('load', installV202PropertyOS/);
  assert.match(loader, /DOMContentLoaded', installV199Preview/);
  assert.match(css, /body\.aq-v199 #home>\*:not\(#aqariV199Dashboard\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(ui, /id='aqariV199Dashboard'/);
  assert.match(ui, /meta\[name="aqari-design"\]/);
  assert.match(ui, /viewport-fit=cover/);
  assert.match(ui, /window\.cloudLoginV198/);
  assert.match(ui, /data-v199-go="properties"/);
  assert.match(ui, /aria-live','polite'/);
  assert.match(ui, /function currentRelease\(\)/);
  assert.match(ui, /meta\.content=productRelease\+'-live'/);
  assert.doesNotMatch(ui, /V200 LUXURY|AQARI V200|V200-preview/);
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
  assert.match(prestige, /AQARI V202/);
  assert.match(prestige, /body\.aq-v202\.v202-layer-open/);
  assert.match(prestige, /\.v202-document-shell/);
  assert.match(propertyOS, /V206-preview/);
  assert.match(propertyOS, /data-v202-action="contract"/);
  assert.match(propertyOS, /data-v202-action="payment"/);
  assert.match(propertyOS, /data-v202-action="statement"/);
  assert.match(propertyOS, /data-v202-action="profile"/);
  assert.match(propertyOS, /rentLedgerV202/);
  assert.match(propertyOS, /rentStatementsV202/);
  assert.match(propertyOS, /contractsV202/);
  assert.match(propertyOS, /data-v202-tab="units"/);
  assert.match(propertyOS, /data-v202-civil-reveal/);
  assert.match(propertyOS, /protectedAccessReady/);
  assert.doesNotMatch(propertyOS, /civilId\s*:\s*['"]\d+/, 'tenant civil IDs must never be embedded in the public runtime');
  assert.match(propertyOS, /contractId/);
  assert.match(propertyOS, /data-v202-ready/);
  assert.doesNotMatch(experience, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(propertyOS, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(ui, /AQARI_SUPABASE\s*=/);
});

test('V205 simplified shell preserves every secure V204 property workflow', () => {
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'v205-simplified-shell.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'v205-simple.css'), 'utf8');
  const propertyOS = fs.readFileSync(path.join(root, 'v202-property-os.js'), 'utf8');

  assert.match(loader, /function installV205SimplifiedShell\s*\(/);
  assert.match(loader, /simple\.href = '\/v205-simple\.css'/);
  assert.match(loader, /shell\.src = releaseAsset\('\/v205-simplified-shell\.js'\)/);
  assert.match(loader, /propertyOS\.addEventListener\('load', installV205SimplifiedShell/);

  assert.match(shell, /V205-preview/);
  assert.match(shell, /AQARI_V209\?\.open/);
  assert.match(shell, /root\.id='v205SimpleHome'/);
  assert.match(shell, /id="v205PrimarySections"/);
  assert.match(shell, /id="v205DailyActions"/);
  assert.match(shell, /data-v205-ready/);
  assert.match(shell, /membership\?\.is_active/);
  assert.match(shell, /membership\.user_id/);
  assert.match(shell, /membership\.workspace_id/);
  assert.match(shell, /window\.AQARI_V202\?\.openProperty/);
  assert.match(shell, /window\.AQARI_V202\.propertyContext\(name\)/);
  assert.match(shell, /workspace\?\.classList\.contains\('on'\)/);
  assert.match(shell, /String\(title\?\.textContent\|\|''\)\.trim\(\)===String\(name\|\|''\)\.trim\(\)/);
  assert.match(shell, /originalTrigger\.focus/);
  assert.match(shell, /setChooserBackgroundInert\(true,overlay\)/);
  assert.match(shell, /AQARI_V205=Object\.freeze\(\{[\s\S]*?seal:function\(\)\{closeChooser\(false\)\}/);
  assert.doesNotMatch(shell, /v205LegacyDashboardSlot" class="v205-dashboard-slot" aria-live/);
  assert.match(shell, /window\.go\?\./);
  for (const action of ['contract', 'payment', 'statement', 'maintenance']) {
    assert.match(shell, new RegExp("\\['" + action + "'"));
  }
  for (const stage of ['العقار', 'الوحدة', 'المستأجر', 'العقد', 'التحصيل']) {
    assert.match(shell, new RegExp(stage));
  }
  assert.doesNotMatch(shell, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(shell, /localStorage|sessionStorage|civilId|phone|mailto:/i);

  assert.match(css, /AQARI V205 simplified white-and-gold operating shell/);
  assert.match(css, /body\.aq-v199\.aq-v205 #home>#v205SimpleHome/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(css, /safe-area-inset-bottom/);

  assert.match(propertyOS, /function rawLedgerRecords\(\)\{\s*return rows\('rentLedgerV202'\);\s*\}/);
  for (const hook of [
    'data-v202-unit-statement',
    'data-v202-unit-contract',
    'data-v202-unit-receipt',
    'data-v202-tenant-contract',
    'data-v202-tenant-receipt',
    'data-v202-tenant-civil-reveal',
  ]) assert.match(propertyOS, new RegExp(hook));
});

test('V206 property rent ledger is integrated with the secure V202 document flow', () => {
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');
  const propertyOS = fs.readFileSync(path.join(root, 'v202-property-os.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'v206-integrated-ledger.css'), 'utf8');

  assert.match(loader, /ledger\.href = '\/v206-integrated-ledger\.css'/);
  assert.match(propertyOS, /function\s+propertyRentLedgerRows\s*\(/);
  assert.match(propertyOS, /function\s+propertyRentLedgerDocument\s*\(/);
  assert.match(propertyOS, /function\s+propertyRentLedgerCsv\s*\(/);
  assert.match(propertyOS, /data-v206-ledger/);
  assert.match(propertyOS, /data-v206-export-csv/);
  assert.match(
    propertyOS,
    /function\s+openStatementDocument[\s\S]*?if\(!protectedAccessReady\(\)\)return false[\s\S]*?const markup=propertyRentLedgerDocument[\s\S]*?openDocument\('كشف إيجار العقار \/ Property Rent Ledger',markup/,
  );
  assert.match(
    propertyOS,
    /target\.id==='v202StatementPeriod'[\s\S]*?body\.innerHTML=propertyRentLedgerDocument/,
  );
  assert.match(propertyOS, /tenantLedgerEntries\(context,scopedRecord,period\)/);
  assert.match(propertyOS, /settledPayment\(entry\?\.status\)/);
  assert.match(propertyOS, /entry\?\.knetTransactionNo\|\|entry\?\.transactionNo/);
  assert.doesNotMatch(propertyOS, /sessionStorage[\s\S]*propertyRentLedgerRows/);

  assert.match(css, /AQARI V206/);
  assert.match(css, /#v202DocumentDialog:has\(\[data-v206-ledger\]\)/);
  assert.match(css, /@page v206-ledger\{size:A4 landscape;margin:4mm\}/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /v206-ledger-brand[\s\S]*?display:flex!important/);
  assert.doesNotMatch(css, /body\s*>\s*\*\s*:\s*not/);
});

test('P0 tenant statement contract is bilingual, unit-scoped, printable, and uses safe document actions', () => {
  const propertyOS = fs.readFileSync(path.join(root, 'v202-property-os.js'), 'utf8');
  const prestige = fs.readFileSync(path.join(root, 'v202-prestige.css'), 'utf8');

  assert.match(propertyOS, /function\s+tenantStatementDocument\s*\(/);
  assert.match(propertyOS, /function\s+validEmail\s*\(/);
  assert.match(propertyOS, /function\s+tenantMailto\s*\(/);
  assert.match(propertyOS, /function\s+tenantLedgerEntries\s*\(/);
  assert.match(propertyOS, /function\s+tenantReceiptDocument\s*\(/);
  assert.match(propertyOS, /function\s+tenantContractDocument\s*\(/);
  assert.match(propertyOS, /data-v202-unit-statement/);
  assert.match(propertyOS, /data-v202-unit-contract/);
  assert.match(propertyOS, /data-v202-unit-receipt/);
  assert.match(propertyOS, /data-v202-tenant-contract/);
  assert.match(propertyOS, /data-v202-tenant-receipt/);
  assert.match(propertyOS, /كشف إيجار المستأجر/);
  assert.match(propertyOS, /Tenant Rent Statement/i);
  assert.match(propertyOS, /بيانات المستأجر/);
  assert.match(propertyOS, /Tenant Information/i);
  assert.match(propertyOS, /بيانات العقد/);
  assert.match(propertyOS, /Contract Details/i);
  assert.match(propertyOS, /تحصيل الإيجار/);
  assert.match(propertyOS, /Rent Collection/i);
  assert.match(propertyOS, /عقد الإيجار/);
  assert.match(propertyOS, /Tenancy Contract/i);
  assert.match(propertyOS, /وصل الإيجار/);
  assert.match(propertyOS, /Rent Receipt/i);
  assert.match(propertyOS, /entryContract===contractKey/);
  assert.match(propertyOS, /mailto:/);
  assert.match(propertyOS, /encodeURIComponent|URLSearchParams/);
  assert.doesNotMatch(propertyOS, /RESEND_API_KEY|api\/send-email|api\/email-send/i, 'the browser must not claim backend delivery or embed an email credential');
  assert.match(prestige, /@media print[\s\S]*\.v202-no-print[\s\S]*display:none!important/);
});

test('Supabase adapter memoizes concurrent client initialization', async () => {
  const source = fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8');
  const client = { auth: {} };
  let createClientCalls = 0;
  let createClientOptions = null;
  const window = {
    AQARI_PUBLIC_CONFIG: {
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
    },
    supabase: {
      createClient(_url, _key, options) {
        createClientCalls += 1;
        createClientOptions = options;
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
  assert.equal(Object.hasOwn(createClientOptions.auth, 'storage'), false);
  assert.equal(Object.hasOwn(createClientOptions.auth, 'lock'), false);
});

test('Supabase adapter starts and clears state without touching sessionStorage', async () => {
  const source = fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8');
  const values = new Map([
    ['aqari-supabase-auth-v198', 'session'],
    ['aqari-supabase-auth-v198-code-verifier', 'verifier'],
    ['unrelated', 'keep'],
  ]);
  const localStorage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    removeItem(key) { values.delete(key); },
  };
  let sessionStorageReads = 0;
  const window = {
    AQARI_PUBLIC_CONFIG: {
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_test',
    },
    localStorage,
    supabase: {
      createClient() {
        return { auth: {} };
      },
    },
  };
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      sessionStorageReads += 1;
      throw new Error('sessionStorage must not be accessed');
    },
  });

  vm.runInNewContext(source, { window }, { filename: 'supabase-adapter.js' });
  await window.AQARI_SUPABASE.getClient();
  const result = window.AQARI_SUPABASE.clearPersistedSession();

  assert.equal(sessionStorageReads, 0);
  assert.equal(result.cleared, 2);
  assert.equal(values.has('aqari-supabase-auth-v198'), false);
  assert.equal(values.has('aqari-supabase-auth-v198-code-verifier'), false);
  assert.equal(values.get('unrelated'), 'keep');
});

test('operational endpoints report the V198 cloud mode', async () => {
  const health = (await invoke(await loadHandler('api/health.js'))).body;
  const deep = (await invoke(await loadHandler('api/health/deep.js'))).body;
  const ops = (await invoke(await loadHandler('api/ops/status.js'))).body;
  const release = (await invoke(await loadHandler('api/release.js'))).body;

  assert.equal(health.version, 'V198');
  assert.equal(health.apiContractVersion, 'V198');
  assert.equal(health.productVersion, 'V267');
  assert.equal(health.mode, 'supabase_cloud');
  assert.equal(deep.version, 'V198');
  assert.equal(deep.productVersion, 'V267');
  assert.equal(deep.mode, 'supabase_cloud');
  assert.equal(deep.checks.cloudIntegration.required, true);
  assert.equal(ops.version, 'V198');
  assert.equal(ops.mode, 'supabase_cloud');
  assert.equal(ops.capabilities.cloudAuth, 'supabase_rls');
  assert.equal(ops.capabilities.centralizedDataApi, true);
  assert.equal(release.version, 'V198');
  assert.equal(release.productVersion, 'V267');
  assert.equal(release.releaseStage, 'preview');
  assert.equal(release.ok, true);
});

test('canonical Supabase status reports a verified live connection without stale snapshots', async () => {
  const status = (await invoke(await loadHandler('api/supabase-status.js'))).body;

  assert.equal(status.version, 'V198');
  assert.equal(status.provider, 'supabase');
  assert.equal(status.mode, 'supabase_cloud');
  assert.equal(status.configured, true);
  assert.equal(status.connected, true);
  assert.equal(status.connectionVerified, true);
  assert.equal(status.connection.state, 'up');
  assert.equal(status.authMode, 'supabase_auth_rls');
  assert.deepEqual(status.tables, []);
  assert.equal('releasePreparationSnapshot' in status, false);
  assert.doesNotMatch(JSON.stringify(status), /authUsers|memberships|appStates/);
});

test('V79 database probes are explicit, coalesced, and never part of render', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const hook = html.match(/const rv79=render;render=function\(\)\{([\s\S]*?)\};render\(\);/);
  assert.ok(hook, 'V79 render hook missing');
  assert.doesNotMatch(hook[1], /checkBootstrapV79|fetch\s*\(/);
  assert.match(html, /onclick="checkBootstrapV79\(true\)"/);
  assert.match(html, /bootstrapStatusInFlightV79/);
  assert.match(html, /BOOTSTRAP_STATUS_TTL_V79=5\*60\*1000/);
});

test('startup backup waits for the exact authenticated workspace and never blocks', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  const backup = html.match(/async function makeAutoBackup\(options=\{\}\)\{([\s\S]*?)\n\}/);
  assert.ok(backup, 'guarded source backup missing');
  assert.doesNotMatch(backup[1], /alert\s*\(/);
  assert.doesNotMatch(html, /setTimeout\(\(\)=>makeAutoBackup\(\),1500\)/);
  assert.match(html, /AQARI_AUTO_BACKUP_KEEP_V211=14/);
  assert.match(html, /openCursor\(null,'prev'\)/);
  assert.match(bridge, /AQARI_STARTUP_BACKUP\?\.cancel\?\.\(\)/);
  assert.match(bridge, /AQARI_STARTUP_BACKUP\?\.schedule\?\.\(\)/);
});

test('production status uses actual readiness instead of endpoint liveness', () => {
  const source = fs.readFileSync(path.join(root, 'production-status.js'), 'utf8');
  assert.match(source, /ready\?\.ready\s*===\s*true/);
  assert.doesNotMatch(source, /ready\?\.ok\s*===\s*true/);
});

test('migration status reads committed auth context and refreshes only on explicit request', () => {
  const source = fs.readFileSync(path.join(root, 'first-run-migration.js'), 'utf8');
  assert.match(source, /window\.AQARI_SUPABASE\.context/);
  assert.match(source, /refreshBtn\.addEventListener\('click', \(\) => refresh\(true\)\)/);
  assert.match(source, /aqari:auth-boundary/);
  assert.doesNotMatch(source, /async function getAuthInfo\(\)\{[\s\S]*?refreshContext\(\)/);
});
