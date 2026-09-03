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
      paymentKey
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
