'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadPropertyRentSnapshot(db, localContracts = []) {
  const original = read('v202-property-os.js');
  const wrapperEnd = original.lastIndexOf('})();');
  assert.notEqual(wrapperEnd, -1, 'V202 runtime wrapper must be present');
  const expose = '\n    globalThis.__AQARI_RENT_SNAPSHOT__ = rentSnapshot;\n';
  const source = original.slice(0, wrapperEnd) + expose + original.slice(wrapperEnd);
  const sandbox = {
    console,
    db,
    window: {},
    document: { readyState: 'loading', addEventListener() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    localContractsV55() { return localContracts; },
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'v202-property-os.js' });
  assert.equal(typeof sandbox.__AQARI_RENT_SNAPSHOT__, 'function', 'V202 must own rentSnapshot accounting');
  return sandbox.__AQARI_RENT_SNAPSHOT__;
}

function loadRentRuntime(snapshot) {
  const listeners = new Map();
  const classList = { add() {}, remove() {}, contains() { return false; } };
  const document = {
    readyState: 'loading',
    body: { classList },
    head: { appendChild() {} },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    createElement() {
      return { classList, dataset: {}, setAttribute() {}, appendChild() {}, remove() {}, click() {} };
    },
    getElementById() { return null; },
    querySelector() { return null; },
  };
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  const sessionStorage = {
    getItem(key) { return key === 'aqari_v202_property' ? 'TOWER A' : null; },
    setItem() {},
  };
  const sandbox = {
    console,
    document,
    sessionStorage,
    MutationObserver,
    Blob,
    URL,
    AQARI_V202: {
      rentSnapshot(property, period) {
        assert.equal(property, snapshot.property);
        assert.equal(period, snapshot.period);
        return snapshot;
      },
    },
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('v202-rent-operations.js'), sandbox, { filename: 'v202-rent-operations.js' });
  assert.equal(sandbox.AQARI_V202_RENT, sandbox.AQARI_DHAHAWI, 'legacy alias must reference the canonical Dhahawi API');
  return sandbox.AQARI_DHAHAWI;
}

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
    assert.equal(get.body.version, 'V203');
    assert.equal(get.body.runtimeBase, 'V198');
    assert.equal(get.body.dataContract, 'V202');
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

