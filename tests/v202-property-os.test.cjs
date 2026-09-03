'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'v202-property-os.js');

function loadRuntime(db, localContracts = [], runtimeWindow = {}) {
  const original = fs.readFileSync(runtimePath, 'utf8');
  const wrapperEnd = original.lastIndexOf('})();');
  assert.notEqual(wrapperEnd, -1, 'V202 runtime wrapper must be present');

  const expose = `
    globalThis.__AQARI_V202_TESTING__ = Object.freeze({
      strictMoney,
      contractCoversPeriod,
      signedContract,
      contractRent,
      contracts,
      contextFor,
      ledgerRecords,
      rentStatementItems,
      statementIncludesContract,
      latestOfficialPeriod,
      settledPayment,
      paymentKey,
      tenantDirectory,
      unitDirectoryRecords,
      filterUnitRecords,
      maskCivilId,
      unitsPanel,
      paymentDialogMarkup,
      savePayment,
      pickedRecord,
      protectedFields: PROTECTED_FIELDS,
      protectedPropertyActive,
      hydrateProtectedImport,
      clearProtectedImport,
      handleProtectedAuthStateChange,
      setActiveProperty(value) { activeProperty = String(value || ''); }
    });
  `;
  const source = original.slice(0, wrapperEnd) + expose + original.slice(wrapperEnd);
  const sandbox = {
    console,
    db,
    window: runtimeWindow,
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      createElement() { return {}; },
      head: { appendChild() {} },
      body: { children: [], classList: { add() {}, remove() {}, toggle() {} } },
    },
    localContractsV55() {
      return localContracts;
    },
    setTimeout() {},
    clearTimeout() {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: runtimePath });
  return sandbox.__AQARI_V202_TESTING__;
}

function fixture() {
  const imported = 'synthetic-test-import';
  return {
    properties: [['SYNTHETIC TEST PROPERTY', 'TEST OWNER', '4', '300']],
    collections: [],
    audit: [],
    expenses: [],
    workOrders: [],
    maintenance: [],
    tenants: [],
    tenantDirectoryV202: [
      {
        property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractNo: 'DUPLICATE-TEST',
        phone: '55500001', nationality: 'TEST', civilId: '123456789012', email: 'a@example.test',
        sourcePage: 1, contractStartRaw: '01/01/2026', contractEndRaw: '31/12/2026',
        paymentDateRaw: '12/08/2026', contractReceipt: 'R-A-PAID', accountant: 'TEST ACCOUNTANT',
        insurance: 40, advance: 10, cleaningFee: 5, freeMonth: '', evictionNotice: '',
        notes: '<img src=x onerror=alert(1)>', verified: true, source: imported,
      },
      {
        property: 'SYNTHETIC TEST PROPERTY', unit: 'B', tenant: 'TEST TENANT', contractNo: 'DUPLICATE-TEST',
        phone: '55500002', nationality: 'TEST', civilId: '987654321098', email: 'b@example.test',
        verified: true, source: imported,
      },
      {
        property: 'SYNTHETIC TEST PROPERTY', unit: 'D', tenant: 'EXPIRED TEST TENANT', contractNo: 'OLD-1',
        civilId: '111122223333', contractEndRaw: '31/07/2026', verified: true, source: imported,
      },
      {
        property: 'OTHER TEST PROPERTY', unit: 'A', tenant: 'OTHER TENANT', contractNo: 'OTHER-1',
        civilId: '000000000000', source: imported,
      },
    ],
    contractsV202: [
      {
        id: 'contract-a',
        contract_no: 'DUPLICATE-TEST',
        tenant: 'TEST TENANT',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'A',
        rent: 100,
        contractRent: 150,
        status: 'signed',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        source: imported,
      },
      {
        id: 'contract-b',
        contract_no: 'DUPLICATE-TEST',
        tenant: 'TEST TENANT',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'B',
        rent: 200,
        contractRent: 250,
        status: 'signed',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        source: imported,
      },
      {
        id: 'contract-draft',
        contract_no: 'DRAFT-1',
        tenant: 'DRAFT TEST TENANT',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'C',
        rent: 300,
        contractRent: 300,
        status: 'draft',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        source: imported,
      },
      {
        id: 'contract-expired',
        contract_no: 'OLD-1',
        tenant: 'EXPIRED TEST TENANT',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'D',
        rent: 400,
        contractRent: 400,
        status: 'signed',
        start_date: '2025-01-01',
        end_date: '2026-07-31',
        source: imported,
      },
    ],
    rentLedgerV202: [
      {
        id: 'ledger-paid-a',
        receiptNo: 'R-A-PAID',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'A',
        tenant: 'TEST TENANT',
        contractId: 'contract-a',
        period: '2026-08',
        due: 100,
        paid: 40,
        status: 'paid',
        source: imported,
      },
      {
        id: 'ledger-pending-a',
        receiptNo: 'R-A-PENDING',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'A',
        tenant: 'TEST TENANT',
        contractId: 'contract-a',
        period: '2026-08',
        due: 100,
        paid: 20,
        status: 'قيد المراجعة',
        source: imported,
      },
      {
        id: 'ledger-paid-b',
        receiptNo: 'R-B-PAID',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'B',
        tenant: 'TEST TENANT',
        contractId: 'contract-b',
        period: '2026-08',
        due: 200,
        paid: 50,
        status: 'مدفوع',
        source: imported,
      },
      {
        id: 'ledger-imported-orphan',
        receiptNo: 'R-IMPORTED-ORPHAN',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'Z',
        tenant: 'ORPHAN TEST TENANT',
        contractId: 'missing-contract',
        period: '2026-08',
        due: 999,
        paid: 999,
        status: 'paid',
        source: imported,
      },
      {
        id: 'ledger-local-orphan',
        receiptNo: 'R-LOCAL-ORPHAN',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'A',
        tenant: 'TEST TENANT',
        contractId: 'contract-a',
        period: '2026-08',
        due: 100,
        paid: 100,
        status: 'مدفوع',
        source: 'v202-entry',
      },
    ],
  };
}

