'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'v202-property-os.js');

function loadRuntime(db, localContracts = []) {
  const original = fs.readFileSync(runtimePath, 'utf8');
  const wrapperEnd = original.lastIndexOf('})();');
  assert.notEqual(wrapperEnd, -1, 'V202 runtime wrapper must be present');

  const expose = `
    globalThis.__AQARI_V202_TESTING__ = Object.freeze({
      strictMoney,
      moneyFils,
      round3,
      addMoney,
      subtractMoney,
      sumMoney,
      compareMoney,
      contractCoversPeriod,
      signedContract,
      contractRent,
      contracts,
      contextFor,
      latestOfficialPeriod,
      collectionsPanel,
      ledgerRecords,
      ledgerSelection,
      paymentAmountIssue,
      collectionAmountInput,
      rentStatementItems,
      rentStatementProjection,
      rentSnapshot,
      billableContractsForPeriod,
      billableContractStatus,
      paymentMatchesContract,
      paymentContracts,
      paymentDialogMarkup,
      paymentState,
      settledPayment,
      receiptAvailableForStatus,
      paymentStatusAllowedForSave,
      paymentKey,
      latestSettledReceipt
    });
  `;
  const source = original.slice(0, wrapperEnd) + expose + original.slice(wrapperEnd);
  const sandbox = {
    console,
    db,
    window: {},
    document: {
      readyState: 'loading',
      addEventListener() {},
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
    contractsV202: [
      {
        id: 'contract-a',
        contract_no: 'DUPLICATE-TEST',
        tenant: 'TEST TENANT',
        property: 'SYNTHETIC TEST PROPERTY',
        unit: 'A',
        rent: 100,
        contractRent: 150,
        insurance: 20,
        advance: 10,
        cleaningFees: 5,
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

test('payment statuses have explicit settled, pending, and ignored states', () => {
  const runtime = loadRuntime(fixture());

  for (const status of ['paid', 'partial', 'approved', 'مدفوع', 'تم الدفع', 'تم السداد', 'مسدد', 'تم القبض', 'مقبوض', 'تم الاستلام', 'تم التحصيل', 'معتمد', 'تم الاعتماد']) {
    assert.equal(runtime.paymentState(status), 'settled', status);
    assert.equal(runtime.settledPayment(status), true, status);
  }
  for (const status of [
    '', 'pending', 'processing', 'قيد المراجعة', 'غير مدفوع', 'غير مسدد', 'لم يسدد',
    'لم يتم السداد', 'غير مقبوض', 'لم يتم التحصيل', 'غير محصل', 'غير معتمد', 'لم يعتمد',
    'لم يتم اعتماد الدفعة', 'لم يُعتمد التحصيل', 'بانتظار الاعتماد', 'في انتظار الاعتماد',
    'قيد الاعتماد', 'عدم الاعتماد', 'تحت اعتماد المحاسب', 'لا يوجد اعتماد', 'بدون اعتماد',
  ]) {
    assert.equal(runtime.paymentState(status), 'pending', status || '(empty)');
    assert.equal(runtime.settledPayment(status), false, status || '(empty)');
  }
  for (const status of ['rejected', 'cancelled', 'void', 'refunded', 'مرفوض', 'ملغي', 'مسترد']) {
    assert.equal(runtime.paymentState(status), 'ignored', status);
    assert.equal(runtime.settledPayment(status), false, status);
  }
});

test('blank payment status remains pending in snapshots, property totals, and receipt actions', () => {
  const data = fixture();
  data.rentLedgerV202 = [{
    id:'blank-status', receiptNo:'R-BLANK', property:'SYNTHETIC TEST PROPERTY', unit:'A',
    tenant:'TEST TENANT', contractId:'contract-a', period:'2026-08', paid:25, status:'',
    source:'synthetic-test-import',
  }];
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');

  assert.equal(snapshot.totals.paid, 0);
  assert.equal(snapshot.totals.pending, 25);
  assert.equal(context.collected, 0, 'the property summary must not reinterpret a blank status as paid');
  assert.equal(context.settledCollections.length, 0);
  assert.doesNotMatch(runtime.collectionsPanel(context), /data-v202-receipt-index/);
});

test('negated Arabic contract statuses fail closed instead of becoming billable', () => {
  const runtime = loadRuntime(fixture());
  for (const status of ['غير منتهي', 'ليس منتهي', 'العقد غير منتهي', 'غير موقّع']) {
    const selected = runtime.billableContractsForPeriod([{
      id:'negated-status', contract_no:'NEGATED-1', tenant:'TENANT', property:'SYNTHETIC TEST PROPERTY',
      unit:'N', rent:100, status, start_date:'2026-01-01', end_date:'2026-12-31',
    }], '2026-08');
    assert.equal(selected.contracts.length, 0, status);
  }
});

test('all monetary arithmetic is normalized to exact Kuwaiti fils', () => {
  const runtime = loadRuntime(fixture());

  assert.equal(runtime.moneyFils(12.345), 12345);
  assert.equal(runtime.round3(12.3454), 12.345);
  assert.equal(runtime.round3(12.3456), 12.346);
  assert.equal(runtime.round3(-12.3456), -12.346);
  assert.equal(runtime.addMoney(0.1, 0.2), 0.3);
  assert.equal(runtime.addMoney(-0.1, 0.001), -0.099);
  assert.equal(runtime.subtractMoney(1, 0.333), 0.667);
  assert.equal(runtime.sumMoney([0.1, 0.2, 0.3]), 0.6);
  assert.equal(runtime.compareMoney(0.30000000000000004, 0.3), 0);
  assert.equal(runtime.compareMoney(-0.001, 0), -1);
  assert.equal(runtime.compareMoney(0.001, 0), 1);
  assert.equal(runtime.strictMoney(runtime.collectionAmountInput('١٢٫٣٤٥ د.ك')), 12.345);
});

test('billable contracts require complete valid dates', () => {
  const data = fixture();
  data.contractsV202.push(
    {
      id: 'contract-missing-date', contract_no: 'BAD-DATE-1', tenant: 'TENANT E',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'E', rent: 500, status: 'signed',
      start_date: '', end_date: '2026-12-31', source: 'synthetic-test-import',
    },
    {
      id: 'contract-invalid-date', contract_no: 'BAD-DATE-2', tenant: 'TENANT F',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'F', rent: 600, status: 'signed',
      start_date: '2026-02-30', end_date: '2026-12-31', source: 'synthetic-test-import',
    },
    {
      id: 'contract-reversed-date', contract_no: 'BAD-DATE-3', tenant: 'TENANT G',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'G', rent: 700, status: 'signed',
      start_date: '2026-12-31', end_date: '2026-01-01', source: 'synthetic-test-import',
    },
  );
  const runtime = loadRuntime(data);

  assert.equal(runtime.contractCoversPeriod({ start_date: '', end_date: '2026-12-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ start_date: '2026-02-30', end_date: '2026-12-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ start_date: '2026-12-31', end_date: '2026-01-01' }, '2026-08'), false);

  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');
  assert.deepEqual(Array.from(snapshot.items, (item) => item.contractId), ['contract-a', 'contract-b']);
  assert.deepEqual(
    Array.from(snapshot.diagnostics.invalidContracts, (entry) => entry.code),
    ['missing_contract_dates', 'invalid_contract_dates', 'reversed_contract_dates'],
  );
  assert.equal(snapshot.totals.due, 300, 'invalid contracts must not add rent due');
});

test('expired contracts remain in their covered historical month only', () => {
  const data = fixture();
  data.contractsV202.push({
    id:'contract-history', contract_no:'HISTORY-1', tenant:'HISTORICAL TENANT',
    property:'SYNTHETIC TEST PROPERTY', unit:'H', rent:80, status:'expired',
    start_date:'2026-01-01', end_date:'2026-08-31', source:'synthetic-test-import',
  });
  const runtime = loadRuntime(data);
  assert.equal(runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08').items.some((item) => item.contractId === 'contract-history'), true);
  assert.equal(runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-09').items.some((item) => item.contractId === 'contract-history'), false);
});

test('payment contract choices are rebuilt for the exact selected period and exclude conflicts', () => {
  const data = fixture();
  data.contractsV202.push({
    id:'contract-history', contract_no:'HISTORY-1', tenant:'HISTORICAL TENANT',
    property:'SYNTHETIC TEST PROPERTY', unit:'H', rent:80, status:'expired',
    start_date:'2026-01-01', end_date:'2026-08-31', source:'synthetic-test-import',
  });
  const runtime = loadRuntime(data);
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');

  assert.deepEqual(
    Array.from(runtime.paymentContracts(context, '2026-08'), (contract) => contract.id),
    ['contract-a', 'contract-b', 'contract-history'],
  );
  assert.deepEqual(
    Array.from(runtime.paymentContracts(context, '2026-09'), (contract) => contract.id),
    ['contract-a', 'contract-b'],
  );
  assert.match(runtime.paymentDialogMarkup(context, '2026-08'), /value="2026-08"/);
  assert.match(runtime.paymentDialogMarkup(context, '2026-08'), /HISTORY-1/);
  assert.doesNotMatch(runtime.paymentDialogMarkup(context, '2026-09'), /HISTORY-1/);

  data.contractsV202.push({
    id:'contract-a-overlap', contract_no:'OVERLAP-A', tenant:'SECOND TENANT',
    property:'SYNTHETIC TEST PROPERTY', unit:'A', rent:90, status:'signed',
    start_date:'2026-08-01', end_date:'2026-08-31', source:'synthetic-test-import',
  });
  const conflictedContext = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  assert.deepEqual(
    Array.from(runtime.paymentContracts(conflictedContext, '2026-08'), (contract) => contract.id),
    ['contract-b', 'contract-history'],
    'neither side of an overlapping unit may be offered for payment',
  );
});

test('payments require the full contract, unit, and tenant tuple or an exact canonical payment key', () => {
  const data = fixture();
  const imported = 'synthetic-test-import';
  data.rentLedgerV202.push(
    {
      id: 'approved-a', receiptNo: 'R-A-APPROVED', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', paid: 10, status: 'approved', source: imported,
    },
    {
      id: 'approved-ar-a', receiptNo: 'R-A-APPROVED-AR', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', paid: 5, status: 'معتمد', source: imported,
    },
    {
      id: 'refunded-a', receiptNo: 'R-A-REFUNDED', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', paid: 80, status: 'refunded', source: imported,
    },
    {
      id: 'wrong-unit-a', receiptNo: 'R-A-WRONG-UNIT', property: 'SYNTHETIC TEST PROPERTY', unit: 'B',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', paid: 500, status: 'paid', source: imported,
    },
    {
      id: 'wrong-tenant-a', receiptNo: 'R-A-WRONG-TENANT', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'ANOTHER TENANT', contractId: 'contract-a', period: '2026-08', paid: 500, status: 'paid', source: imported,
    },
    {
      id: 'wrong-key-a', receiptNo: 'R-A-WRONG-KEY', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', paid: 500, status: 'paid',
      paymentKey: 'tampered-key', source: imported,
    },
  );
  const runtime = loadRuntime(data);
  const contractA = runtime.contracts().find((contract) => contract.id === 'contract-a');
  const canonicalKey = runtime.paymentKey('SYNTHETIC TEST PROPERTY', contractA, 'A', '2026-08');
  data.rentLedgerV202.push({
    id: 'canonical-key-a', receiptNo: 'R-A-KEY', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    paid: 7, status: 'approved', paymentKey: canonicalKey, source: imported,
  });
  data.rentLedgerV202.push({
    id: 'contradictory-key-a', receiptNo: 'R-A-KEY-WRONG-TENANT', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
    tenant: 'ANOTHER TENANT', contractId: 'contract-a', period: '2026-08', paid: 500, status: 'paid',
    paymentKey: canonicalKey, source: imported,
  });

  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');
  const itemA = snapshot.items.find((item) => item.contractId === 'contract-a');
  assert.equal(itemA.paid, 62, 'only exact settled payments may be collected');
  assert.equal(itemA.pending, 20, 'ignored payments must not be reclassified as pending');
  assert.equal(itemA.ignored, 80);
  assert.equal(itemA.ignoredPayments.length, 1);
  assert.equal(snapshot.totals.paid, 112);
  assert.equal(snapshot.totals.pending, 20);
  assert.equal(snapshot.totals.ignored, 80);
  assert.deepEqual(
    Array.from(snapshot.diagnostics.unmatchedPayments, (entry) => entry.receiptNo).sort(),
    ['R-A-KEY-WRONG-TENANT', 'R-A-WRONG-KEY', 'R-A-WRONG-TENANT', 'R-A-WRONG-UNIT', 'R-IMPORTED-ORPHAN'].sort(),
  );
});

test('overlapping signed contracts for one unit are excluded and diagnosed instead of double billed', () => {
  const data = fixture();
  data.contractsV202.push({
    id: 'contract-a-overlap', contract_no: 'OVERLAP-A', tenant: 'SECOND TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 900, status: 'signed',
    start_date: '2026-08-15', end_date: '2026-10-31', source: 'synthetic-test-import',
  });
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.deepEqual(Array.from(snapshot.items, (item) => item.contractId), ['contract-b']);
  assert.equal(snapshot.totals.due, 200, 'the conflicted unit must contribute zero until resolved');
  assert.equal(snapshot.totals.paid, 50, 'payments for the conflicted unit must not leak into another contract');
  assert.equal(snapshot.diagnostics.conflicts.length, 1);
  assert.equal(snapshot.diagnostics.conflicts[0].code, 'overlapping_contracts');
  assert.equal(snapshot.diagnostics.conflicts[0].unit, 'A');
  assert.deepEqual(Array.from(snapshot.diagnostics.conflicts[0].contractIds), ['contract-a', 'contract-a-overlap']);
  assert.ok(snapshot.diagnostics.unmatchedPayments.some((entry) => entry.receiptNo === 'R-A-PAID'));
});

test('conflicting duplicate explicit contract IDs are excluded and diagnosed instead of overwritten', () => {
  const data = fixture();
  data.contractsV202.push({
    id:'contract-a', contract_no:'CONFLICTING-ID', tenant:'OTHER TENANT',
    property:'SYNTHETIC TEST PROPERTY', unit:'Z', rent:900, status:'signed',
    start_date:'2026-01-01', end_date:'2026-12-31', source:'synthetic-test-import',
  });
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(runtime.contracts().filter((contract) => contract.id === 'contract-a').length, 2);
  assert.deepEqual(Array.from(snapshot.items, (item) => item.contractId), ['contract-b']);
  assert.equal(snapshot.totals.due, 200);
  assert.equal(snapshot.diagnostics.invalidIdentityContracts.length, 1);
  assert.equal(snapshot.diagnostics.invalidIdentityContracts[0].code, 'duplicate_contract_id');
  assert.equal(snapshot.diagnostics.invalidIdentityContracts[0].contractId, 'contract-a');
  assert.equal(snapshot.diagnostics.invalidIdentityContracts[0].conflicts.length, 2);
});

test('a compatible local and V202 representation of one explicit contract still merges once', () => {
  const data = fixture();
  const local = [{
    id:'contract-a', contract_no:'DUPLICATE-TEST', tenant:'TEST TENANT',
    property:'SYNTHETIC TEST PROPERTY', unit:'A', rent:75, status:'draft',
    start_date:'2026-01-01', end_date:'2026-12-31',
  }];
  const runtime = loadRuntime(data, local);
  const matches = runtime.contracts().filter((contract) => contract.id === 'contract-a');
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(matches.length, 1);
  assert.equal(matches[0].rent, 100, 'the V202 representation remains authoritative over its compatible local mirror');
  assert.equal(snapshot.diagnostics.invalidIdentityContracts.length, 0);
  assert.deepEqual(Array.from(snapshot.items, (item) => item.contractId), ['contract-a', 'contract-b']);
});

test('duplicate receipts and invalid payment amounts are excluded with explicit diagnostics', () => {
  const data = fixture();
  const common = {
    property:'SYNTHETIC TEST PROPERTY', unit:'A', tenant:'TEST TENANT', contractId:'contract-a',
    period:'2026-08', status:'paid', source:'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...common, id:'duplicate-1', receiptNo:'R-DUPLICATE', paid:10 },
    { ...common, id:'duplicate-2', receiptNo:' r-duplicate ', paid:15 },
    { ...common, id:'invalid-text', receiptNo:'R-INVALID-TEXT', paid:'not-money' },
    { ...common, id:'invalid-zero', receiptNo:'R-INVALID-ZERO', paid:0 },
    { ...common, id:'invalid-negative', receiptNo:'R-INVALID-NEGATIVE', paid:-1 },
    { ...common, id:'invalid-precision', receiptNo:'R-INVALID-PRECISION', paid:'1.2345' },
    { ...common, id:'invalid-collection-precision', receiptNo:'R-COL-PRECISION', source:'v202-entry' },
  );
  data.collections.push(['R-COL-PRECISION', 'TEST TENANT', '1.2345', 'مدفوع']);
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(runtime.ledgerRecords().some((entry) => /^\s*r-duplicate\s*$/i.test(entry.receiptNo)), false);
  for (const id of ['invalid-text', 'invalid-zero', 'invalid-negative', 'invalid-precision', 'invalid-collection-precision']) {
    assert.equal(runtime.ledgerRecords().some((entry) => entry.id === id), false, id);
  }
  assert.equal(snapshot.totals.paid, 90, 'excluded records must not affect totals');
  assert.equal(snapshot.diagnostics.duplicateReceipts.length, 1);
  assert.equal(snapshot.diagnostics.duplicateReceipts[0].code, 'duplicate_receipt');
  assert.equal(snapshot.diagnostics.duplicateReceipts[0].count, 2);
  assert.deepEqual(
    Array.from(snapshot.diagnostics.invalidPayments, (entry) => entry.code).sort(),
    ['excessive_payment_precision', 'excessive_payment_precision', 'invalid_payment_amount', 'non_positive_payment_amount', 'non_positive_payment_amount'].sort(),
  );
});

test('duplicate collection rows are excluded and diagnosed instead of disappearing silently', () => {
  const data = fixture();
  data.collections.push(
    ['R-COL-DUP', 'TEST TENANT', '10.000', 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-01', 'A', '', '2026-08'],
    ['R-COL-DUP', 'TEST TENANT', '10.000', 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-01', 'A', '', '2026-08'],
  );
  data.rentLedgerV202.push({
    id:'collection-duplicate-ledger', receiptNo:'R-COL-DUP', property:'SYNTHETIC TEST PROPERTY', unit:'A',
    tenant:'TEST TENANT', contractId:'contract-a', period:'2026-08', paid:10, status:'paid', source:'v202-entry',
  });
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(runtime.ledgerRecords().some((entry) => entry.receiptNo === 'R-COL-DUP'), false);
  assert.equal(snapshot.totals.paid, 90);
  assert.equal(snapshot.diagnostics.duplicateReceipts.length, 1);
  assert.equal(snapshot.diagnostics.duplicateReceipts[0].receiptNo, 'R-COL-DUP');
  assert.equal(snapshot.diagnostics.duplicateReceipts[0].count, 2);
});

test('invalid rents never enter billing and retain the reason in diagnostics', () => {
  const data = fixture();
  const base = {
    tenant:'INVALID RENT TENANT', property:'SYNTHETIC TEST PROPERTY', status:'signed',
    start_date:'2026-01-01', end_date:'2026-12-31', source:'synthetic-test-import',
  };
  data.contractsV202.push(
    { ...base, id:'rent-text', contract_no:'RENT-TEXT', unit:'E', rent:'abc' },
    { ...base, id:'rent-zero', contract_no:'RENT-ZERO', unit:'F', rent:0 },
    { ...base, id:'rent-negative', contract_no:'RENT-NEGATIVE', unit:'G', rent:-10 },
    { ...base, id:'rent-precision', contract_no:'RENT-PRECISION', unit:'H', rent:'10.0001' },
  );
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(snapshot.totals.due, 300);
  assert.deepEqual(
    Array.from(snapshot.diagnostics.invalidContracts, (entry) => entry.code).sort(),
    ['excessive_contract_rent_precision', 'invalid_contract_rent', 'non_positive_contract_rent', 'non_positive_contract_rent'].sort(),
  );
});

test('overpayments are isolated per contract and never erase another unit balance', () => {
  const data = fixture();
  data.rentLedgerV202 = [{
    id:'overpayment-a', receiptNo:'R-OVERPAY-A', property:'SYNTHETIC TEST PROPERTY', unit:'A',
    tenant:'TEST TENANT', contractId:'contract-a', period:'2026-08', paid:150,
    status:'paid', source:'synthetic-test-import',
  }];
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(snapshot.totals.due, 300);
  assert.equal(snapshot.totals.paid, 150);
  assert.equal(snapshot.totals.balance, 200, 'balance is the sum of each non-negative contract balance');
  assert.deepEqual(Array.from(snapshot.items, (item) => [item.contractId, item.balance]), [
    ['contract-a', 0],
    ['contract-b', 200],
  ]);
  assert.equal(snapshot.diagnostics.overpayments.length, 1);
  assert.equal(snapshot.diagnostics.overpayments[0].amount, 50);
});

test('pending payments have no receipt action until settlement', () => {
  const runtime = loadRuntime(fixture());
  const pending = runtime.collectionsPanel({ propertyCollections: [['R-PENDING', 'TENANT', '10 د.ك', 'قيد المراجعة']] });
  const settled = runtime.collectionsPanel({ propertyCollections: [['R-PAID', 'TENANT', '10 د.ك', 'مدفوع']] });

  assert.equal(runtime.receiptAvailableForStatus('قيد المراجعة'), false);
  assert.equal(runtime.receiptAvailableForStatus('غير مسدد'), false);
  assert.equal(runtime.receiptAvailableForStatus('مدفوع'), true);
  assert.equal(runtime.paymentStatusAllowedForSave('قيد المراجعة'), false);
  assert.equal(runtime.paymentStatusAllowedForSave('غير مسدد'), false);
  assert.equal(runtime.paymentStatusAllowedForSave('مدفوع'), true);
  assert.doesNotMatch(pending, /data-v202-receipt-index/);
  assert.match(pending, /بانتظار الاعتماد/);
  assert.match(settled, /data-v202-receipt-index/);
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.doesNotMatch(source, /<option>قيد المراجعة<\/option>/, 'the receipt form must not offer an unapproved status');
  assert.match(source, /if\(!paymentStatusAllowedForSave\(status\)\)/, 'save must reject a forged pending status');
});

test('computed totals stay authoritative while official totals remain a reference with deltas', () => {
  const data = fixture();
  data.rentStatementsV202 = [{
    id: 'official-august', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    totalRent: 999, totalCollected: 888, totalAdvance: 20, sourcePages: '1-31',
    propertyDetails: { owner: 'REFERENCE OWNER', address: 'TEST ADDRESS', phone: '55550000', email: 'tower@example.com' },
    paciNumber: 'PACI-123', source: 'synthetic-test-import',
  }];
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');

  assert.equal(snapshot.totals.due, 300);
  assert.equal(snapshot.totals.paid, 90);
  assert.equal(snapshot.totals.balance, 210);
  const snapshotA = snapshot.items.find((item) => item.contractId === 'contract-a');
  assert.equal(snapshotA.contractRent, 150);
  assert.equal(snapshotA.currentRent, 100);
  assert.equal(snapshotA.insurance, 20);
  assert.equal(snapshotA.advance, 10);
  assert.equal(snapshotA.cleaning, 5);
  assert.equal(snapshot.official.due, 999);
  assert.equal(snapshot.official.paid, 888);
  assert.deepEqual({ ...snapshot.official.delta }, { due: 699, paid: 798 });
  assert.equal(snapshot.propertyDetails.owner, 'REFERENCE OWNER');
  assert.equal(snapshot.propertyDetails.address, 'TEST ADDRESS');
  assert.equal(snapshot.propertyDetails.phone, '55550000');
  assert.equal(snapshot.propertyDetails.email, 'tower@example.com');
  assert.equal(snapshot.propertyDetails.paciNumber, 'PACI-123');
});

test('protected official statements expose their latest period but never override legal contract dates', () => {
  const data = fixture();
  data.rentStatementsV202 = [
    {
      id:'official-july', property:'SYNTHETIC TEST PROPERTY', period:'2026-07',
      totalRent:700, totalCollected:90, source:'protected-rent-import-v202',
    },
    {
      id:'official-august', property:'SYNTHETIC TEST PROPERTY', period:'2026-08',
      totalRent:700, totalCollected:90, source:'protected-rent-import-v202',
    },
    {
      id:'official-invalid', property:'SYNTHETIC TEST PROPERTY', period:'2026-13',
      totalRent:9999, totalCollected:9999, source:'protected-rent-import-v202',
    },
  ];
  const runtime = loadRuntime(data);
  const snapshot = runtime.rentSnapshot('SYNTHETIC TEST PROPERTY', '2026-08');
  const expired = runtime.contracts().find((contract) => contract.id === 'contract-expired');

  assert.equal(runtime.latestOfficialPeriod('SYNTHETIC TEST PROPERTY'), '2026-08');
  assert.deepEqual(Array.from(snapshot.items, (item) => item.contractId), ['contract-a', 'contract-b']);
  assert.equal(snapshot.totals.due, 300, 'official totals must not bill an off-period contract');
  assert.equal(snapshot.official.due, 700);
  assert.equal(snapshot.official.delta.due, 400, 'the discrepancy must remain visible as a reference delta');
  assert.equal(expired.end_date, '2026-07-31', 'the imported legal end date must remain unchanged');
});

test('latest receipt is settled and exactly linked instead of pending, rejected, or orphaned', () => {
  const data = fixture();
  data.rentLedgerV202.push(
    { id:'latest-pending', receiptNo:'R-PENDING-FUTURE', property:'SYNTHETIC TEST PROPERTY', unit:'B', tenant:'TEST TENANT', contractId:'contract-b', period:'2026-08', paid:200, paidAt:'2099-01-01', status:'قيد الاعتماد', source:'synthetic-test-import' },
    { id:'latest-rejected', receiptNo:'R-REJECTED', property:'SYNTHETIC TEST PROPERTY', unit:'B', tenant:'TEST TENANT', contractId:'contract-b', period:'2026-08', paid:200, status:'rejected', source:'synthetic-test-import' },
    { id:'latest-wrong-unit', receiptNo:'R-WRONG-UNIT', property:'SYNTHETIC TEST PROPERTY', unit:'A', tenant:'TEST TENANT', contractId:'contract-b', period:'2026-08', paid:200, status:'paid', source:'synthetic-test-import' },
    { id:'latest-old-period', receiptNo:'R-OLD-PERIOD', property:'SYNTHETIC TEST PROPERTY', unit:'A', tenant:'TEST TENANT', contractId:'contract-a', period:'2026-07', paid:100, status:'paid', source:'synthetic-test-import' },
  );
  const runtime = loadRuntime(data);
  const receipt = runtime.latestSettledReceipt(runtime.contextFor('SYNTHETIC TEST PROPERTY'));
  assert.equal(receipt[0], 'R-B-PAID');
  assert.equal(receipt[1], 'TEST TENANT');
});

test('protected import whitelist retains identity and receipt audit fields', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  for (const field of [
    'contractId', 'contract_id', 'contractNo', 'contract_no', 'propertyName', 'unitName', 'tenantName',
    'paymentKey', 'knetOperationNo', 'knetOperationNumber', 'knetNo', 'voucherNo', 'receiptContract', 'accountant',
    'insurance', 'advance', 'cleaning', 'cleaningFees',
    'propertyDetails', 'propertyAddress', 'propertyPhone', 'propertyEmail', 'paciNumber',
  ]) {
    assert.match(source, new RegExp("['\"]" + field + "['\"]"), field + ' must remain explicitly whitelisted');
  }
});