test('V203 public identity preserves the V198 secure cloud bridge', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');

  assert.match(html, /id="aqari-v198-secure-cloud-js"/);
  assert.match(html, /<meta name="aqari-release" content="V203">/);
  assert.match(html, /<meta name="aqari-runtime-base" content="V198">/);
  assert.match(html, /<meta name="aqari-data-contract" content="V202">/);
  assert.match(html, /document\.title=s\.appName\+' • AQARI V203'/);
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

test('V202 property operations preserves the V198 secure runtime', () => {
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
  assert.match(loader, /AQARI_RELEASE_LOADER/);
  assert.match(loader, /dataset\.aqariReleaseState/);
  assert.match(loader, /dataset\.aqariLoadState/);
  assert.match(loader, /aqari:asset-loaded/);
  assert.match(loader, /aqari:asset-retry/);
  assert.match(loader, /aqari:asset-error/);
  for (const asset of ['/v199-ui.css', '/v199-ui.js', '/v200-luxury.css', '/v201-easy.css', '/v201-experience.js', '/v202-prestige.css', '/v202-property-os.js']) {
    assert.match(loader, new RegExp(asset.replaceAll('.', '\\.')));
  }
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
  assert.match(prestige, /AQARI V202/);
  assert.match(prestige, /body\.aq-v202\.v202-layer-open/);
  assert.match(prestige, /\.v202-document-shell/);
  assert.match(propertyOS, /V202-preview/);
  assert.match(propertyOS, /data-v202-action="contract"/);
  assert.match(propertyOS, /data-v202-action="payment"/);
  assert.match(propertyOS, /data-v202-action="statement"/);
  assert.match(propertyOS, /data-v202-action="profile"/);
  assert.match(propertyOS, /rentLedgerV202/);
  assert.match(propertyOS, /rentStatementsV202/);
  assert.match(propertyOS, /contractsV202/);
  assert.match(propertyOS, /contractId/);
  assert.match(propertyOS, /data-v202-ready/);
  assert.match(propertyOS, /rentSnapshot\s*:\s*rentSnapshot/);
  assert.match(propertyOS, /runAction\s*:\s*runPublicAction/);
  assert.doesNotMatch(experience, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(propertyOS, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(ui, /AQARI_SUPABASE\s*=/);
});

test('V203 simple workflow exposes one-tap rent operations without replacing secure data services', () => {
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');
  const simple = fs.readFileSync(path.join(root, 'v203-simple.js'), 'utf8');
  const simpleCss = fs.readFileSync(path.join(root, 'v203-simple.css'), 'utf8');
  const rent = fs.readFileSync(path.join(root, 'v202-rent-operations.js'), 'utf8');
  const rentCss = fs.readFileSync(path.join(root, 'v202-rent-operations.css'), 'utf8');

  assert.match(loader, /\/v202-rent-operations\.css/);
  assert.match(loader, /\/v202-rent-operations\.js/);
  assert.match(loader, /\/v203-simple\.css/);
  assert.match(loader, /\/v203-simple\.js/);
  assert.match(simple, /v203-month-glance/);
  assert.match(simple, /dueContracts/);
  assert.match(simple, /data-v203-due-contract/);
  assert.match(simple, /rentSnapshot/);
  assert.match(simple, /runAction/);
  assert.match(simple, /data-v203-action/);
  assert.match(simple, /meta\[name="aqari-experience"\]/);
  assert.match(simple, /meta\.content='V203-simple'/);
  assert.match(simple, /عقد جديد/);
  assert.match(simple, /تسجيل إيجار/);
  assert.match(simple, /آخر وصل/);
  assert.match(simple, /كشف الشهر/);
  assert.match(simpleCss, /\.v203-due-list/);
  assert.match(simpleCss, /\.v203-month-glance/);
  assert.match(rent, /item\.email/);
  assert.match(rent, /KNET OPERATION NO\./);
  assert.match(rent, /VOUCHER NO\./);
  assert.match(rent, /ACCOUNTANT/);
  assert.match(rentCss, /@page(?:\s+aqari-dhahawi)?\s*\{\s*size:\s*A4\s+landscape\b/);
  assert.match(rentCss, /#aqariDhahawiDialog\s+\.v203-rent-ledger/);
  assert.match(rentCss, /body(?:\.aq-v202)?\.v203-print-dhahawi/);
  assert.match(rentCss, /body\.aq-v202\.v203-print-dhahawi>#aqariDhahawiDialog\.v202-dialog-overlay[^{}]*\{[^}]*display:block!important/);
  assert.match(rentCss, /:focus-visible[^{}]*\{outline:3px solid #005fcc!important;outline-offset:3px\}/);
  assert.match(simple, /aqari_v202_property/);
  assert.match(simple, /\.v202-workspace/);
  assert.doesNotMatch(simple, /\.v202-property-hub/);
  assert.doesNotMatch(simple, /\b(?:db|rows)\s*(?:\.|\()/, 'V203 must consume the V202 snapshot instead of duplicating accounting');
  assert.match(rent, /AQARI_V202/);
  assert.match(rent, /rentSnapshot/);
  assert.match(rent, /meta\[name="aqari-operations"\]/);
  assert.doesNotMatch(rent, /\b(?:db|rows)\s*(?:\.|\()/, 'the statement renderer must consume the V202 snapshot instead of reading storage');
  assert.doesNotMatch(simple, /AQARI_SUPABASE\s*=/);
  assert.doesNotMatch(simple, /localStorage\.setItem/);
});

test('all V202/V203 browser runtime assets pass JavaScript parsing', () => {
  for (const relativePath of [
    'final-release-ui.js',
    'v202-property-os.js',
    'v202-rent-operations.js',
    'v203-simple.js',
  ]) {
    assert.doesNotThrow(
      () => new vm.Script(read(relativePath), { filename: relativePath }),
      relativePath + ' must parse before Preview deployment',
    );
  }
});

test('Dhahawi period refresh restores focus to the replaced month control', () => {
  let focusCalls = 0;
  let focusOptions = null;
  const periodSelector = '#aqariDhahawiDialog [data-dhahawi-period]';
  const oldPeriodInput = {
    matches(selector) { return selector === periodSelector; },
  };
  const newPeriodInput = {
    focus(options) {
      focusCalls += 1;
      focusOptions = options;
    },
  };
  const body = { innerHTML: '' };
  const dialog = {
    dataset: { property: 'TOWER A', period: '2026-08' },
    classList: { contains(name) { return name === 'on'; } },
    querySelector(selector) {
      if (selector === '#aqariDhahawiBody') return body;
      if (selector === '[data-dhahawi-period]') return newPeriodInput;
      return null;
    },
  };
  const document = {
    readyState: 'loading',
    activeElement: oldPeriodInput,
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    getElementById(id) { return id === 'aqariDhahawiDialog' ? dialog : null; },
  };
  const sandbox = {
    console,
    document,
    AQARI_V202: {
      rentSnapshot(property, period) {
        return {
          property,
          period,
          items: [],
          totals: { due: 0, paid: 0, balance: 0, pending: 0 },
          diagnostics: {},
        };
      },
    },
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('v202-rent-operations.js'), sandbox, { filename: 'v202-rent-operations.js' });

  assert.equal(sandbox.AQARI_DHAHAWI.refresh('2026-09'), true);
  assert.equal(dialog.dataset.period, '2026-09');
  assert.match(body.innerHTML, /data-dhahawi-period value="2026-09"/);
  assert.equal(focusCalls, 1);
  assert.equal(focusOptions.preventScroll, true);
});

test('V203 mounts the one-tap strip into the real V202 workspace selector', () => {
  const selectors = [];
  let mounted = null;
  const classList = { add() {}, remove() {}, contains() { return false; } };
  const workspace = {
    querySelector(selector) {
      if (selector === '.v203-simple-strip') return mounted;
      if (selector === '.v202-actions') return { classList, setAttribute() {} };
      return null;
    },
    prepend(node) { mounted = node; },
    insertBefore(node) { mounted = node; },
  };
  const body = { classList };
  const document = {
    readyState: 'complete',
    body,
    addEventListener() {},
    querySelector(selector) {
      selectors.push(selector);
      return selector === '.v202-workspace' ? workspace : null;
    },
    getElementById() { return null; },
    createElement() {
      return { className: '', classList, dataset: {}, innerHTML: '', setAttribute() {} };
    },
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
  }
  const storageReads = [];
  const sessionStorage = {
    getItem(key) {
      storageReads.push(key);
      return key === 'aqari_v202_property' ? 'TOWER A' : null;
    },
  };
  const sandbox = {
    console,
    db: { contractsV202: [], rentLedgerV202: [] },
    document,
    sessionStorage,
    MutationObserver,
    Event: class Event {},
    Element: class Element {},
    AQARI_V202: {
      rentSnapshot(property, period) {
        return { property, period, contracts: 0, paidUnits: 0, items: [], dueContracts: [], totals: { due: 0, expected: 0, paid: 0, collected: 0, balance: 0 }, diagnostics: { conflicts:[{unit:'A'}], invalidContracts:[], invalidIdentityContracts:[], unmatchedPayments:[], ignoredPayments:[] }, receipts: [], receiptCount: 0, latestReceiptIndex: -1 };
      },
      testing: { statementItems() { return []; } },
    },
    AQARI_DHAHAWI: { openStatement() {} },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('v203-simple.js'), sandbox, { filename: 'v203-simple.js' });

  assert.ok(mounted, 'the V203 strip must mount inside .v202-workspace');
  assert.match(mounted.innerHTML, /data-v203-action="statement"/);
  assert.match(mounted.innerHTML, /الحساب يحتاج مراجعة/);
  assert.match(mounted.innerHTML, /غير محسوم/);
  assert.ok(selectors.includes('.v202-workspace'));
  assert.equal(selectors.includes('.v202-property-hub'), false);
  assert.ok(storageReads.includes('aqari_v202_property'));
  assert.equal(storageReads.includes('aqari_v201_property'), false);
});

test('Dhahawi ledger uses exact V202 contract, period, status, and payment mappings', () => {
  const db = {
    properties: [['TOWER A', 'OWNER', '4', '300']],
    tenants: [['LEGACY TENANT', 'TOWER A', 999, 'paid']],
    collections: [['LEGACY-RECEIPT', 'LEGACY TENANT', 999, 'paid', 'TOWER A']],
    contractsV202: [
      { id: 'contract-a', contract_no: 'A-1', tenant: '', property: 'TOWER A', unit: 'A', rent: 100, contractRent: 120, insurance: 25, advance: 10, cleaningFees: 5, status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31' },
      { id: 'contract-b', contract_no: 'B-1', tenant: '=2+2', property: 'TOWER A', unit: 'B', rent: 200, status: 'موقّع', start_date: '2026-01-01', end_date: '2026-12-31' },
      { id: 'contract-draft', contract_no: 'C-1', tenant: 'TENANT C', property: 'TOWER A', unit: 'C', rent: 300, status: 'draft', start_date: '2026-01-01', end_date: '2026-12-31' },
      { id: 'contract-expired', contract_no: 'D-1', tenant: 'TENANT D', property: 'TOWER A', unit: 'D', rent: 400, status: 'signed', start_date: '2025-01-01', end_date: '2026-07-31' },
    ],
    tenantDirectoryV202: [
      { property: 'TOWER A', unit: 'A', tenant: 'TENANT A', contractNo: 'A-1', phone: '50000000', email: 'tenant@example.com', civilId: '123456789012', nationality: 'KW', verified: true },
    ],
    rentLedgerV202: [
      { id: 'paid-a', receiptNo: 'R-A', property: 'TOWER A', unit: 'A', tenant: 'TENANT A', contractId: 'contract-a', period: '2026-08', paid: 40, status: 'paid', paidAt: '2026-08-05', method: 'KNET', knetOperationNo: 'KNET-A', voucherNo: 'V-A', receiptContract: 'RC-A', accountant: 'Tester', source: 'synthetic-test-import' },
      { id: 'pending-a', receiptNo: 'R-A-PENDING', property: 'TOWER A', unit: 'A', tenant: 'TENANT A', contractId: 'contract-a', period: '2026-08', paid: 20, status: 'قيد المراجعة', source: 'synthetic-test-import' },
      { id: 'wrong-period-a', receiptNo: 'R-A-SEP', property: 'TOWER A', unit: 'A', tenant: 'TENANT A', contractId: 'contract-a', period: '2026-09', paid: 999, status: 'paid', source: 'synthetic-test-import' },
      { id: 'wrong-property-a', receiptNo: 'R-A-ANNEX', property: 'TOWER A ANNEX', unit: 'A', tenant: 'TENANT A', contractId: 'contract-a', period: '2026-08', paid: 999, status: 'paid', source: 'synthetic-test-import' },
      { id: 'paid-b', receiptNo: 'R-B', property: 'TOWER A', unit: 'B', tenant: '=2+2', contractId: 'contract-b', period: '2026-08', paid: 50, status: 'مدفوع', source: 'synthetic-test-import' },
      { id: 'paid-b-legacy-label', receiptNo: 'R-B-LEGACY', property: 'TOWER A', unit: 'B', tenant: '=2+2', contractId: 'contract-b', period: '2026-08', paid: 10, status: 'تم السداد', source: 'synthetic-test-import' },
      { id: 'orphan', receiptNo: 'R-ORPHAN', property: 'TOWER A', unit: 'Z', tenant: 'ORPHAN', contractId: 'missing-contract', period: '2026-08', paid: 999, status: 'paid', source: 'synthetic-test-import' },
    ],
  };
  const rentSnapshot = loadPropertyRentSnapshot(db);
  const snapshot = rentSnapshot('TOWER A', '2026-08');
  assert.deepEqual(Array.from(snapshot.items, (item) => item.contractId), ['contract-a', 'contract-b']);
  assert.equal(snapshot.totals.due, 300);
  assert.equal(snapshot.totals.paid, 100);
  assert.equal(snapshot.totals.expected, 300);
  assert.equal(snapshot.totals.collected, 100);
  assert.equal(snapshot.totals.balance, 200);

  const snapshotA = snapshot.items.find((item) => item.contractId === 'contract-a');
  assert.equal(snapshotA.tenant, 'TENANT A');
  assert.equal(snapshotA.paid, 40);
  assert.equal(snapshotA.pending, 20);
  assert.equal(snapshotA.balance, 60);
  assert.equal(snapshotA.tenantDetails.email, 'tenant@example.com');
  assert.equal(snapshotA.settledPayments[0].receiptNo, 'R-A');
  assert.equal(snapshotA.settledPayments[0].knetOperationNo, 'KNET-A');

  const runtime = loadRentRuntime(snapshot);
  assert.ok(runtime, 'window.AQARI_DHAHAWI must expose a testable projection API');

  const model = runtime.statementModel('TOWER A', '2026-08');
  assert.deepEqual(Array.from(model.items, (item) => item.contractId), ['contract-a', 'contract-b']);
  assert.equal(model.totals.due, 300);
  assert.equal(model.totals.paid, 100);
  assert.equal(model.totals.balance, 200);
  assert.equal(model.diagnostics.unmatchedPayments.length, 1);
  assert.equal(model.diagnostics.ignoredPayments.length, 0);

  const itemA = model.items.find((item) => item.contractId === 'contract-a');
  assert.equal(itemA.name, 'TENANT A');
  assert.equal(itemA.contractNo, 'A-1');
  assert.equal(itemA.rent, 100);
  assert.equal(itemA.contractRent, 120);
  assert.equal(itemA.insurance, 25);
  assert.equal(itemA.advance, 10);
  assert.equal(itemA.cleaning, 5);
  assert.equal(itemA.paid, 40);
  assert.equal(itemA.balance, 60);
  assert.equal(itemA.paymentDate, '2026-08-05');
  assert.equal(itemA.paymentMethod, 'KNET');
  assert.equal(itemA.knetNo, 'KNET-A');
  assert.equal(itemA.receiptNo, 'R-A');
  assert.equal(itemA.voucherNo, 'V-A');
  assert.equal(itemA.receiptContract, 'RC-A');
  assert.equal(itemA.accountant, 'Tester');

  const csv = runtime.toCsv('TOWER A', '2026-08');
  for (const value of ['KNET OPERATION NO.', 'VOUCHER NO.', 'RECEIPT CONTRACT', 'ACCOUNTANT', 'V-A', 'RC-A', 'Tester']) {
    assert.match(csv, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(csv, /'=2\+2/, 'CSV formula-like cells must be neutralized');
  assert.doesNotMatch(csv, /(?:^|,|\r?\n)"?=2\+2/m, 'CSV must not expose a formula at the start of a cell');
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

test('operational endpoints report V203 on the preserved V198/V202 contracts', async () => {
  const health = (await invoke(await loadHandler('api/health.js'))).body;
  const deep = (await invoke(await loadHandler('api/health/deep.js'))).body;
  const ops = (await invoke(await loadHandler('api/ops/status.js'))).body;
  const release = (await invoke(await loadHandler('api/release.js'))).body;

  assert.equal(health.version, 'V203');
  assert.equal(health.runtimeBase, 'V198');
  assert.equal(health.dataContract, 'V202');
  assert.equal(health.mode, 'supabase_cloud');
  assert.equal(deep.version, 'V203');
  assert.equal(deep.runtimeBase, 'V198');
  assert.equal(deep.dataContract, 'V202');
  assert.equal(deep.mode, 'supabase_cloud');
  assert.equal(deep.checks.cloudRuntime.required, true);
  assert.equal(deep.checks.cloudRuntime.ok, true);
  assert.equal(deep.checks.cloudConnection.required, false);
  assert.equal(deep.checks.cloudConnection.ok, false);
  assert.equal(deep.checks.cloudConnection.connectionVerified, false);
  assert.equal(ops.version, 'V203');
  assert.equal(ops.runtimeBase, 'V198');
  assert.equal(ops.dataContract, 'V202');
  assert.equal(ops.mode, 'supabase_cloud');
  assert.equal(ops.capabilities.cloudAuth, 'supabase_rls');
  assert.equal(ops.capabilities.centralizedDataApi, true);
  assert.equal(release.version, 'V203');
  assert.equal(release.runtimeBase, 'V198');
  assert.equal(release.dataContract, 'V202');
  assert.equal(release.ok, true);
});

test('canonical Supabase status provides transparent legacy compatibility metadata', async () => {
  const status = (await invoke(await loadHandler('api/supabase-status.js'))).body;

  assert.equal(status.version, 'V203');
  assert.equal(status.runtimeBase, 'V198');
  assert.equal(status.dataContract, 'V202');
  assert.equal(status.provider, 'supabase');
  assert.equal(status.mode, 'supabase_cloud');
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.connectionVerified, false);
  assert.equal(status.authMode, 'Supabase Auth + RLS');
  assert.deepEqual(status.tables, []);
  assert.match(status.note, /no live database query/i);
});