function protectedRemote(property) {
  const remote = fixture();
  remote.properties = [[property, 'SYNTHETIC OWNER', '4', '300']];
  for (const key of ['contractsV202', 'tenantDirectoryV202', 'rentLedgerV202']) {
    remote[key] = remote[key]
      .filter((record) => record.property === 'SYNTHETIC TEST PROPERTY')
      .map((record) => ({ ...record, property, source: 'protected-rent-import-v202' }));
  }
  remote.rentStatementsV202 = [{
    id: `statement-${property}`, property, period: '2026-08', totalRent: 700,
    totalCollected: 90, source: 'protected-rent-import-v202',
  }];
  return remote;
}

test('V202 property accounting keeps contract, payment, and money identities exact', () => {
  const runtime = loadRuntime(fixture());

  assert.equal(runtime.strictMoney('1250.500'), 1250.5);
  assert.equal(runtime.strictMoney('1,250.500'), 1250.5);
  assert.equal(runtime.strictMoney('١٢٥٠٫٥٠٠'), 1250.5);
  assert.equal(runtime.strictMoney('١٬٢٥٠٫٥٠٠'), 1250.5);
  for (const malformed of ['1 250', '12,34', '1.2345', '١٢٣٫١٢٣٤', '-10', '10 د.ك']) {
    assert.equal(Number.isNaN(runtime.strictMoney(malformed)), true, malformed + ' must be rejected');
  }

  assert.equal(runtime.signedContract({ status: 'draft' }), false);
  assert.equal(runtime.signedContract({ status: 'expired' }), false);
  assert.equal(runtime.contractCoversPeriod({ start_date: '2025-01-01', end_date: '2026-07-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ start_date: '2026-01-01', end_date: '2026-12-31' }, '2026-08'), true);
  assert.equal(runtime.settledPayment('قيد المراجعة'), false);
  assert.equal(runtime.settledPayment('paid'), true);

  const contracts = runtime.contracts();
  assert.equal(contracts.length, 4);
  assert.deepEqual(
    Array.from(contracts).filter((contract) => contract.contract_no === 'DUPLICATE-TEST').map((contract) => contract.unit),
    ['A', 'B'],
    'duplicate contract numbers must not merge different units',
  );
  assert.deepEqual(
    Array.from(contracts).filter((contract) => contract.contract_no === 'DUPLICATE-TEST').map(runtime.contractRent),
    [100, 200],
    'current rent must take priority over face contractRent',
  );

  const ledger = runtime.ledgerRecords();
  assert.equal(ledger.some((entry) => entry.receiptNo === 'R-LOCAL-ORPHAN'), false);
  assert.equal(ledger.some((entry) => entry.receiptNo === 'R-IMPORTED-ORPHAN'), true);

  const statement = runtime.rentStatementItems(runtime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08');
  assert.deepEqual(
    Array.from(statement, (item) => [item.contractId, item.unit, item.due, item.paid, item.pending, item.balance]),
    [
      ['contract-a', 'A', 100, 40, 20, 60],
      ['contract-b', 'B', 200, 50, 0, 150],
    ],
    'same-name tenant units stay separate; pending and orphan payments do not inflate collected totals',
  );
  assert.equal(statement.reduce((total, item) => total + item.paid, 0), 90);
  assert.equal(statement.reduce((total, item) => total + item.pending, 0), 20);
  assert.notEqual(
    runtime.paymentKey('SYNTHETIC TEST PROPERTY', 'contract-a', 'A', '2026-08'),
    runtime.paymentKey('SYNTHETIC TEST PROPERTY', 'contract-b', 'B', '2026-08'),
  );
});

test('official protected statements preserve legal dates while displaying every imported unit', () => {
  const data = fixture();
  for (const record of data.contractsV202) record.source = 'protected-rent-import-v202';
  for (const record of data.rentLedgerV202) {
    if (record.source !== 'v202-entry') record.source = 'protected-rent-import-v202';
  }
  data.rentStatementsV202 = [{
    id: 'protected-statement-2026-08',
    property: 'SYNTHETIC TEST PROPERTY',
    period: '2026-08',
    totalRent: 700,
    totalCollected: 90,
    source: 'protected-rent-import-v202',
  }];

  const runtime = loadRuntime(data);
  const statement = runtime.rentStatementItems(runtime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08');

  assert.deepEqual(
    Array.from(statement, (item) => item.contractId),
    ['contract-a', 'contract-b', 'contract-expired'],
    'an official protected statement includes its imported signed rows without changing their legal dates',
  );
  assert.equal(data.contractsV202.find((contract) => contract.id === 'contract-expired').end_date, '2026-07-31');
  assert.equal(runtime.latestOfficialPeriod('SYNTHETIC TEST PROPERTY'), '2026-08');
});

test('V203 protected unit directory keeps units exact, searchable, and masked by default', () => {
  const data = fixture();
  for (const record of data.contractsV202) record.source = 'protected-rent-import-v202';
  for (const record of data.tenantDirectoryV202) record.source = 'protected-rent-import-v202';
  for (const record of data.rentLedgerV202) {
    if (record.source !== 'v202-entry') record.source = 'protected-rent-import-v202';
  }
  data.rentStatementsV202 = [{
    id: 'protected-statement-2026-08', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    totalRent: 700, totalCollected: 90, unitCount: 6, source: 'protected-rent-import-v202',
  }];

  const runtime = loadRuntime(data);
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08');
  const a = records.find((record) => record.unit === 'A');
  const b = records.find((record) => record.unit === 'B');
  const d = records.find((record) => record.unit === 'D');

  assert.ok(a && b && d);
  assert.equal(records.filter((record) => record.unit === 'A').length, 1);
  assert.equal(a.contractId, 'contract-a');
  assert.equal(a.paid, 40);
  assert.equal(a.pending, 20);
  assert.equal(a.balance, 60);
  assert.equal(b.contractId, 'contract-b');
  assert.equal(b.paid, 50);
  assert.equal(d.endDate, '2026-07-31', 'legal contract end date must remain unchanged');
  assert.equal(records.some((record) => record.property === 'OTHER TEST PROPERTY'), false);
  assert.equal(records.some((record) => record.unit === 'Z' && record.paymentStatus === 'يحتاج مراجعة'), true);

  assert.deepEqual(Array.from(runtime.filterUnitRecords(records, 'Z'), (record) => record.unit), ['Z']);
  assert.deepEqual(Array.from(runtime.filterUnitRecords(records, 'ا')), []);
  assert.deepEqual(Array.from(runtime.filterUnitRecords(records, 'DUPLICATE-TEST'), (record) => record.unit), ['A', 'B']);
  assert.equal(runtime.filterUnitRecords([{ unit: '12', tenant: '', contractNo: '' }], '١٢').length, 1);
  assert.equal(runtime.filterUnitRecords(records, '55500001').length, 0, 'phone must not be a discovery index');
  assert.equal(runtime.filterUnitRecords(records, '123456789012').length, 0, 'civil ID must not be a discovery index');

  const masked = runtime.maskCivilId('123456789012');
  assert.notEqual(masked, '123456789012');
  assert.ok(masked.endsWith('9012'));
  assert.doesNotMatch(masked, /12345678/);
  assert.equal(runtime.maskCivilId(''), 'غير مسجل');

  const html = runtime.unitsPanel(context, '2026-08', true);
  assert.doesNotMatch(html, /123456789012/);
  assert.doesNotMatch(html, /987654321098/);
  assert.match(html, /9012/);
  assert.match(html, /data-v202-civil-reveal="0"/);
  assert.match(html, /data-v202-unit-receipt="0"/);
  assert.match(html, /data-v202-unit-payment="0"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);

  const payment = runtime.paymentDialogMarkup(context, 'contract-a');
  assert.match(payment, /<option value="contract-a" selected>/);
});

test('V203 protected import refuses inactive sessions and never exposes unlisted authorization fields', async () => {
  let loads = 0;
  const runtimeWindow = {
    AQARI_SUPABASE: {
      context: { user: null, membership: null, workspace: null },
      async refreshContext() { return { user: null, membership: null, workspace: null }; },
      async loadAppState() { loads += 1; return {}; },
    },
  };
  const runtime = loadRuntime(fixture(), [], runtimeWindow);
  assert.equal(await runtime.hydrateProtectedImport(), false);
  assert.equal(loads, 0);

  const picked = runtime.pickedRecord({
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', civilId: '1234',
    role: 'owner', is_admin: true, nested: { secret: true }, list: ['secret'],
  }, runtime.protectedFields.tenantDirectoryV202);
  assert.deepEqual(Object.keys(picked), ['property', 'unit', 'civilId']);

  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.doesNotMatch(source, /Dhahawi/i);
  assert.match(source, /SIGNED_OUT/);
  assert.match(source, /clearProtectedImport\(\)/);
});

test('V203 active protected import stays in memory and clears without mutating local tenant data', async () => {
  const remote = fixture();
  for (const key of ['contractsV202', 'tenantDirectoryV202', 'rentLedgerV202']) {
    for (const record of remote[key]) {
      if (record.source !== 'v202-entry') record.source = 'protected-rent-import-v202';
    }
  }
  remote.rentStatementsV202 = [{
    id: 'protected-statement-2026-08', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    totalRent: 700, totalCollected: 90, source: 'protected-rent-import-v202',
  }];
  const local = fixture();
  local.properties = [];
  local.contractsV202 = [];
  local.tenantDirectoryV202 = [];
  local.rentLedgerV202 = [];
  local.rentStatementsV202 = [];
  const before = JSON.stringify(local);
  const runtimeWindow = {
    AQARI_SUPABASE: {
      context: { user: { id: 'user-test' }, membership: { is_active: true }, workspace: { id: 'workspace-test' } },
      async loadAppState() { return { payload: remote }; },
    },
  };
  const runtime = loadRuntime(local, [], runtimeWindow);
  assert.equal(await runtime.hydrateProtectedImport(), true);
  assert.equal(JSON.stringify(local), before, 'protected tenant data must not be persisted into the local database object');
  const protectedContext = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  assert.equal(protectedContext.propertyContracts.length, 4);
  assert.equal(runtime.tenantDirectory().length, 3, 'cross-property directory rows stay outside the active property cache');
  assert.equal(runtime.protectedPropertyActive('SYNTHETIC TEST PROPERTY'), true);
  assert.doesNotMatch(runtime.unitsPanel(protectedContext, '2026-08', true), /data-v202-unit-payment=/, 'protected-only tenants cannot enter an unscoped local payment path');
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  assert.equal(runtime.savePayment({ preventDefault() {} }), false);
  assert.equal(JSON.stringify(local), before, 'blocked protected payment must not mutate the local database object');
  runtime.clearProtectedImport();
  assert.equal(runtime.contextFor('SYNTHETIC TEST PROPERTY'), null);
  assert.equal(runtime.tenantDirectory().length, 0);
});

test('V203 sign-out generation prevents an in-flight protected response from restoring data', async () => {
  const remote = fixture();
  for (const key of ['contractsV202', 'tenantDirectoryV202', 'rentLedgerV202']) {
    for (const record of remote[key]) {
      if (record.source !== 'v202-entry') record.source = 'protected-rent-import-v202';
    }
  }
  remote.rentStatementsV202 = [{
    id: 'protected-statement-2026-08', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    totalRent: 700, totalCollected: 90, source: 'protected-rent-import-v202',
  }];
  const local = fixture();
  local.properties = [];
  local.contractsV202 = [];
  local.tenantDirectoryV202 = [];
  local.rentLedgerV202 = [];
  local.rentStatementsV202 = [];
  let resolveLoad;
  const context = { user: { id: 'user-test' }, membership: { is_active: true }, workspace: { id: 'workspace-test' } };
  const runtimeWindow = {
    AQARI_SUPABASE: {
      context,
      loadAppState() { return new Promise((resolve) => { resolveLoad = resolve; }); },
    },
  };
  const runtime = loadRuntime(local, [], runtimeWindow);
  const pending = runtime.hydrateProtectedImport();
  await Promise.resolve();
  runtime.clearProtectedImport();
  runtimeWindow.AQARI_SUPABASE.context = { user: null, membership: null, workspace: null };
  resolveLoad({ payload: remote });
  assert.equal(await pending, false);
  assert.equal(runtime.contextFor('SYNTHETIC TEST PROPERTY'), null);
  assert.equal(runtime.tenantDirectory().length, 0);
});

test('V203 blocks protected payment even when a local property has the same name', async () => {
  const local = fixture();
  local.properties = [['SYNTHETIC TEST PROPERTY', 'LOCAL OWNER', '4', '300']];
  local.contractsV202 = [];
  local.tenantDirectoryV202 = [];
  local.rentLedgerV202 = [];
  local.rentStatementsV202 = [];
  const before = JSON.stringify(local);
  const bridge = {
    context: { user: { id: 'user-test' }, membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' }, workspace: { id: 'workspace-test' } },
    async loadAppState() { return { payload: protectedRemote('SYNTHETIC TEST PROPERTY') }; },
  };
  const runtime = loadRuntime(local, [], { AQARI_SUPABASE: bridge });
  assert.equal(await runtime.hydrateProtectedImport('user-test'), true);
  assert.equal(runtime.protectedPropertyActive('SYNTHETIC TEST PROPERTY'), true);
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  assert.equal(runtime.savePayment({ preventDefault() {} }), false);
  assert.equal(JSON.stringify(local), before, 'same-name local property must not weaken the protected payment boundary');
});

test('V203 account switch blocks the old workspace immediately and retries after a stale request', async () => {
  const local = fixture();
  local.properties = [];
  local.contractsV202 = [];
  local.tenantDirectoryV202 = [];
  local.rentLedgerV202 = [];
  local.rentStatementsV202 = [];
  const remoteA = protectedRemote('SYNTHETIC SWITCH A');
  const remoteB = protectedRemote('SYNTHETIC SWITCH B');
  let resolveFirst;
  let loads = 0;
  const bridge = {
    context: { user: { id: 'user-a' }, membership: { is_active: true, user_id: 'user-a', workspace_id: 'workspace-a' }, workspace: { id: 'workspace-a' } },
    loadAppState() {
      loads += 1;
      if (loads === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve({ payload: remoteB });
    },
  };
  const runtime = loadRuntime(local, [], { AQARI_SUPABASE: bridge });
  const pendingA = runtime.hydrateProtectedImport('user-a');
  await Promise.resolve();

  bridge.context = { user: { id: 'user-b' }, membership: { is_active: true, user_id: 'user-b', workspace_id: 'workspace-b' }, workspace: { id: 'workspace-b' } };
  runtime.handleProtectedAuthStateChange('SIGNED_IN', { user: { id: 'user-b' } });
  assert.equal(runtime.contextFor('SYNTHETIC SWITCH A'), null, 'old workspace rows must be inaccessible synchronously');

  const pendingB = runtime.hydrateProtectedImport('user-b');
  resolveFirst({ payload: remoteA });
  assert.equal(await pendingA, false);
  assert.equal(await pendingB, true);
  assert.equal(runtime.contextFor('SYNTHETIC SWITCH A'), null);
  assert.equal(runtime.contextFor('SYNTHETIC SWITCH B').propertyContracts.length, 4);
  assert.equal(loads, 2, 'new user receives a fresh load after the stale request settles');
});
