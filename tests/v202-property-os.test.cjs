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
      propertyRentLedgerRows: typeof propertyRentLedgerRows === 'function' ? propertyRentLedgerRows : null,
      propertyRentLedgerModel: typeof propertyRentLedgerModel === 'function' ? propertyRentLedgerModel : null,
      propertyRentLedgerDocument: typeof propertyRentLedgerDocument === 'function' ? propertyRentLedgerDocument : null,
      propertyRentLedgerCsv: typeof propertyRentLedgerCsv === 'function' ? propertyRentLedgerCsv : null,
      statementIncludesContract,
      latestOfficialPeriod,
      settledPayment,
      paymentKey,
      tenantDirectory,
      unitDirectoryRecords,
      filterUnitRecords,
      maskCivilId,
      unitsPanel,
      tenantStatementDocument: typeof tenantStatementDocument === 'function' ? tenantStatementDocument : null,
      tenantReceiptDocument: typeof tenantReceiptDocument === 'function' ? tenantReceiptDocument : null,
      tenantContractDocument: typeof tenantContractDocument === 'function' ? tenantContractDocument : null,
      tenantLedgerEntries: typeof tenantLedgerEntries === 'function' ? tenantLedgerEntries : null,
      openStatementDocument: typeof openStatementDocument === 'function' ? openStatementDocument : null,
      openUnitReceipt: typeof openUnitReceipt === 'function' ? openUnitReceipt : null,
      openTenantReceipt: typeof openTenantReceipt === 'function' ? openTenantReceipt : null,
      validEmail: typeof validEmail === 'function' ? validEmail : null,
      tenantMailto: typeof tenantMailto === 'function' ? tenantMailto : null,
      paymentDialogMarkup,
      savePayment,
      pickedRecord,
      protectedFields: PROTECTED_FIELDS,
      protectedPropertyActive,
      hydrateProtectedImport,
      clearProtectedImport,
      handleProtectedAuthStateChange,
      setActiveProperty(value) { activeProperty = String(value || ''); },
      setActiveTenantStatementKey(value) { activeTenantStatementKey = String(value || ''); }
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
        insurance: 40, insuranceDateRaw: '22/10/2025', advance: 10, advanceDateRaw: '20/10/2025',
        cleaningFee: 5, freeMonth: '', evictionNotice: '',
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
        paidAt: '2026-08-12',
        method: 'KNET',
        knetTransactionNo: '012345',
        status: 'paid',
        note: 'August 2026 rent — KNET operation: 012345',
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

function activeRuntimeWindow() {
  return {
    AQARI_SUPABASE: {
      context: {
        user: { id: 'user-test' },
        membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' },
        workspace: { id: 'workspace-test' },
      },
    },
  };
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
test('V206 integrated ledger isolates contracts and uses settled canonical data only', () => {
  const data = fixture();
  Object.assign(data.tenantDirectoryV202[0], { currentRent: 95, contractReceived: 'RECEIVED-A' });
  Object.assign(data.rentLedgerV202.find((entry) => entry.id === 'ledger-pending-a'), {
    paidAt: '2026-08-31', method: 'KNET', knetTransactionNo: 'PENDING-999',
    voucherNo: 'V-PENDING', contractReceived: 'PENDING-RECEIVED',
  });
  data.rentLedgerV202.push({
    id: 'wrong-contract-same-unit', receiptNo: 'R-WRONG-CONTRACT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
    contractId: 'contract-b', period: '2026-08', due: 200, paid: 200,
    paidAt: '2026-08-30', method: 'KNET', knetTransactionNo: 'WRONG-999',
    status: 'paid', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  assert.equal(typeof runtime.propertyRentLedgerRows, 'function');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const rows = Array.from(runtime.propertyRentLedgerRows(context, '2026-08'));
  assert.deepEqual(rows.map((row) => [row.contractId, row.unit, row.contractNo]), [
    ['contract-a', 'A', 'DUPLICATE-TEST'],
    ['contract-b', 'B', 'DUPLICATE-TEST'],
  ]);

  const a = rows.find((row) => row.contractId === 'contract-a');
  const b = rows.find((row) => row.contractId === 'contract-b');
  assert.deepEqual(
    [a.contractRent, a.currentRent, a.insurance, a.advance, a.cleaningFee, a.paid, a.pending, a.balance],
    [150, 95, 40, 10, 5, 40, 20, 60],
  );
  assert.deepEqual(
    [a.paymentDate, a.paymentMethod, a.knetTransactionNo, a.voucherNo, a.contractReceived, a.accountant],
    ['2026-08-12', 'KNET', '012345', 'R-A-PAID', 'RECEIVED-A', 'TEST ACCOUNTANT'],
  );
  assert.equal(b.paid, 50);
  assert.equal(
    rows.some((row) => /PENDING|WRONG|ORPHAN/.test([
      row.knetTransactionNo, row.voucherNo, row.contractReceived,
    ].join(' '))),
    false,
  );

  const model = runtime.propertyRentLedgerModel(context, '2026-08');
  assert.deepEqual(
    [model.totals.due, model.totals.paid, model.totals.pending, model.totals.balance],
    [300, 90, 20, 210],
  );
});

test('V206.1 integrated ledger gives official totals, unit count, and source pages authority over detail rows', () => {
  const data = fixture();
  data.rentStatementsV202 = [{
    id: 'official-override-2026-08',
    property: 'SYNTHETIC TEST PROPERTY',
    period: '2026-08',
    totalRent: 9999,
    totalCollected: 1234,
    totalAdvance: 321,
    totalInsurance: 654,
    totalCleaning: 87,
    unitCount: 31,
    sourcePages: '1–31',
    source: 'protected-rent-import-v202',
  }];

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const model = runtime.propertyRentLedgerModel(context, '2026-08');

  assert.equal(model.official, true);
  assert.deepEqual(
    [model.detailTotals.due, model.detailTotals.paid],
    [300, 90],
    'detail totals remain available only for reconciliation',
  );
  assert.deepEqual(
    [
      model.totals.due,
      model.totals.paid,
      model.totals.balance,
      model.totals.currentRent,
      model.totals.advance,
      model.totals.insurance,
      model.totals.cleaningFee,
    ],
    [9999, 1234, 8765, 9999, 321, 654, 87],
    'every official amount must override conflicting detail-row calculations',
  );
  assert.equal(model.unitCount, 31);
  assert.equal(model.sourcePages, '1–31');
  assert.equal(model.collectionRate, 1234 / 9999 * 100);

  const html = runtime.propertyRentLedgerDocument(context, '2026-08');
  assert.match(html, /الوحدات \/ UNITS<\/span><strong>31<\/strong>/);
  assert.match(html, /1–31/, 'the official source-page reference must remain visible in the ledger');
});

test('V206 ledger document renders exactly 14 bilingual columns', () => {
  const runtime = loadRuntime(fixture(), [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const html = runtime.propertyRentLedgerDocument(
    runtime.contextFor('SYNTHETIC TEST PROPERTY'),
    '2026-08',
  );
  assert.match(html, /data-v206-ledger/);
  assert.match(html, /data-v206-export-csv/);
  const head = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] || '';
  assert.equal((head.match(/<th\b/g) || []).length, 14);
  for (const label of [
    'رقم الوحدة', 'FLAT NO.', 'اسم المستأجر', 'NAME OF THE TENANT',
    'رقم العقد', 'CONTRACT NO.', 'عقد إيجار', 'RENT CONTRACT',
    'تأمين', 'INSURANCE', 'عربون', 'ADVANCE',
    'رسوم النظافة', 'CLEANING FEES', 'الإيجار الحالي', 'CURRENT RENT',
    'تاريخ الدفع', 'PAYMENT DATE', 'طريقة الدفع', 'PAYMENT METHOD',
    'رقم عملية كي نت', 'KNET OPERATION NUMBER', 'رقم الوصل', 'VOUCHER NO.',
    'استلام العقد', 'RECEIPT CONTRACT', 'المحاسب', 'ACCOUNTANT',
  ]) {
    assert.match(head, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(html, /R-A-PAID/);
  assert.doesNotMatch(html, /R-A-PENDING|R-IMPORTED-ORPHAN|OTHER TENANT|OTHER-1/);
});

test('V206 CSV is UTF-8 and neutralizes spreadsheet formulas', () => {
  const runtime = loadRuntime(fixture());
  const csv = runtime.propertyRentLedgerCsv({
    rows: [{
      unit: '=2+2', tenant: '+CMD("x,y")', contractNo: '-10', contractRent: 150,
      insurance: 40, advance: 10, cleaningFee: 5, currentRent: 95,
      paymentDate: '2026-08-12', paymentMethod: ' @SUM(A1:A2)',
      knetTransactionNo: '012345', voucherNo: 'R-A-PAID',
      contractReceived: 'yes', accountant: 'TEST',
    }],
  });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"'\+CMD\(""x,y""\)"/);
  assert.match(csv, /"'-10"/);
  assert.match(csv, /"' @SUM\(A1:A2\)"/);
  assert.match(csv, /"'012345"/);
  assert.equal((csv.split(/\r?\n/)[0].match(/,/g) || []).length, 13);
});

test('V206.1 contract acknowledgements never become rent receipts', () => {
  const data = fixture();
  const directory = data.tenantDirectoryV202.find((record) => record.unit === 'A');
  directory.contractReceipt = 'CONTRACT-ACK-ONLY';
  directory.contractReceived = '';
  data.rentLedgerV202 = data.rentLedgerV202.filter((entry) => (
    entry.contractId !== 'contract-a' && entry.unit !== 'A'
  ));

  const runtime = loadRuntime(data);
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  assert.ok(record);
  assert.equal(record.contractReceived, 'CONTRACT-ACK-ONLY');
  assert.deepEqual(Array.from(record.receipts), []);

  const unitsHtml = runtime.unitsPanel(context, '2026-08', true);
  const unitCard = unitsHtml.match(/<article[^>]+data-v202-unit-index="0"[\s\S]*?<\/article>/)?.[0] || '';
  assert.ok(unitCard);
  assert.doesNotMatch(unitCard, /data-v202-unit-receipt="0"/);
  const unitReceiptsField = unitCard.match(/<div class="aq-unit-field[^>]*><dt>الوصولات<\/dt><dd>[\s\S]*?<\/dd><\/div>/)?.[0] || '';
  assert.doesNotMatch(unitReceiptsField, /CONTRACT-ACK-ONLY/);

  const statementHtml = runtime.tenantStatementDocument(context, record, '2026-08');
  const actionBlock = statementHtml.match(/<div class="v204-statement-actions v202-no-print">([\s\S]*?)<\/div>/)?.[0] || '';
  const voucherField = statementHtml.match(/<div class="v204-field [^"]*"><dt><span>رقم الإيصال<\/span><small>Voucher No\.<\/small><\/dt><dd>[\s\S]*?<\/dd><\/div>/)?.[0] || '';
  assert.doesNotMatch(actionBlock, /data-v202-tenant-receipt=/);
  assert.doesNotMatch(voucherField, /CONTRACT-ACK-ONLY/);
  assert.match(statementHtml, /Contract Received<\/small><\/dt><dd>CONTRACT-ACK-ONLY<\/dd>/);
});

test('V206.1 voucher-only settled payments generate receipts while pending references cannot', () => {
  const data = fixture();
  data.rentLedgerV202 = data.rentLedgerV202.filter((entry) => entry.contractId !== 'contract-a');
  data.rentLedgerV202.push(
    {
      id: 'voucher-only-settled', receiptNo: '', voucherNo: 'VOUCHER-ONLY-42',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
      contractId: 'contract-a', period: '2026-08', due: 100, paid: 40,
      paidAt: '2026-08-20', method: 'KNET', knetTransactionNo: 'KNET-VOUCHER-42',
      status: 'paid', source: 'synthetic-test-import',
    },
    {
      id: 'pending-with-references', receiptNo: 'PENDING-RECEIPT-9', voucherNo: 'PENDING-VOUCHER-9',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
      contractId: 'contract-a', period: '2026-08', due: 100, paid: 60,
      paidAt: '2026-08-21', method: 'KNET', status: 'قيد المراجعة',
      source: 'synthetic-test-import',
    },
  );
  const bridge = {
    context: {
      user: { id: 'user-test' },
      membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' },
      workspace: { id: 'workspace-test' },
    },
  };
  const runtime = loadRuntime(data, [], { AQARI_SUPABASE: bridge });
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  assert.ok(record);
  assert.deepEqual(Array.from(record.receipts), ['VOUCHER-ONLY-42']);

  const statementHtml = runtime.tenantStatementDocument(context, record, '2026-08');
  const actionBlock = statementHtml.match(/<div class="v204-statement-actions v202-no-print">([\s\S]*?)<\/div>/)?.[0] || '';
  assert.match(actionBlock, /data-v202-tenant-receipt="VOUCHER-ONLY-42"/);
  assert.doesNotMatch(actionBlock, /PENDING-RECEIPT-9|PENDING-VOUCHER-9/);

  const settled = runtime.tenantLedgerEntries(context, record, '2026-08')
    .find((entry) => entry.id === 'voucher-only-settled');
  const receiptHtml = runtime.tenantReceiptDocument(context, record, settled, '2026-08');
  assert.match(receiptHtml, /VOUCHER-ONLY-42/);
  assert.match(receiptHtml, /<small>RENT RECEIPT<\/small>/);
  assert.doesNotMatch(receiptHtml, /PENDING-RECEIPT-9|PENDING-VOUCHER-9/);

  runtime.setActiveTenantStatementKey(record.key);
  assert.equal(runtime.openTenantReceipt(null, 'PENDING-RECEIPT-9', '2026-08'), false);
  assert.equal(runtime.openTenantReceipt(null, 'PENDING-VOUCHER-9', '2026-08'), false);
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

test('V204 protected unit directory keeps units exact, searchable, and masked by default', () => {
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
  assert.equal(
    data.contractsV202.find((contract) => contract.id === 'contract-expired').end_date,
    '2026-07-31',
    'the legal contract end date must remain unchanged in its source record',
  );
  assert.match(d.endDate, /^(?:2026-07-31|31\/07\/2026)$/, 'the directory may display the same legal date in ISO or source format');
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
  assert.match(html, /data-v202-unit-statement="0"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);

  const payment = runtime.paymentDialogMarkup(context, 'contract-a');
  assert.match(payment, /<option value="contract-a" selected>/);
});

test('P0 tenant rent statement is bilingual, complete, and isolated by contract and unit', () => {
  const data = fixture();
  data.tenantDirectoryV202[0].notes = 'Insurance date: 22/10/2025; Advance date: 20/10/2025; <img src=x onerror=alert(1)>';
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
  assert.equal(typeof runtime.tenantStatementDocument, 'function');
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08');
  const selected = records.find((record) => record.contractId === 'contract-a' && record.unit === 'A');
  assert.ok(selected, 'the selected tenant record must be resolved by its contract and unit');

  const html = runtime.tenantStatementDocument(context, selected, '2026-08');
  for (const label of [
    'كشف إيجار المستأجر', 'Tenant Rent Statement',
    'بيانات المستأجر', 'Tenant Information',
    'بيانات العقد', 'Contract Details',
    'الالتزامات المالية', 'Financial Details',
    'تحصيل الإيجار', 'Rent Collection',
    'اسم المستأجر', 'Tenant Name',
    'رقم الوحدة', 'Flat No.',
    'رقم العقد', 'Contract No.',
    'إيجار العقد', 'Contract Rent',
    'الإيجار الحالي', 'Current Rent',
    'المستحق', 'Due',
    'المدفوع', 'Paid',
    'قيد المراجعة', 'Pending',
    'المتبقي', 'Balance',
    'الهاتف', 'Phone',
    'الجنسية', 'Nationality',
    'الرقم المدني', 'Civil ID',
    'البريد الإلكتروني', 'Email',
    'بداية العقد', 'Contract Start',
    'نهاية العقد', 'Contract End',
    'تاريخ الدفع', 'Payment Date',
    'طريقة الدفع', 'Payment Method',
    'رقم عملية كي نت', 'KNET Operation No.',
    'رقم الإيصال', 'Voucher No.',
    'استلام العقد', 'Contract Received',
    'المحاسب', 'Accountant',
    'مبلغ التأمين', 'Insurance Amount',
    'تاريخ التأمين', 'Insurance Date',
    'مبلغ العربون', 'Advance Amount',
    'تاريخ العربون', 'Advance Date',
    'رسوم النظافة', 'Cleaning Fees',
    'عرض شهر مجاني', 'Free Month Offer',
    'تبليغ بالإخلاء', 'Notice of Eviction',
    'الملاحظات', 'Notes',
    'مرجع الصفحة', 'Source Page',
  ]) assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `missing bilingual label: ${label}`);

  for (const selectedValue of [
    'TEST TENANT', 'SYNTHETIC TEST PROPERTY', 'DUPLICATE-TEST',
    '55500001', 'TEST ACCOUNTANT', 'a@example.test', 'R-A-PAID', 'KNET', '012345',
    '22/10/2025', '20/10/2025',
  ]) assert.match(html, new RegExp(selectedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing selected tenant value: ${selectedValue}`);

  assert.match(html, /(?:150|١٥٠)/, 'face contract rent must remain distinct and visible');
  assert.match(html, /(?:100|١٠٠)/, 'current rent must remain visible');
  assert.match(html, /(?:40|٤٠)/, 'settled amount must remain visible');
  assert.match(html, /(?:20|٢٠)/, 'pending amount must remain visible');
  assert.match(html, /(?:60|٦٠)/, 'balance must remain visible');
  assert.match(html, /9012/);
  assert.doesNotMatch(html, /123456789012/, 'civil ID must be masked by default');
  assert.doesNotMatch(html, /55500002|b@example\.test|R-B-PAID|987654321098/, 'another unit must never leak into the selected statement');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /href="mailto:a@example\.test/i);
  assert.match(
    html,
    /KNET Operation No\.<\/small><\/dt><dd>012345<\/dd>/,
    'the KNET reference must appear in its dedicated field, not only in free-form notes',
  );
});

test('P0 tenant statement mailto is safe, useful, and unavailable for invalid addresses', () => {
  const runtime = loadRuntime(fixture());
  assert.equal(typeof runtime.validEmail, 'function');
  assert.equal(typeof runtime.tenantMailto, 'function');
  assert.equal(runtime.validEmail('a@example.test'), true);
  assert.equal(runtime.validEmail('  A.Person+rent@example.test  '), true);
  for (const invalid of [
    '', '@example.test', 'tenant@example', 'tenant @example.test',
    'first@example.test; second@example.test', 'javascript:alert(1)',
    'tenant@example.test\r\nBcc:attacker@example.test',
  ]) assert.equal(runtime.validEmail(invalid), false, `${JSON.stringify(invalid)} must not become a mail link`);

  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const selected = runtime.unitDirectoryRecords(context, '2026-08').find((record) => record.unit === 'A');
  const href = runtime.tenantMailto(selected, '2026-08');
  const decoded = decodeURIComponent(href.replace(/\+/g, ' '));
  assert.match(href, /^mailto:a@example\.test\?/i);
  assert.match(decoded, /TEST TENANT/);
  assert.match(decoded, /SYNTHETIC TEST PROPERTY/);
  assert.match(decoded, /(?:unit|الوحدة).*A/i);
  assert.match(decoded, /2026-08|أغسطس 2026|August 2026/);
  assert.match(decoded, /SYNTHETIC TEST PROPERTY \/ AQARI PROPERTY/);
  assert.match(decoded, /myaqari\.com/);
  assert.doesNotMatch(
    decoded,
    /برج ضحاوي|DHAHAWI|dhahawitower|dhahawikw\.com/i,
    'a non-Dhahawi property email must never inherit Dhahawi identity or contact details',
  );
  assert.doesNotMatch(decoded, /123456789012/, 'civil ID must never enter an email URI');
  assert.equal(runtime.tenantMailto({ ...selected, email: '@example.test' }, '2026-08'), '');
  assert.equal(runtime.tenantMailto({ ...selected, email: 'tenant@example.test\r\nBcc:attacker@example.test' }, '2026-08'), '');
});

test('V206.1 statement and receipt openers fail closed without an active membership', () => {
  const runtime = loadRuntime(fixture());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  assert.ok(record);
  runtime.setActiveTenantStatementKey(record.key);

  assert.equal(runtime.openStatementDocument('2026-08'), false);
  assert.equal(runtime.openUnitReceipt({ getAttribute: () => '0' }), false);
  assert.equal(runtime.openTenantReceipt(null, 'R-A-PAID', '2026-08'), false);
});

test('P0 tenant statement actions open only the selected unit contract and latest settled receipt', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'ledger-wrong-contract-same-unit',
    receiptNo: 'R-WRONG-CONTRACT',
    property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A',
    tenant: 'TEST TENANT',
    contractId: 'contract-b',
    period: '2026-08',
    due: 200,
    paid: 200,
    paidAt: '2026-08-31',
    method: 'KNET',
    status: 'paid',
    source: 'protected-rent-import-v202',
  });
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
  assert.equal(typeof runtime.tenantLedgerEntries, 'function');
  assert.equal(typeof runtime.tenantReceiptDocument, 'function');
  assert.equal(typeof runtime.tenantContractDocument, 'function');
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const selected = runtime.unitDirectoryRecords(context, '2026-08')
    .find((record) => record.contractId === 'contract-a' && record.unit === 'A');
  assert.ok(selected);

  const html = runtime.tenantStatementDocument(context, selected, '2026-08');
  const actionBlock = html.match(/<div class="v204-statement-actions v202-no-print">([\s\S]*?)<\/div>/)?.[0] || '';
  assert.ok(actionBlock, 'related document actions must be grouped in the non-printing toolbar');
  assert.match(actionBlock, /data-v202-tenant-contract="contract-a"/);
  assert.match(actionBlock, />عقد الإيجار \/ Tenancy Contract<\/button>/);
  assert.match(actionBlock, /data-v202-tenant-receipt="R-A-PAID"/);
  assert.match(actionBlock, />وصل الإيجار \/ Rent Receipt<\/button>/);
  assert.doesNotMatch(actionBlock, /contract-b|R-B-PAID|R-A-PENDING|R-WRONG-CONTRACT/);

  const scopedEntries = Array.from(runtime.tenantLedgerEntries(context, selected, '2026-08'));
  assert.deepEqual(scopedEntries.map((entry) => entry.receiptNo).sort(), ['R-A-PAID', 'R-A-PENDING'].sort());
  assert.equal(scopedEntries.some((entry) => entry.receiptNo === 'R-WRONG-CONTRACT'), false);
  const selectedReceipt = scopedEntries.find((entry) => entry.receiptNo === 'R-A-PAID');
  assert.equal(runtime.settledPayment(selectedReceipt.status), true, 'a rent receipt action must target a settled payment');

  const receiptHtml = runtime.tenantReceiptDocument(context, selected, selectedReceipt, '2026-08');
  for (const value of ['R-A-PAID', 'TEST TENANT', 'DUPLICATE-TEST', 'SYNTHETIC TEST PROPERTY']) {
    assert.match(receiptHtml, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(receiptHtml, /<small>RENT RECEIPT<\/small>/);
  assert.doesNotMatch(receiptHtml, /R-A-PENDING|R-B-PAID|R-WRONG-CONTRACT|55500002|b@example\.test/);

  const contractHtml = runtime.tenantContractDocument(context, selected);
  for (const value of ['TEST TENANT', 'DUPLICATE-TEST', 'SYNTHETIC TEST PROPERTY', '55500001', 'a@example.test']) {
    assert.match(contractHtml, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(contractHtml, /<small>TENANCY CONTRACT<\/small>/);
  assert.match(contractHtml, /9012/);
  assert.doesNotMatch(contractHtml, /123456789012|contract-b|R-B-PAID|55500002|b@example\.test/);
});

test('V204 protected import refuses inactive sessions and never exposes unlisted authorization fields', async () => {
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
  assert.doesNotMatch(source, /civilId\s*:\s*['"]\d+/, 'tenant civil IDs must never be embedded in the public runtime');
  assert.match(source, /SIGNED_OUT/);
  assert.match(source, /clearProtectedImport\(\)/);
});

test('V204 active protected import stays in memory and clears without mutating local tenant data', async () => {
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
  const protectedLedgerRows = Array.from(runtime.propertyRentLedgerRows(protectedContext, '2026-08'));
  assert.deepEqual(
    protectedLedgerRows.map((row) => row.contractId),
    ['contract-a', 'contract-b', 'contract-expired'],
    'the integrated ledger must use the protected in-memory cache rather than raw local db data',
  );
  const protectedA = protectedLedgerRows.find((row) => row.contractId === 'contract-a');
  assert.deepEqual(
    [protectedA.unit, protectedA.paid, protectedA.paymentDate, protectedA.knetTransactionNo, protectedA.voucherNo],
    ['A', 40, '2026-08-12', '012345', 'R-A-PAID'],
  );
  assert.equal(JSON.stringify(local), before);
  assert.equal(
    protectedContext.propertyLedger.length,
    remote.rentLedgerV202.filter((record) => (
      record.property === 'SYNTHETIC TEST PROPERTY' && record.source === 'protected-rent-import-v202'
    )).length,
    'protected ledger must remain available after an in-memory hydrate',
  );
  assert.equal(
    protectedContext.propertyCollections.some((row) => row[0] === 'R-A-PAID'),
    true,
    'a hydrated settled payment must remain available for receipts and statements',
  );
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

test('V204 sign-out generation prevents an in-flight protected response from restoring data', async () => {
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

test('V204 blocks protected payment even when a local property has the same name', async () => {
  const local = fixture();
  local.properties = [['SYNTHETIC TEST PROPERTY', 'LOCAL OWNER', '4', '300']];
  local.contractsV202 = [{
    id: 'local-collision', contract_no: 'LOCAL-ONLY', tenant: 'LOCAL COLLISION TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'LOCAL', rent: 777,
    status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31', source: 'v202-entry',
  }];
  local.tenantDirectoryV202 = [{
    property: 'SYNTHETIC TEST PROPERTY', unit: 'LOCAL', tenant: 'LOCAL COLLISION TENANT',
    contractNo: 'LOCAL-ONLY', civilId: '999988887777', source: 'v202-entry',
  }];
  local.rentLedgerV202 = [{
    id: 'local-collision-payment', receiptNo: 'LOCAL-COLLISION-RECEIPT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'LOCAL', tenant: 'LOCAL COLLISION TENANT',
    contractId: 'local-collision', period: '2026-08', due: 777, paid: 777,
    paidAt: '2026-08-15', method: 'cash', status: 'paid', source: 'v202-entry',
    paymentKey: 'synthetic-local-collision-key',
  }];
  local.rentStatementsV202 = [];
  const before = JSON.stringify(local);
  const bridge = {
    context: { user: { id: 'user-test' }, membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' }, workspace: { id: 'workspace-test' } },
    async loadAppState() { return { payload: protectedRemote('SYNTHETIC TEST PROPERTY') }; },
  };
  const runtime = loadRuntime(local, [], { AQARI_SUPABASE: bridge });
  assert.equal(await runtime.hydrateProtectedImport('user-test'), true);
  assert.equal(runtime.protectedPropertyActive('SYNTHETIC TEST PROPERTY'), true);
  const protectedRows = runtime.propertyRentLedgerRows(
    runtime.contextFor('SYNTHETIC TEST PROPERTY'),
    '2026-08',
  );
  assert.equal(protectedRows.some((row) => row.contractId === 'local-collision'), false);
  assert.equal(protectedRows.some((row) => row.voucherNo === 'LOCAL-COLLISION-RECEIPT'), false);
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  assert.equal(runtime.savePayment({ preventDefault() {} }), false);
  assert.equal(JSON.stringify(local), before, 'same-name local property must not weaken the protected payment boundary');
});

test('V204 account switch blocks the old workspace immediately and retries after a stale request', async () => {
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
