'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'v202-property-os.js');

function loadRuntime(db, localContracts = [], runtimeWindow = {}, runtimeOptions = {}) {
  const original = fs.readFileSync(runtimePath, 'utf8');
  const wrapperEnd = original.lastIndexOf('})();');
  assert.notEqual(wrapperEnd, -1, 'V202 runtime wrapper must be present');

  const expose = `
    globalThis.__AQARI_V202_TESTING__ = Object.freeze({
      strictMoney,
      strictCount,
      contractCoversPeriod,
      signedContract,
      contractRent,
      contracts,
      contextFor,
      journey,
      dueKpi,
      dueNeedsReview,
      ledgerRecords,
      rentStatementItems,
      propertyRentLedgerRows: typeof propertyRentLedgerRows === 'function' ? propertyRentLedgerRows : null,
      propertyRentLedgerModel: typeof propertyRentLedgerModel === 'function' ? propertyRentLedgerModel : null,
      propertyRentLedgerDocument: typeof propertyRentLedgerDocument === 'function' ? propertyRentLedgerDocument : null,
      propertyRentLedgerCsv: typeof propertyRentLedgerCsv === 'function' ? propertyRentLedgerCsv : null,
      statementIncludesContract,
      latestOfficialPeriod,
      settledPayment,
      pendingPayment: typeof pendingPayment === 'function' ? pendingPayment : null,
      paymentKey,
      receiptExists: typeof receiptExists === 'function' ? receiptExists : null,
      nextReceiptNumber: typeof nextReceiptNumber === 'function' ? nextReceiptNumber : null,
      paidForPeriod: typeof paidForPeriod === 'function' ? paidForPeriod : null,
      tenantDirectory,
      unitDirectoryRecords,
      filterUnitRecords,
      maskCivilId,
      unitsPanel,
      collectionsPanel: typeof collectionsPanel === 'function' ? collectionsPanel : null,
      collectionReceiptEligible: typeof collectionReceiptEligible === 'function' ? collectionReceiptEligible : null,
      collectionFinanciallySettled: typeof collectionFinanciallySettled === 'function' ? collectionFinanciallySettled : null,
      ledgerReference: typeof ledgerReference === 'function' ? ledgerReference : null,
      validRecordedDate: typeof validRecordedDate === 'function' ? validRecordedDate : null,
      tenantStatementDocument: typeof tenantStatementDocument === 'function' ? tenantStatementDocument : null,
      tenantReceiptDocument: typeof tenantReceiptDocument === 'function' ? tenantReceiptDocument : null,
      tenantContractDocument: typeof tenantContractDocument === 'function' ? tenantContractDocument : null,
      tenantLedgerEntries: typeof tenantLedgerEntries === 'function' ? tenantLedgerEntries : null,
      tenantStatementRecord: typeof tenantStatementRecord === 'function' ? tenantStatementRecord : null,
      openStatementDocument: typeof openStatementDocument === 'function' ? openStatementDocument : null,
      openUnitReceipt: typeof openUnitReceipt === 'function' ? openUnitReceipt : null,
      openUnitPayment: typeof openUnitPayment === 'function' ? openUnitPayment : null,
      openTenantReceipt: typeof openTenantReceipt === 'function' ? openTenantReceipt : null,
      openReceiptDocument: typeof openReceiptDocument === 'function' ? openReceiptDocument : null,
      resolvedTenantReceipt: typeof resolvedTenantReceipt === 'function' ? resolvedTenantReceipt : null,
      receiptDocument: typeof receiptDocument === 'function' ? receiptDocument : null,
      validOfficialStatement: typeof validOfficialStatement === 'function' ? validOfficialStatement : null,
      officialStatementFor: typeof officialStatementFor === 'function' ? officialStatementFor : null,
      validEmail: typeof validEmail === 'function' ? validEmail : null,
      tenantMailto: typeof tenantMailto === 'function' ? tenantMailto : null,
      rentWriteAllowed: typeof rentWriteAllowed === 'function' ? rentWriteAllowed : null,
      secureRentOfficeProperties: typeof secureRentOfficeProperties === 'function' ? secureRentOfficeProperties : null,
      dailyCollectionSummary,
      secureRentOfficeData: typeof secureRentOfficeData === 'function' ? secureRentOfficeData : null,
      secureRentOfficeAction: typeof secureRentOfficeAction === 'function' ? secureRentOfficeAction : null,
      paymentDialogMarkup,
      savePayment,
      commitPayment,
      savedVoucher,
      printDocument,
      searchPaymentContracts,
      pickedRecord,
      protectedFields: PROTECTED_FIELDS,
      protectedPropertyActive,
      protectedAccessReady,
      protectedHydrationReady,
      hydrateProtectedImport,
      clearProtectedImport,
      handleProtectedAuthStateChange,
      handleProtectedBoundaryState,
      installHydrateBoundaryListener,
      sealProtectedImport,
      setActiveProperty(value) { activeProperty = String(value || ''); },
      setActivePeriod(value) { activePropertyPeriod = value; },
      setActiveTenantStatementKey(value) { activeTenantStatementKey = String(value || ''); }
    });
  `;
  const source = original.slice(0, wrapperEnd) + expose + original.slice(wrapperEnd);
  const accessContext = runtimeWindow.AQARI_SUPABASE?.context;
  const accessUserId = String(accessContext?.user?.id || '').trim();
  const accessWorkspaceId = String(accessContext?.workspace?.id || '').trim();
  const accessMembership = accessContext?.membership;
  const initialGateScope = accessUserId && accessWorkspaceId &&
    accessMembership?.is_active === true &&
    String(accessMembership.user_id || '') === accessUserId &&
    String(accessMembership.workspace_id || '') === accessWorkspaceId
    ? { userId:accessUserId, workspaceId:accessWorkspaceId }
    : null;
  if(!Object.hasOwn(runtimeWindow, 'AQARI_DATA_GATE')) runtimeWindow.AQARI_DATA_GATE = { scope:initialGateScope };
  if(!Object.hasOwn(runtimeWindow, 'AQARI_EARLY_STORAGE_GATE')) runtimeWindow.AQARI_EARLY_STORAGE_GATE = { scope:initialGateScope };
  const authClasses = runtimeOptions.authClasses || new Set(initialGateScope ? ['aqari-auth-unlocked'] : []);
  const elements = runtimeOptions.elements || {};
  const sandbox = {
    console,
    db,
    window: runtimeWindow,
    document: {
      readyState: 'loading',
      documentElement: { classList: { contains(value) { return authClasses.has(value); } } },
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById(id) { return elements[id] || null; },
      createElement() { return {}; },
      head: { appendChild() {} },
      body: { children: [], classList: { add() {}, remove() {}, toggle() {} } },
    },
    localContractsV55() {
      return localContracts;
    },
    persist: runtimeOptions.persist,
    render: runtimeOptions.render,
    setTimeout: runtimeOptions.setTimeout || function() {},
    clearTimeout() {},
    requestAnimationFrame: runtimeOptions.requestAnimationFrame || function() {},
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
        paidAt: '2026-08-13',
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

function settledCollectionTotal(context) {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const minor = context.settledCollections.reduce(
    (sum, row) => {
      const ascii = String(row?.[2] || 0)
        .replace(/[٠-٩]/g, (digit) => digits.indexOf(digit))
        .replace(/[۰-۹]/g, (digit) => persianDigits.indexOf(digit))
        .replace(/٫/g, '.').replace(/[٬,]/g, '');
      const amount = Number(ascii.match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
      return sum + BigInt(Math.round(amount * 1000));
    }, 0n,
  );
  return Number(minor) / 1000;
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
        membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test', role: 'general_manager' },
        workspace: { id: 'workspace-test' },
      },
    },
  };
}

function paymentElements(receipt = 'R-TEST-SAVE') {
  return {
    v202PaymentContract: { value: 'contract-a' },
    v202PaymentNumber: { value: receipt },
    v202PaymentAmount: { value: '10' },
    v202PaymentStatus: { value: 'مدفوع' },
    v202PaymentPeriod: { value: '2026-08' },
    v202PaymentDate: { value: '2026-08-28' },
    v202PaymentMethod: { value: 'KNET' },
    v202PaymentNote: { value: '' },
    v202PaymentError: { textContent: '' },
  };
}

test('V202 property accounting keeps contract, payment, and money identities exact', () => {
  const runtime = loadRuntime(fixture());

  assert.equal(runtime.strictMoney('1250.500'), 1250.5);
  assert.equal(runtime.strictMoney('1,250.500'), 1250.5);
  assert.equal(runtime.strictMoney('١٢٥٠٫٥٠٠'), 1250.5);
  assert.equal(runtime.strictMoney('١٬٢٥٠٫٥٠٠'), 1250.5);
  for (const malformed of ['1 250', '12,34', '1.2345', '١٢٣٫١٢٣٤', '-10', '10 د.ك', '1,234٬567', '1٬234,567']) {
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

test('V206.1 rejects conflicting tenant identity even when contract, unit, and payment key match', () => {
  const data = fixture();
  data.rentLedgerV202.push(
    {
      id: 'wrong-tenant-same-contract-unit', receiptNo: 'R-WRONG-TENANT',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'POISON TENANT',
      contractId: 'contract-a', period: '2026-08', due: 100, paid: 999,
      paidAt: '2026-08-30', method: 'KNET', status: 'paid', source: 'synthetic-test-import',
      paymentKey: 'synthetic test property|contract:contract-a|unit:a|2026-08',
    },
    {
      id: 'rejected-same-contract-unit', receiptNo: 'R-REJECTED',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
      contractId: 'contract-a', period: '2026-08', due: 100, paid: 77,
      status: 'rejected', source: 'synthetic-test-import',
    },
  );

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const entries = Array.from(runtime.tenantLedgerEntries(context, record, '2026-08'));
  const row = runtime.propertyRentLedgerRows(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');

  assert.equal(entries.some((entry) => entry.id === 'wrong-tenant-same-contract-unit'), false);
  assert.equal(record.receipts.includes('R-WRONG-TENANT'), false);
  assert.equal(record.paid, 40);
  assert.equal(record.pending, 20, 'rejected entries are not pending money');
  assert.equal(row.paid, 40);
  assert.equal(row.pending, 20);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
});

test('V206.1 keeps simultaneous contracts on one unit isolated by contract identity', () => {
  const data = fixture();
  data.contractsV202.push({
    id: 'contract-a-second', contract_no: 'SECOND-A', tenant: 'SECOND TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 75, status: 'signed',
    start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  });
  data.tenantDirectoryV202.push({
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'SECOND TENANT',
    contractNo: 'SECOND-A', verified: true, source: 'synthetic-test-import',
  });
  data.rentLedgerV202.push({
    id: 'second-contract-payment', receiptNo: 'R-SECOND-A',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'SECOND TENANT',
    contractId: 'contract-a-second', period: '2026-08', due: 75, paid: 30,
    paidAt: '2026-08-18', status: 'paid', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08').filter((entry) => entry.unit === 'A' && entry.hasContract);
  const rows = runtime.propertyRentLedgerRows(context, '2026-08').filter((entry) => entry.unit === 'A');
  assert.deepEqual(Array.from(records, (entry) => entry.contractId).sort(), ['contract-a', 'contract-a-second']);
  assert.equal(new Set(records.map((entry) => entry.key)).size, 2);
  assert.deepEqual(Array.from(rows, (entry) => [entry.contractId, entry.tenant, entry.paid]), [
    ['contract-a', 'TEST TENANT', 40],
    ['contract-a-second', 'SECOND TENANT', 30],
  ]);
});

test('V206.1 never reuses protected directory fields across simultaneous unit contracts', () => {
  const data = fixture();
  data.contractsV202.push({
    id: 'contract-a-without-directory', contract_no: 'SECOND-A-NO-DIRECTORY', tenant: 'SECOND TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 75, status: 'signed',
    start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a-without-directory');

  assert.ok(record);
  assert.equal(record.tenant, 'SECOND TENANT');
  assert.equal(record.phone, '');
  assert.equal(record.civilId, '');
  assert.equal(record.email, '');
  assert.equal(record.hasDirectory, false);
});

test('V206.1 rejects a unit-only directory fallback when tenant or contract identity conflicts', () => {
  const data = fixture();
  data.contractsV202.push({
    id: 'contract-a-newer', contract_no: 'NEWER-A', tenant: 'NEWER TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 75, status: 'signed',
    start_date: '2026-02-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08');
  const original = records.find((entry) => entry.contractId === 'contract-a');
  const newer = records.find((entry) => entry.contractId === 'contract-a-newer');

  assert.equal(original.civilId, '123456789012');
  assert.equal(original.phone, '55500001');
  assert.equal(original.hasDirectory, true);
  assert.equal(newer.civilId, '');
  assert.equal(newer.phone, '');
  assert.equal(newer.email, '');
  assert.equal(newer.hasDirectory, false);
});

test('V206.1 leaves a directory row unlinked when two contracts can own it', () => {
  const data = fixture();
  delete data.tenantDirectoryV202[0].contractNo;
  data.contractsV202.push({
    id: 'contract-a-same-party', contract_no: 'SECOND-SAME-PARTY', tenant: 'TEST TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 75, status: 'signed',
    start_date: '2026-02-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08');
  const contracts = records.filter((entry) => ['contract-a', 'contract-a-same-party'].includes(entry.contractId));
  const unlinked = records.find((entry) => !entry.hasContract && entry.unit === 'A' && entry.tenant === 'TEST TENANT');

  assert.equal(contracts.length, 2);
  for (const record of contracts) {
    assert.equal(record.civilId, '');
    assert.equal(record.phone, '');
    assert.equal(record.hasDirectory, false);
  }
  assert.equal(unlinked.civilId, '123456789012');
  assert.equal(unlinked.hasDirectory, true);
});

test('V206.1 quarantines conflicting duplicate directory identities without reusable PII keys', () => {
  for (const reverse of [false, true]) {
    const data = fixture();
    const first = {
      ...data.tenantDirectoryV202[0], email: 'first@example.com', civilId: '111122223333',
    };
    const second = {
      ...data.tenantDirectoryV202[0], email: 'second@example.com', civilId: '999988887777',
    };
    data.tenantDirectoryV202 = reverse ? [second, first, ...data.tenantDirectoryV202.slice(1)]
      : [first, second, ...data.tenantDirectoryV202.slice(1)];

    const runtime = loadRuntime(data, [], activeRuntimeWindow());
    const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
    const records = runtime.unitDirectoryRecords(context, '2026-08');
    const contractRecord = records.find((entry) => entry.contractId === 'contract-a');

    assert.equal(new Set(records.map((entry) => entry.key)).size, records.length);
    assert.equal(contractRecord.hasDirectory, false);
    assert.equal(contractRecord.email, '');
    assert.equal(contractRecord.civilId, '');
    assert.equal(records.some((entry) => ['first@example.com', 'second@example.com'].includes(entry.email)), false);
    assert.equal(records.some((entry) => entry.unit === 'A' && ['111122223333', '999988887777'].includes(entry.civilId)), false);
  }
});

test('V206.1 quarantines a same-receipt collision from another scope', () => {
  const data = fixture();
  data.collections.push([
    'R-A-PENDING', 'TEST TENANT', '999.000', 'مدفوع',
    'OTHER TEST PROPERTY', '2026-09-01', 'B', 'cross-scope collision', '2026-09', 'KNET',
  ]);

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');

  assert.equal(record.paid, 40);
  assert.equal(record.pending, 0);
  assert.equal(record.receipts.includes('R-A-PENDING'), false);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
});

test('V206.1 quarantines a collection row that contradicts its ledger transaction', () => {
  const data = fixture();
  data.collections.push([
    'R-A-PAID', 'TEST TENANT', 999, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-12', 'A', 'August 2026 rent — KNET operation: 012345', '2026-08', 'KNET',
  ]);

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');

  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'R-A-PAID'), false);
  assert.equal(context.propertyCollections.some((row) => row[0] === 'R-A-PAID'), false);
  assert.equal(record.paid, 0);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 0);
});

test('V206.1 rejects a payment whose composite key contradicts its contract fields', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'forged-payment-key', receiptNo: 'FORGED-KEY',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 777, paid: 777, paidAt: '2026-08-22', status: 'paid',
    source: 'synthetic-test-import', paymentKey: 'synthetic test property|contract:evil|unit:a|2026-09',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const statement = runtime.rentStatementItems(context, '2026-08').find((entry) => entry.contractId === 'contract-a');

  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'FORGED-KEY'), false);
  assert.equal(record.paid, 40);
  assert.equal(statement.paid, 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  runtime.setActiveTenantStatementKey(record.key);
  assert.equal(runtime.openTenantReceipt(null, 'FORGED-KEY', '2026-08'), false);
});

test('V206.1 counts an identical synchronized payment row only once', () => {
  const data = fixture();
  const duplicate = { ...data.rentLedgerV202.find((entry) => entry.id === 'ledger-paid-a') };
  data.rentLedgerV202.push(duplicate);

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const statement = runtime.rentStatementItems(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');

  assert.equal(context.propertyLedger.filter((entry) => entry.id === 'ledger-paid-a').length, 1);
  assert.equal(record.paid, 40);
  assert.equal(statement.paid, 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08');
  const recordIndex = records.findIndex((entry) => entry.contractId === 'contract-a');
  assert.doesNotMatch(runtime.unitsPanel(context, '2026-08', true), new RegExp(`data-v202-unit-receipt="${recordIndex}"`));
  const collectionRows = runtime.collectionsPanel(context).match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const duplicateReceiptRow = collectionRows.find((row) => row.includes('R-A-PAID')) || '';
  assert.ok(duplicateReceiptRow);
  assert.doesNotMatch(duplicateReceiptRow, /data-v202-receipt-index=/);
  assert.match(duplicateReceiptRow, /Receipt review required/);
  assert.equal(runtime.resolvedTenantReceipt([
    'R-A-PAID', 'TEST TENANT', 40, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-12', 'A', '', '2026-08', 'KNET',
  ]), null, 'raw duplicate provenance blocks a legal receipt without double-counting money');
});

test('V206.1 excludes conflicting synchronized rows with the same transaction id', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    ...data.rentLedgerV202.find((entry) => entry.id === 'ledger-paid-a'),
    receiptNo: 'R-CONFLICT', paid: 999,
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const statement = runtime.rentStatementItems(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');

  assert.equal(context.propertyLedger.some((entry) => entry.id === 'ledger-paid-a'), false);
  assert.equal(record.paid, 0);
  assert.equal(statement.paid, 0);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 0);
});

test('V206.1 rejects conflicting contracts that reuse one contract id', () => {
  const data = fixture();
  data.contractsV202 = [
    {
      id: 'DUP', contract_no: 'DUP-A', tenant: 'ALICE', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      rent: 100, status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31', source: 'protected-rent-import-v202',
    },
    {
      id: 'DUP', contract_no: 'DUP-B', tenant: 'BOB', property: 'SYNTHETIC TEST PROPERTY', unit: 'B',
      rent: 200, status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31', source: 'protected-rent-import-v202',
    },
  ];
  data.tenantDirectoryV202 = [];
  data.rentLedgerV202 = [{
    id: 'dup-contract-payment', receiptNo: 'DUP-B-PAID', property: 'SYNTHETIC TEST PROPERTY', unit: 'B',
    tenant: 'BOB', contractId: 'DUP', period: '2026-08', due: 200, paid: 200,
    paidAt: '2026-08-10', status: 'paid', source: 'protected-rent-import-v202',
  }];

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const statement = runtime.rentStatementItems(context, '2026-08');
  const records = runtime.unitDirectoryRecords(context, '2026-08');

  assert.equal(context.propertyContracts.length, 0);
  assert.deepEqual(Array.from(statement), []);
  assert.equal(records.some((entry) => entry.hasContract), false);
  assert.equal(records.reduce((sum,entry) => sum + entry.paid, 0), 0);
});

test('V206.1 fails closed for legacy payments ambiguous across simultaneous contracts', () => {
  const data = fixture();
  data.contractsV202.push({
    id: 'contract-a-second-party-match', contract_no: 'SECOND-SAME-PARTY', tenant: 'TEST TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 75, status: 'signed',
    start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  });
  data.rentLedgerV202.push({
    id: 'ambiguous-legacy-payment', receiptNo: 'R-LEGACY',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
    period: '2026-08', due: 25, paid: 25, paidAt: '2026-08-19',
    status: 'paid', source: 'synthetic-test-import',
  });
  data.rentLedgerV202.push({
    id: 'ambiguous-keyed-payment', receiptNo: 'R-LEGACY-KEYED',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
    period: '2026-08', due: 35, paid: 35, paidAt: '2026-08-20',
    status: 'paid', source: 'synthetic-test-import',
    paymentKey: 'synthetic test property|contract:contract-a|unit:a|2026-08',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08')
    .filter((entry) => ['contract-a', 'contract-a-second-party-match'].includes(entry.contractId));
  const originalContract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const secondContract = context.propertyContracts.find((entry) => entry.id === 'contract-a-second-party-match');

  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.receipts.includes('R-LEGACY'), false);
    assert.equal(record.receipts.includes('R-LEGACY-KEYED'), false);
    assert.equal(Array.from(runtime.tenantLedgerEntries(context, record, '2026-08')).some((entry) => entry.receiptNo === 'R-LEGACY'), false);
    assert.equal(Array.from(runtime.tenantLedgerEntries(context, record, '2026-08')).some((entry) => entry.receiptNo === 'R-LEGACY-KEYED'), false);
  }
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', originalContract, '2026-08'), 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', secondContract, '2026-08'), 0);
});

test('V206.1 quarantines explicit-contract payments with incomplete party identity', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'partial-identity-payment', receiptNo: 'R-PARTIAL-IDENTITY',
    property: 'SYNTHETIC TEST PROPERTY', unit: '', tenant: '', contractId: 'contract-a',
    period: '2026-08', due: 100, paid: 999, paidAt: '2026-08-25',
    status: 'paid', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const statement = runtime.rentStatementItems(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const reviewRow = context.propertyCollections.find((row) => row[0] === 'R-PARTIAL-IDENTITY');

  assert.equal(statement.paid, 40);
  assert.equal(record.paid, 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  assert.equal(runtime.tenantLedgerEntries(context, record, '2026-08').some((entry) => entry.id === 'partial-identity-payment'), false);
  assert.ok(reviewRow, 'the orphan remains visible for reconciliation');
  assert.equal(reviewRow[3], 'يحتاج مراجعة');
  assert.equal(runtime.collectionReceiptEligible(reviewRow), false);
  assert.equal(runtime.openTenantReceipt(null, 'R-PARTIAL-IDENTITY', '2026-08'), false);
});

test('V206.1 rejects an explicit contract number that contradicts the resolved contract', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'conflicting-contract-number', receiptNo: 'R-CONTRACT-NO-CONFLICT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
    contractId: 'contract-a', contractNo: 'OLD-1', period: '2026-08', due: 100, paid: 333,
    paidAt: '2026-08-25', status: 'paid', source: 'synthetic-test-import',
    paymentKey: 'synthetic test property|contract:contract-a|unit:a|2026-08',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');

  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'R-CONTRACT-NO-CONFLICT'), false);
  assert.equal(context.propertyCollections.some((row) => row[0] === 'R-CONTRACT-NO-CONFLICT'), false);
  assert.equal(record.paid, 40);
  assert.equal(record.receipts.includes('R-CONTRACT-NO-CONFLICT'), false);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
});

test('V206.1 rejects conflicting camelCase and snake_case contract aliases', () => {
  const data = fixture();
  const base = {
    id: 'alias-collision-id', receiptNo: 'R-ALIAS-COLLISION', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', period: '2026-08', due: 100, paid: 333,
    paidAt: '2026-08-25', status: 'paid', source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...base, contract_id: 'contract-a' },
    { ...base, contract_id: 'contract-b' },
    {
      ...base, id: 'self-conflicting-aliases', receiptNo: 'R-SELF-ALIAS-CONFLICT', paid: 444,
      contractId: 'contract-a', contract_id: 'contract-b',
    },
  );

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const selfConflict = context.propertyCollections.find((row) => row[0] === 'R-SELF-ALIAS-CONFLICT');

  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'R-ALIAS-COLLISION'), false);
  assert.equal(record.paid, 40);
  assert.equal(record.receipts.some((reference) => /ALIAS-CONFLICT/.test(reference)), false);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  assert.ok(selfConflict);
  assert.equal(runtime.collectionReceiptEligible(selfConflict), false);
});

test('V206.1 quarantines payments outside the resolved contract term', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'out-of-term-payment', receiptNo: 'R-OUT-OF-TERM',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2027-01', due: 100, paid: 25, paidAt: '2027-01-05',
    status: 'paid', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2027-01').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const reviewRow = context.propertyCollections.find((row) => row[0] === 'R-OUT-OF-TERM');

  assert.equal(record.rent, 0);
  assert.equal(record.paid, 0);
  assert.equal(record.receipts.includes('R-OUT-OF-TERM'), false);
  assert.deepEqual(Array.from(runtime.tenantLedgerEntries(context, record, '2027-01')), []);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2027-01'), 0);
  assert.ok(reviewRow);
  assert.equal(runtime.collectionReceiptEligible(reviewRow), false);
  runtime.setActiveTenantStatementKey(record.key);
  assert.equal(runtime.openTenantReceipt(null, 'R-OUT-OF-TERM', '2027-01'), false);
});

test('V206.1 rejects malformed, zero, and negative ledger amounts everywhere', () => {
  const data = fixture();
  for (const [id, receiptNo, paid] of [
    ['malformed-amount', 'R-MALFORMED-AMOUNT', '250xyz'],
    ['zero-amount', 'R-ZERO-AMOUNT', 0],
    ['negative-amount', 'R-NEGATIVE-AMOUNT', -10],
  ]) {
    data.rentLedgerV202.push({
      id, receiptNo, property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
      contractId: 'contract-a', period: '2026-08', due: 100, paid,
      paidAt: '2026-08-25', status: 'paid', source: 'synthetic-test-import',
    });
  }

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const invalidReferences = ['R-MALFORMED-AMOUNT', 'R-ZERO-AMOUNT', 'R-NEGATIVE-AMOUNT'];

  assert.equal(context.propertyLedger.some((entry) => invalidReferences.includes(entry.receiptNo)), false);
  assert.equal(context.propertyCollections.some((row) => invalidReferences.includes(row[0])), false);
  assert.equal(record.paid, 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  for (const reference of invalidReferences) assert.equal(runtime.openTenantReceipt(null, reference, '2026-08'), false);
});

test('V206.1 never promotes a missing payment status to settled', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'missing-status', receiptNo: 'R-MISSING-STATUS', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
    due: 100, paid: 444, paidAt: '2026-08-25', status: '', source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const row = context.propertyCollections.find((entry) => entry[0] === 'R-MISSING-STATUS');

  assert.equal(record.paid, 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  assert.ok(row);
  assert.equal(row[3], 'يحتاج مراجعة');
  assert.equal(runtime.collectionReceiptEligible(row), false);
});

test('V206.1 deduplicates identical references and rejects conflicting reference reuse', () => {
  const data = fixture();
  const base = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paidAt: '2026-08-26', method: 'KNET', status: 'paid',
    source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...base, id: 'conflicting-reference-a', receiptNo: 'R-DUPLICATE-CONFLICT', paid: 30 },
    { ...base, id: 'conflicting-reference-b', receiptNo: 'R-DUPLICATE-CONFLICT', paid: 70 },
    { ...base, id: 'identical-reference-a', voucherNo: 'V-DUPLICATE-IDENTICAL', paid: 10 },
    { ...base, id: 'identical-reference-b', voucherNo: 'V-DUPLICATE-IDENTICAL', paid: 10 },
    { ...base, id: 'alternate-reference-a', receiptNo: 'R-SHARED-WITH-ALTERNATES', voucherNo: 'V-ALTERNATE-A', paid: 11 },
    { ...base, id: 'alternate-reference-b', receiptNo: 'R-SHARED-WITH-ALTERNATES', voucherNo: 'V-ALTERNATE-B', paid: 11 },
  );

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const entries = runtime.tenantLedgerEntries(context, record, '2026-08');

  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'R-DUPLICATE-CONFLICT'), false);
  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'R-SHARED-WITH-ALTERNATES'), false);
  assert.equal(entries.filter((entry) => entry.voucherNo === 'V-DUPLICATE-IDENTICAL').length, 1);
  assert.equal(context.propertyCollections.filter((row) => row[0] === 'V-DUPLICATE-IDENTICAL').length, 1);
  assert.equal(record.paid, 50);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 50);
});

test('V206.1 keeps unidentifiable no-reference payments out of financial totals', () => {
  const data = fixture();
  const bare = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paid: 17, paidAt: '2026-08-26', status: 'paid',
    source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push({ ...bare }, { ...bare }, { ...bare, id: 'ID-ONLY-NO-RECEIPT', paid: 19 });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const noReferenceRows = context.propertyCollections.filter((row) => row[0] === '—');

  assert.equal(record.paid, 40);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 40);
  assert.equal(context.propertyLedger.some((entry) => entry.id === 'ID-ONLY-NO-RECEIPT'), true, 'id-only rows remain visible for review');
  assert.equal(noReferenceRows.length >= 1, true, 'unidentifiable rows remain visible for reconciliation');
  assert.equal(noReferenceRows.every((row) => runtime.collectionReceiptEligible(row) === false), true);
});

test('V206.1 canonicalizes transaction ids, reference positions, case, whitespace, and digit scripts', () => {
  const data = fixture();
  const base = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paidAt: '2026-08-26', status: 'paid', source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...base, receiptNo: 'R-POSITION', paid: 9 },
    { ...base, voucherNo: ' r-position ', paid: 9 },
    { ...base, id: ' CASE-ID ', receiptNo: ' Ref-Case ', paid: 8 },
    { ...base, id: 'case-id', receiptNo: 'ref-case', paid: 8 },
    { ...base, id: 'digits-a', receiptNo: 'R-123', paid: 7 },
    { ...base, id: 'digits-b', receiptNo: 'R-١٢٣', paid: 7 },
    { ...base, id: 'digits-c', receiptNo: 'R-۱۲۳', paid: 7 },
    { ...base, id: 'CHAIN-ID', receiptNo: 'R-CHAIN-TAINTED', paid: 12 },
    { ...base, id: ' chain-id ', receiptNo: 'R-CHAIN-TAINTED', paid: 13 },
    { ...base, id: 'chain-third', receiptNo: 'R-CHAIN-TAINTED', paid: 13 },
  );

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');

  assert.equal(context.propertyLedger.filter((entry) => /position/i.test(entry.receiptNo || entry.voucherNo || '')).length, 1);
  assert.equal(context.propertyLedger.filter((entry) => /ref-case/i.test(entry.receiptNo || '')).length, 1);
  assert.equal(context.propertyLedger.filter((entry) => /^R-[1١۱]23$/.test(entry.receiptNo || '')).length, 1);
  assert.equal(context.propertyLedger.some((entry) => /CHAIN-TAINTED/i.test(entry.receiptNo || '')), false);
  assert.equal(record.paid, 64);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 64);
});

test('V206.1 reserves voucher-only references when generating the next receipt number', () => {
  const data = fixture();
  const year = new Date().getFullYear();
  const reserved = `AQ-R-${year}-0001`;
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const localizedReserved = reserved.replace(/\d/g, (digit) => arabicDigits[Number(digit)]);
  data.rentLedgerV202.push({
    id: 'voucher-number-reservation', receiptNo: '', voucherNo: localizedReserved,
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paid: 1, paidAt: '2026-08-27', status: 'paid',
    source: 'synthetic-test-import',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  assert.equal(runtime.receiptExists(reserved), true);
  assert.equal(runtime.receiptExists(localizedReserved), true);
  assert.equal(runtime.nextReceiptNumber(), `AQ-R-${year}-0002`);
});

test('V267 confirms the canonical payment in cloud storage before exposing it locally and reloading', async () => {
  const data = fixture();
  const elements = {
    v202PaymentContract: { value: 'contract-a' },
    v202PaymentNumber: { value: 'R-SAVE-RELOAD' },
    v202PaymentAmount: { value: '15' },
    v202PaymentStatus: { value: 'قيد المراجعة' },
    v202PaymentPeriod: { value: '2026-08' },
    v202PaymentDate: { value: '2026-08-28' },
    v202PaymentMethod: { value: 'KNET' },
    v202PaymentNote: { value: 'roundtrip test' },
    v202PaymentError: { textContent: '' },
  };
  let persisted = 0;
  let cloud=JSON.parse(JSON.stringify(data));
  const runtimeWindow=activeRuntimeWindow();
  runtimeWindow.AQARI_CLOUD_SYNC={decodeCloudPayload:payload=>({primary:payload})};
  runtimeWindow.AQARI_SUPABASE.loadAppState=async()=>({payload:JSON.parse(JSON.stringify(cloud)),revision:1});
  runtimeWindow.AQARI_SUPABASE.saveAppState=async(payload)=>{cloud=JSON.parse(JSON.stringify(payload));return {revision:2}};
  const writer = loadRuntime(data, [], runtimeWindow, {
    elements,
    persist() { persisted += 1; },
  });
  writer.setActiveProperty('SYNTHETIC TEST PROPERTY');

  assert.equal(await writer.savePayment({ preventDefault() {} }), true);
  assert.ok(cloud.collections.some(row=>row[0]==='R-SAVE-RELOAD'));
  assert.equal(persisted, 1);
  const savedCollection = data.collections.find((row) => row[0] === 'R-SAVE-RELOAD');
  assert.ok(savedCollection);
  assert.equal(savedCollection.length, 10);
  assert.equal(savedCollection[2], 15);

  const reader = loadRuntime(JSON.parse(JSON.stringify(cloud)), [], activeRuntimeWindow());
  const context = reader.contextFor('SYNTHETIC TEST PROPERTY');
  const record = reader.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  assert.equal(context.propertyLedger.some((entry) => entry.receiptNo === 'R-SAVE-RELOAD'), true);
  assert.equal(record.paid, 40);
  assert.equal(record.pending, 35);
});

test('V206.1 safely reloads the prior four-column local payment format', () => {
  const data = fixture();
  data.collections.push(['R-LEGACY-RELOAD', 'TEST TENANT', '١٥ د.ك', 'مدفوع']);
  data.rentLedgerV202.push({
    id: 'legacy-reload', receiptNo: 'R-LEGACY-RELOAD', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
    due: 100, paid: 15, paidAt: '2026-08-27', status: 'مدفوع', source: 'v202-entry',
    paymentKey: 'synthetic test property|contract:contract-a|unit:a|2026-08',
  });

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const row = context.propertyCollections.find((entry) => entry[0] === 'R-LEGACY-RELOAD');

  assert.equal(context.propertyLedger.filter((entry) => entry.receiptNo === 'R-LEGACY-RELOAD').length, 1);
  assert.equal(context.propertyCollections.filter((entry) => entry[0] === 'R-LEGACY-RELOAD').length, 1);
  assert.equal(record.paid, 55);
  assert.ok(row);
  assert.equal(runtime.collectionReceiptEligible(row), true);
});

test('V206.1 access requires membership identities to match the active user and workspace', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /AQARI_DATA_GATE\?\.scope/);
  assert.match(source, /AQARI_EARLY_STORAGE_GATE\?\.scope/);
  assert.match(source, /refreshContext\(refreshAccess\)/);
  assert.match(source, /loadAppState\(requestScope\)/);
  const exact = activeRuntimeWindow();
  assert.equal(loadRuntime(fixture(), [], exact).protectedAccessReady(), true);
  const wrongDataGate = activeRuntimeWindow();
  wrongDataGate.AQARI_DATA_GATE = { scope:{ userId:'user-test', workspaceId:'workspace-other' } };
  assert.equal(loadRuntime(fixture(), [], wrongDataGate).protectedAccessReady(), false);
  const wrongStorageGate = activeRuntimeWindow();
  wrongStorageGate.AQARI_EARLY_STORAGE_GATE = { scope:{ userId:'user-other', workspaceId:'workspace-test' } };
  assert.equal(loadRuntime(fixture(), [], wrongStorageGate).protectedAccessReady(), false);
  const partial = {
    AQARI_SUPABASE: {
      context: {
        user: { id: 'user-test' }, membership: { is_active: true }, workspace: { id: 'workspace-test' },
      },
    },
  };
  assert.equal(loadRuntime(fixture(), [], partial).protectedAccessReady(), false);

  for (const mutate of [
    (context) => { context.user.id = 'user-test\uFEFF'; },
    (context) => { context.user.id = ['user-test']; },
    (context) => { context.workspace.id = 'workspace-test\u2028'; },
    (context) => { context.workspace.id = ['workspace-test']; },
    (context) => { context.membership.user_id = ['user-test']; },
    (context) => { context.membership.workspace_id = ['workspace-test']; },
  ]) {
    const invalid = activeRuntimeWindow();
    mutate(invalid.AQARI_SUPABASE.context);
    assert.equal(loadRuntime(fixture(), [], invalid).protectedAccessReady(), false);
  }
});

test('V206.1 collection receipts are settled-only', () => {
  const data = fixture();
  data.collections.push(
    ['R-RAW-MALFORMED', 'TEST TENANT', '250xyz', 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-20', 'A', '', '2026-08', 'KNET'],
    ['R-RAW-ZERO', 'TEST TENANT', 0, 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-20', 'A', '', '2026-08', 'KNET'],
    ['R-RAW-NEGATIVE', 'TEST TENANT', -10, 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-20', 'A', '', '2026-08', 'KNET'],
    ['R-FORGED-LINKED-MARKER', 'TEST TENANT', '250xyz', 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-20', 'A', '', '2026-08', 'KNET', true],
    ['R-LEGACY-CURRENCY', 'TEST TENANT', '٤٠ د.ك', 'مدفوع'],
    ['R-LEGACY-DUP', 'TEST TENANT', 10, 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-29', 'A', '', '2026-08', 'KNET'],
    ['R-LEGACY-DUP', 'TEST TENANT', 20, 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-30', 'A', '', '2026-08', 'KNET'],
    ['R-RAW-ORPHAN', 'ORPHAN RAW', 500, 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-30', 'Z', '', '2026-08', 'KNET'],
  );
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const html = runtime.collectionsPanel(context);
  const tableRows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const paidRow = tableRows.find((row) => row.includes('R-A-PAID')) || '';
  const pendingRow = tableRows.find((row) => row.includes('R-A-PENDING')) || '';

  assert.equal(runtime.collectionReceiptEligible(['R-1', 'TENANT', 40, 'مدفوع']), true);
  assert.equal(runtime.collectionReceiptEligible(['R-2', 'TENANT', '40.000', 'جزئي']), true);
  assert.equal(runtime.collectionReceiptEligible(['R-2B', 'TENANT', '٤٠ د.ك', 'مدفوع']), true);
  assert.equal(runtime.collectionReceiptEligible(['R-3', 'TENANT', 40, 'قيد المراجعة']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-4', 'TENANT', 40, 'rejected']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-5', 'TENANT', 40, 'مدفوع جزئي - مرفوض']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-6', 'TENANT', 40, 'paid - rejected']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-7', 'TENANT', '250xyz', 'مدفوع']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-8', 'TENANT', 0, 'مدفوع']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-9', 'TENANT', -10, 'مدفوع']), false);
  assert.equal(runtime.collectionReceiptEligible(['R-10', 'TENANT', '250xyz', 'مدفوع', '', '', '', '', '', '', true]), false);
  assert.match(paidRow, /data-v202-receipt-index=/);
  assert.doesNotMatch(pendingRow, /data-v202-receipt-index=/);
  assert.match(pendingRow, /بانتظار الاعتماد/);
  assert.equal(context.propertyCollections.some((row) => row[0] === 'R-LEGACY-DUP'), false);
  const ambiguousLegacy = context.propertyCollections.find((row) => row[0] === 'R-LEGACY-CURRENCY');
  const orphanRaw = context.propertyCollections.find((row) => row[0] === 'R-RAW-ORPHAN');
  assert.ok(ambiguousLegacy && orphanRaw);
  assert.equal(ambiguousLegacy[3], 'يحتاج مراجعة');
  assert.equal(orphanRaw[3], 'يحتاج مراجعة');
  assert.equal(runtime.collectionReceiptEligible(ambiguousLegacy), false);
  assert.equal(runtime.collectionReceiptEligible(orphanRaw), false);
  assert.equal(settledCollectionTotal(context), 90, 'ambiguous, orphaned, and malformed raw collections do not count');
  assert.equal(runtime.openReceiptDocument(['R-PENDING', 'TENANT', 40, 'قيد المراجعة']), false);
  const resolved = runtime.resolvedTenantReceipt([
    'R-A-PAID', 'TEST TENANT', 40, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-12', 'A', '', '2026-08', 'KNET',
  ]);
  assert.ok(resolved);
  assert.match(runtime.tenantReceiptDocument(resolved.context, resolved.record, resolved.entry, resolved.period), /RENT RECEIPT/);
  assert.equal(runtime.resolvedTenantReceipt([
    'R-A-PAID', 'TEST TENANT', 40, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-99-99', 'A', '', '2026-08', 'KNET',
  ]), null);
  assert.match(runtime.receiptDocument([
    'LEGACY-1', 'LEGACY TENANT', 123.5, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-20', 'L1', 'Legacy rent', '2026-08', 'Cash',
  ]), /RENT RECEIPT/);
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
    occupiedUnitCount: 29,
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
  assert.equal(model.occupiedUnitCount, 29);
  assert.equal(model.vacantUnitCount, 2);
  assert.equal(model.sourcePages, '1–31');
  assert.equal(model.collectionRate, 1234 / 9999 * 100);

  const html = runtime.propertyRentLedgerDocument(context, '2026-08');
  assert.match(html, /الوحدات \/ UNITS<\/span><strong>31<\/strong>/);
  assert.match(html, /29 وحدة مرتبطة\/مشغولة/);
  assert.match(html, /2 وحدات شاغرة/);
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

test('V206.1 CSV carries authoritative totals, occupancy, and reconciliation metadata', () => {
  const data = fixture();
  data.rentStatementsV202 = [{
    id: 'official-csv', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    totalRent: 700, totalCollected: 90, totalAdvance: 321, totalInsurance: 654,
    totalCleaning: 87, unitCount: 6, occupiedUnitCount: 4, sourcePages: '2–31',
    source: 'synthetic-test-import',
  }];
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const model = runtime.propertyRentLedgerModel(runtime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08');
  const csv = runtime.propertyRentLedgerCsv(model);
  for (const value of [
    'STATEMENT METADATA', 'Official due', 'Official collected', 'Total advance',
    'Total insurance', 'Total cleaning', 'Occupied units', 'Vacant units',
    'Source pages', 'Official totals are authoritative', '2–31',
  ]) assert.match(csv, new RegExp(value, 'i'));
  assert.match(csv, /"700"/);
  assert.match(csv, /"90"/);
  assert.match(csv, /"4"/);
  assert.match(csv, /"2"/);
});

test('V206.1 contract acknowledgements never become rent receipts', () => {
  const data = fixture();
  const directory = data.tenantDirectoryV202.find((record) => record.unit === 'A');
  directory.contractReceipt = 'CONTRACT-ACK-ONLY';
  directory.contractReceived = '';
  data.rentLedgerV202 = data.rentLedgerV202.filter((entry) => (
    entry.contractId !== 'contract-a' && entry.unit !== 'A'
  ));

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
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
  const collectionRow = context.propertyCollections.find((row) => row[0] === 'VOUCHER-ONLY-42');
  assert.ok(collectionRow);
  assert.equal(runtime.collectionReceiptEligible(collectionRow), true);
  assert.match(runtime.collectionsPanel(context), /VOUCHER-ONLY-42/);

  const unitHtml = runtime.unitsPanel(context, '2026-08', true);
  const unitRows = unitHtml.match(/<article[\s\S]*?<\/article>/g) || [];
  const unitCard = unitRows.find((row) => row.includes('TEST TENANT') && row.includes('DUPLICATE-TEST')) || '';
  assert.match(unitCard, /data-v202-unit-receipt="0"/);
  assert.doesNotMatch(unitCard, /PENDING-RECEIPT-9|PENDING-VOUCHER-9/);

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

test('official protected statements respect contract dates instead of expanding imported rows', () => {
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
    ['contract-a', 'contract-b'],
    'an official statement must not pull an imported contract from outside its legal term',
  );
  assert.equal(data.contractsV202.find((contract) => contract.id === 'contract-expired').end_date, '2026-07-31');
  assert.equal(runtime.latestOfficialPeriod('SYNTHETIC TEST PROPERTY'), '2026-08');
});

test('V206.1 assigns a legacy historical payment to the contract that covers its period', () => {
  const data = fixture();
  data.contractsV202 = [
    {
      id: 'lease-old', contract_no: 'OLD-MAY', tenant: 'SAME TENANT',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 200, status: 'expired',
      start_date: '2026-01-01', end_date: '2026-06-30', source: 'protected-rent-import-v202',
    },
    {
      id: 'lease-new', contract_no: 'NEW-JULY', tenant: 'SAME TENANT',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 120, status: 'signed',
      start_date: '2026-07-01', end_date: '2027-06-30', source: 'protected-rent-import-v202',
    },
  ];
  data.tenantDirectoryV202 = [];
  data.rentLedgerV202 = [{
    id: 'legacy-may-payment', receiptNo: 'R-MAY-OLD',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'SAME TENANT',
    period: '2026-05', due: 100, paid: 100, paidAt: '2026-05-05',
    status: 'paid', source: 'protected-rent-import-v202',
  }];
  data.rentStatementsV202 = [{
    id: 'official-may', property: 'SYNTHETIC TEST PROPERTY', period: '2026-05',
    totalRent: 100, totalCollected: 100, source: 'protected-rent-import-v202',
  }];

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const statement = runtime.rentStatementItems(context, '2026-05');
  const records = runtime.unitDirectoryRecords(context, '2026-05');
  const oldRecord = records.find((entry) => entry.contractId === 'lease-old');
  const newRecord = records.find((entry) => entry.contractId === 'lease-new');
  const oldContract = context.propertyContracts.find((entry) => entry.id === 'lease-old');
  const newContract = context.propertyContracts.find((entry) => entry.id === 'lease-new');

  assert.deepEqual(Array.from(statement, (item) => item.contractId), ['lease-old']);
  assert.deepEqual(Array.from(runtime.tenantLedgerEntries(context, oldRecord, '2026-05'), (entry) => entry.receiptNo), ['R-MAY-OLD']);
  assert.deepEqual(Array.from(runtime.tenantLedgerEntries(context, newRecord, '2026-05')), []);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', oldContract, '2026-05'), 100);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', newContract, '2026-05'), 0);
  assert.equal(statement[0].due, 100, 'historical statements use the recorded due snapshot, not the current contract rent');
  assert.equal(oldRecord.rent, 100);
  assert.equal(oldRecord.balance, 0);
  assert.equal(oldRecord.paymentStatus, 'مسدد');
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

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
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
    'victim@example.test?bcc=attacker@example.test', 'victim@example.test&bcc=attacker@example.test',
    'victim@example.test#fragment', 'victim%40example.test@example.test',
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
  const commandCenterHref = runtime.tenantMailto({ ...selected, rent: undefined, due: 100 }, '2026-08');
  const commandCenterMail = decodeURIComponent(commandCenterHref.replace(/\+/g, ' '));
  assert.match(commandCenterMail, /(?:المستحق|Due):?[^\n]*?(?:100|١٠٠)/i, 'command-center reminders must use due when rent is absent');
  assert.doesNotMatch(commandCenterMail, /المستحق:\s*٠(?:\D|$)|Due:\s*0(?:\D|$)/im, 'a real due amount must never be sent as zero');
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
      context: { user: { id: 'user-test' }, membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' }, workspace: { id: 'workspace-test' } },
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
    ['contract-a', 'contract-b'],
    'the integrated ledger must use protected in-memory data without billing contracts outside the selected period',
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

test('V206.1 paid totals never fall back to same-name local data during a protected session', async () => {
  const local = fixture();
  const remote = fixture();
  for (const key of ['contractsV202', 'tenantDirectoryV202']) {
    for (const record of remote[key]) record.source = 'protected-rent-import-v202';
  }
  remote.rentLedgerV202 = [];
  remote.rentStatementsV202 = [];
  const runtimeWindow = {
    AQARI_SUPABASE: {
      context: { user: { id: 'user-test' }, membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' }, workspace: { id: 'workspace-test' } },
      async loadAppState() { return { payload: remote }; },
    },
  };
  const runtime = loadRuntime(local, [], runtimeWindow);

  assert.equal(await runtime.hydrateProtectedImport(), true);
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const contract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  assert.equal(context.propertyLedger.length, 0);
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 0);
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
  const context = { user: { id: 'user-test' }, membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' }, workspace: { id: 'workspace-test' } };
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

test('V266 protected hydration waits for the central ready boundary and exact user scope', async () => {
  const authClasses = new Set();
  const listeners = new Map();
  const timers = [];
  let loads = 0;
  const runtimeWindow = activeRuntimeWindow();
  runtimeWindow.addEventListener = (type, listener) => { listeners.set(type, listener); };
  runtimeWindow.AQARI_SUPABASE.loadAppState = async () => {
    loads += 1;
    return { payload: protectedRemote('SYNTHETIC READY PROPERTY') };
  };
  const local = fixture();
  local.properties = [];
  const runtime = loadRuntime(local, [], runtimeWindow, {
    authClasses,
    setTimeout(callback) { timers.push(callback); },
  });

  runtime.installHydrateBoundaryListener();
  assert.equal(typeof listeners.get('aqari:auth-boundary'), 'function');
  assert.equal(runtime.protectedHydrationReady('user-test'), false);
  assert.equal(await runtime.hydrateProtectedImport('user-test'), false);
  assert.equal(loads, 0, 'no protected request may start while the central boundary is locked');

  listeners.get('aqari:auth-boundary')({ detail: { state: 'ready' } });
  assert.equal(timers.length, 0, 'a ready signal without the unlocked boundary must fail closed');

  authClasses.add('aqari-auth-unlocked');
  listeners.get('aqari:auth-boundary')({ detail: { state: 'ready' } });
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.equal(await runtime.hydrateProtectedImport('user-test'), true);
  assert.equal(loads, 1);
  assert.equal(await runtime.hydrateProtectedImport('user-other'), false);
  assert.equal(loads, 1, 'a different user cannot reuse the ready workspace boundary');
});

test('V266 seal preserves the in-flight hydration promise and serializes the retry', async () => {
  const remote = protectedRemote('SYNTHETIC SERIAL PROPERTY');
  let resolveFirst;
  let loads = 0;
  const runtimeWindow = activeRuntimeWindow();
  runtimeWindow.AQARI_SUPABASE.loadAppState = () => {
    loads += 1;
    if(loads === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return Promise.resolve({ payload: remote });
  };
  const runtime = loadRuntime({ ...fixture(), properties: [] }, [], runtimeWindow);
  const first = runtime.hydrateProtectedImport('user-test');
  await Promise.resolve();

  runtime.sealProtectedImport();
  const retry = runtime.hydrateProtectedImport('user-test');
  assert.equal(loads, 1, 'seal must not permit a parallel protected hydration');

  resolveFirst({ payload: remote });
  assert.equal(await first, false, 'the sealed response remains stale');
  assert.equal(await retry, true, 'the queued retry runs after the stale flight settles');
  assert.equal(loads, 2);
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
  local.rentStatementsV202 = [{
    id: 'local-collision-statement', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08',
    totalRent: 7777, totalCollected: 777, source: 'v202-entry',
  }];
  local.collections = [['LOCAL-LEGACY-RECEIPT', 'LOCAL COLLISION TENANT', '777', 'مدفوع', 'SYNTHETIC TEST PROPERTY', '2026-08-16']];
  local.tenants = [['LOCAL COLLISION TENANT', '55509999', 'local@example.test']];
  local.expenses = [['SYNTHETIC TEST PROPERTY', 'LOCAL POISON EXPENSE', '888', 'LOCAL VENDOR']];
  local.workOrders = [['LOCAL-WO', 'SYNTHETIC TEST PROPERTY', 'LOCAL POISON WORK ORDER', 'open']];
  local.maintenance = [['LOCAL', 'LOCAL POISON MAINTENANCE', '999', 'open', 'SYNTHETIC TEST PROPERTY']];
  const before = JSON.stringify(local);
  const bridge = {
    context: { user: { id: 'user-test' }, membership: { is_active: true, user_id: 'user-test', workspace_id: 'workspace-test' }, workspace: { id: 'workspace-test' } },
    async loadAppState() { return { payload: protectedRemote('SYNTHETIC TEST PROPERTY') }; },
  };
  const runtime = loadRuntime(local, [], { AQARI_SUPABASE: bridge });
  assert.equal(await runtime.hydrateProtectedImport('user-test'), true);
  assert.equal(runtime.protectedPropertyActive('SYNTHETIC TEST PROPERTY'), true);
  const protectedContext = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  assert.equal(protectedContext.property[1], 'SYNTHETIC OWNER');
  assert.equal(protectedContext.propertyContracts.some((entry) => entry.id === 'local-collision'), false);
  assert.equal(protectedContext.propertyLedger.some((entry) => entry.id === 'local-collision-payment'), false);
  assert.equal(protectedContext.propertyCollections.some((entry) => entry[0] === 'LOCAL-LEGACY-RECEIPT'), false);
  assert.deepEqual(Array.from(protectedContext.linkedTenants), []);
  assert.deepEqual(Array.from(protectedContext.expenses), []);
  assert.deepEqual(Array.from(protectedContext.maintenance), []);
  assert.equal(runtime.unitDirectoryRecords(protectedContext, '2026-08').some((entry) => entry.unit === 'LOCAL'), false);
  assert.equal(runtime.officialStatementFor('SYNTHETIC TEST PROPERTY', '2026-08').totalRent, 700);
  const protectedModel = runtime.propertyRentLedgerModel(protectedContext, '2026-08');
  assert.equal(protectedModel.official, true);
  assert.deepEqual([protectedModel.totals.due, protectedModel.totals.paid], [700, 90]);
  const protectedRows = runtime.propertyRentLedgerRows(
    protectedContext,
    '2026-08',
  );
  assert.equal(protectedRows.some((row) => row.contractId === 'local-collision'), false);
  assert.equal(protectedRows.some((row) => row.voucherNo === 'LOCAL-COLLISION-RECEIPT'), false);
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  assert.equal(runtime.savePayment({ preventDefault() {} }), false);
  assert.equal(JSON.stringify(local), before, 'same-name local property must not weaken the protected payment boundary');
});

test('V206.1 keeps protected properties read-only across Unicode-compatible names', async () => {
  const asciiName = 'SYNTHETIC TEST PROPERTY';
  const fullwidthName = 'ＳＹＮＴＨＥＴＩＣ ＴＥＳＴ ＰＲＯＰＥＲＴＹ';
  const local = fixture();
  const before = JSON.stringify(local);
  const bridge = {
    context: activeRuntimeWindow().AQARI_SUPABASE.context,
    async loadAppState() { return { payload: protectedRemote(fullwidthName) }; },
  };
  const runtime = loadRuntime(local, [], { AQARI_SUPABASE: bridge });

  assert.equal(await runtime.hydrateProtectedImport('user-test'), true);
  assert.equal(runtime.protectedPropertyActive(asciiName), true);
  assert.equal(runtime.protectedPropertyActive(fullwidthName), true);
  const context = runtime.contextFor(asciiName);
  assert.equal(context.property[1], 'SYNTHETIC OWNER');
  assert.equal(context.propertyContracts.every((entry) => entry.source === 'protected-rent-import-v202'), true);
  const asciiOffice = runtime.secureRentOfficeData(asciiName, '2026-08');
  assert.equal(asciiOffice.property, asciiName, 'the secure API must preserve the caller identity after canonical validation');
  assert.equal(asciiOffice.canRecordPayment, false);
  runtime.setActiveProperty(asciiName);
  assert.equal(runtime.savePayment({ preventDefault() {} }), false);
  assert.equal(JSON.stringify(local), before, 'Unicode-compatible protected names must never open a local write path');
});

test('V206.1 rejects malformed or ambiguous official totals and falls back to canonical detail rows', () => {
  const runtime = loadRuntime(fixture());
  assert.equal(runtime.validOfficialStatement({
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: -1,
  }), false);
  assert.equal(runtime.validOfficialStatement({
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalCollected: 'not-money',
  }), false);
  const countFields = ['unitCount', 'occupiedUnitCount', 'payerCount'];
  const invalidCounts = [true, [1], '1e2', '0x10', '01', '1\uFEFF', -1, 1.5, Number.MAX_SAFE_INTEGER + 1];
  for (const key of countFields) {
    for (const value of invalidCounts) {
      assert.equal(runtime.validOfficialStatement({
        property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 300, [key]: value,
      }), false, `${key} must reject ${JSON.stringify(value)}`);
    }
  }
  assert.equal(runtime.strictCount('٣١'), 31);
  assert.equal(runtime.strictCount('۱۲'), 12);
  assert.equal(runtime.validOfficialStatement({
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 300,
    unitCount: '٣١', occupiedUnitCount: '۲۹', payerCount: '28',
  }), true);
  assert.equal(runtime.validOfficialStatement({
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 300,
    unitCount: 1, occupiedUnitCount: 2,
  }), false, 'occupied units cannot exceed total units');

  const data = fixture();
  data.rentStatementsV202 = [
    { id: 'duplicate-a', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 999, totalCollected: 111 },
    { id: 'duplicate-b', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 888, totalCollected: 222 },
  ];
  const duplicateRuntime = loadRuntime(data);
  const context = duplicateRuntime.contextFor('SYNTHETIC TEST PROPERTY');
  const model = duplicateRuntime.propertyRentLedgerModel(context, '2026-08');
  assert.equal(duplicateRuntime.officialStatementFor('SYNTHETIC TEST PROPERTY', '2026-08'), null);
  assert.equal(model.official, false);
  assert.deepEqual([model.totals.due, model.totals.paid], [300, 90]);

  const impossibleData = fixture();
  impossibleData.rentStatementsV202 = [{
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 999,
    unitCount: 1, occupiedUnitCount: 2,
  }];
  const impossibleRuntime = loadRuntime(impossibleData);
  const impossibleContext = impossibleRuntime.contextFor('SYNTHETIC TEST PROPERTY');
  const impossibleModel = impossibleRuntime.propertyRentLedgerModel(impossibleContext, '2026-08');
  assert.equal(impossibleRuntime.officialStatementFor('SYNTHETIC TEST PROPERTY', '2026-08'), null);
  assert.equal(impossibleModel.official, false);
  assert.equal(impossibleModel.occupiedUnitCount <= impossibleModel.unitCount, true);

  const partialUnitData = fixture();
  partialUnitData.rentStatementsV202 = [{
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 300, unitCount: 1,
  }];
  const partialUnitRuntime = loadRuntime(partialUnitData);
  const partialUnitModel = partialUnitRuntime.propertyRentLedgerModel(
    partialUnitRuntime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08',
  );
  assert.deepEqual(
    [partialUnitModel.unitCount, partialUnitModel.occupiedUnitCount],
    [1, 1],
    'a lone official unit count must constrain the derived occupied count',
  );

  const partialOccupiedData = fixture();
  partialOccupiedData.rentStatementsV202 = [{
    property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 300, occupiedUnitCount: 3,
  }];
  const partialOccupiedRuntime = loadRuntime(partialOccupiedData);
  const partialOccupiedModel = partialOccupiedRuntime.propertyRentLedgerModel(
    partialOccupiedRuntime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08',
  );
  assert.deepEqual(
    [partialOccupiedModel.unitCount, partialOccupiedModel.occupiedUnitCount],
    [3, 3],
    'a lone official occupied count must expand the derived total count',
  );

  for (const invalidUnitCount of [true, [1], '1e2', '0x10', '01', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const invalidProperty = fixture();
    invalidProperty.properties[0][2] = invalidUnitCount;
    assert.equal(loadRuntime(invalidProperty).contextFor('SYNTHETIC TEST PROPERTY').units, 0);
  }
  const localizedProperty = fixture();
  localizedProperty.properties[0][2] = '٣١';
  assert.equal(loadRuntime(localizedProperty).contextFor('SYNTHETIC TEST PROPERTY').units, 31);
});

test('V206.1 public diagnostic APIs fail closed before protected access is ready', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /propertyContext:function\(name\)\{\s*if\(!protectedAccessReady\(\)\)return null;/);
  assert.match(source, /statementItems:function\(name,period\)\{\s*if\(!protectedAccessReady\(\)\)return Object\.freeze\(\[\]\);/);
  assert.match(source, /testContext:function\(name,period\)\{\s*if\(!protectedAccessReady\(\)\)return null;/);
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
  const authClasses = new Set(['aqari-auth-unlocked']);
  const runtimeWindow = { AQARI_SUPABASE: bridge };
  const runtime = loadRuntime(local, [], runtimeWindow, { authClasses });
  const pendingA = runtime.hydrateProtectedImport('user-a');
  await Promise.resolve();

  bridge.context = { user: { id: 'user-b' }, membership: { is_active: true, user_id: 'user-b', workspace_id: 'workspace-b' }, workspace: { id: 'workspace-b' } };
  authClasses.delete('aqari-auth-unlocked');
  runtime.handleProtectedAuthStateChange('SIGNED_IN', { user: { id: 'user-b' } });
  assert.equal(runtime.contextFor('SYNTHETIC SWITCH A'), null, 'old workspace rows must be inaccessible synchronously');
  assert.equal(await runtime.hydrateProtectedImport('user-b'), false, 'new workspace cannot hydrate before the central boundary is ready');

  resolveFirst({ payload: remoteA });
  assert.equal(await pendingA, false);
  runtimeWindow.AQARI_DATA_GATE.scope = { userId: 'user-b', workspaceId: 'workspace-b' };
  runtimeWindow.AQARI_EARLY_STORAGE_GATE.scope = { userId: 'user-b', workspaceId: 'workspace-b' };
  authClasses.add('aqari-auth-unlocked');
  const pendingB = runtime.hydrateProtectedImport('user-b');
  assert.equal(await pendingB, true);
  assert.equal(runtime.contextFor('SYNTHETIC SWITCH A'), null);
  assert.equal(runtime.contextFor('SYNTHETIC SWITCH B').propertyContracts.length, 4);
  assert.equal(loads, 2, 'new user receives a fresh load after the stale request settles');
});

test('V206.1 quarantines raw and collection reference conflicts before hydration', () => {
  const rawConflict = fixture();
  const rawBase = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paidAt: '2026-08-25', status: 'paid', source: 'synthetic-test-import',
  };
  rawConflict.rentLedgerV202.push(
    { ...rawBase, id: 'raw-conflict-a', receiptNo: 'R-RAW-CONFLICT', paid: 30 },
    { ...rawBase, id: 'raw-conflict-b', receiptNo: 'R-RAW-CONFLICT', paid: 70 },
  );
  rawConflict.collections.push([
    'R-RAW-CONFLICT', 'TEST TENANT', 70, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-25', 'A', '', '2026-08', '',
  ]);
  let runtime = loadRuntime(rawConflict, [], activeRuntimeWindow());
  assert.equal(runtime.ledgerRecords().some((entry) => entry.receiptNo === 'R-RAW-CONFLICT'), false);

  const collectionConflict = fixture();
  const original = collectionConflict.rentLedgerV202.find((entry) => entry.id === 'ledger-paid-a');
  original.due = 999;
  original.paid = 999;
  collectionConflict.collections.push(
    ['R-A-PAID', 'TEST TENANT', 40, 'paid', 'SYNTHETIC TEST PROPERTY', '2026-08-12', 'A', '', '2026-08', 'KNET'],
    ['R-A-PAID', 'TEST TENANT', 41, 'paid', 'SYNTHETIC TEST PROPERTY', '2026-08-12', 'A', '', '2026-08', 'KNET'],
  );
  runtime = loadRuntime(collectionConflict, [], activeRuntimeWindow());
  assert.equal(runtime.ledgerRecords().some((entry) => entry.receiptNo === 'R-A-PAID'), false);
  assert.equal(runtime.unitDirectoryRecords(runtime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08')
    .find((entry) => entry.contractId === 'contract-a').paid, 0);

  const secondaryReference = fixture();
  const aliased = secondaryReference.rentLedgerV202.find((entry) => entry.id === 'ledger-paid-a');
  aliased.voucherNo = 'V-A-PRIMARY';
  aliased.due = 999;
  aliased.paid = 999;
  secondaryReference.collections.push([
    'R-A-PAID', 'TEST TENANT', 40, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-12', 'A', '', '2026-08', 'KNET',
  ]);
  runtime = loadRuntime(secondaryReference, [], activeRuntimeWindow());
  assert.equal(runtime.ledgerRecords().some((entry) => entry.id === 'ledger-paid-a'), false,
    'a conflicting collection on either receipt alias must quarantine the ledger entry');
});

test('V206.1 rejects non-scalar identities, periods, statuses, keys, and contract shapes', () => {
  const data = fixture();
  const canonicalKey = 'synthetic test property|contract:contract-a|unit:a|2026-08';
  const base = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paid: 10, paidAt: '2026-08-26', status: 'paid',
    source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...base, id: 'bad-contract-id', receiptNo: 'R-BAD-CONTRACT-ID', contractId: ['contract-a'] },
    { ...base, id: 'bad-contract-no', receiptNo: 'R-BAD-CONTRACT-NO', contractNo: ['DUPLICATE-TEST'] },
    { ...base, id: 'bad-tenant', receiptNo: 'R-BAD-TENANT', tenant: ['TEST TENANT'] },
    { ...base, id: 'bad-period', receiptNo: 'R-BAD-PERIOD', period: ['2026-08'] },
    { ...base, id: 'bad-spaced-period', receiptNo: 'R-BAD-SPACED-PERIOD', period: ' 2026-08 ' },
    { ...base, id: 'bad-status', receiptNo: 'R-BAD-STATUS', status: ['paid'] },
    { ...base, id: 'bad-key', receiptNo: 'R-BAD-KEY', paymentKey: [canonicalKey] },
    { ...base, id: 'bad-paid-type', receiptNo: 'R-BAD-PAID', paid: [10] },
  );
  data.contractsV202.push({
    id: ['array-contract'], property: ['SYNTHETIC TEST PROPERTY'], unit: ['A'], tenant: ['TEST TENANT'],
    status: ['signed'], start_date: ['2026-01-01'], end_date: ['2026-12-31'], rent: 100,
    source: 'synthetic-test-import',
  });
  data.collections.push([
    'R-BAD-COLLECTION', 'TEST TENANT', 10, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-26', 'A', '', ['2026-08'], 'KNET',
  ]);

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  assert.equal(record.paid, 40);
  assert.equal(settledCollectionTotal(context), 90);
  assert.equal(runtime.contracts().some((contract) => contract.id === 'array-contract'), false);
  assert.equal(context.propertyCollections.some((row) => row[0] === 'R-BAD-COLLECTION' && runtime.collectionReceiptEligible(row)), false);
  assert.equal(Number.isNaN(runtime.strictMoney([25])), true);
  assert.equal(Number.isNaN(runtime.strictMoney(true)), true);
  assert.equal(Number.isNaN(runtime.strictMoney('9007199254740993')), true);
  assert.equal(Number.isNaN(runtime.strictMoney(9007199254740992)), true);
});

test('V206.1 dedupe is order-independent for invalid money and noncanonical payment keys', () => {
  const makeData = (reverse) => {
    const data = fixture();
    const base = {
      id: 'ORDER-ID', receiptNo: 'R-ORDER', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', due: 100,
      paidAt: '2026-08-27', status: 'paid', source: 'synthetic-test-import',
      paymentKey: 'synthetic test property|contract:contract-a|unit:a|2026-08',
    };
    const pair = [{ ...base, paid: 25 }, { ...base, paid: [25] }];
    data.rentLedgerV202.push(...(reverse ? pair.reverse() : pair));
    return data;
  };
  for (const reverse of [false, true]) {
    const runtime = loadRuntime(makeData(reverse), [], activeRuntimeWindow());
    assert.equal(runtime.ledgerRecords().some((entry) => entry.receiptNo === 'R-ORDER'), false);
  }

  const keyConflict = fixture();
  const base = {
    id: 'KEY-ORDER-ID', receiptNo: 'R-KEY-ORDER', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
    tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', due: 100, paid: 25,
    paidAt: '2026-08-27', status: 'paid', source: 'synthetic-test-import',
  };
  keyConflict.rentLedgerV202.push(
    { ...base, paymentKey: 'synthetic test property|contract:contract-a|unit:a|2026-08' },
    { ...base, paymentKey: 'SYNTHETIC TEST PROPERTY|CONTRACT:CONTRACT-A|UNIT:A|2026-08' },
  );
  assert.equal(loadRuntime(keyConflict, [], activeRuntimeWindow()).ledgerRecords()
    .some((entry) => entry.receiptNo === 'R-KEY-ORDER'), false);

  for (const reverse of [false, true]) {
    const invalidIdData = fixture();
    const invalidIdBase = {
      receiptNo: 'R-RAW-ID-ORDER', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
      tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', due: 100, paid: 10,
      paidAt: '2026-08-27', status: 'paid', source: 'synthetic-test-import',
    };
    const invalidIdPair = [
      { ...invalidIdBase, id: 'ID-BAD\uFEFF' },
      { ...invalidIdBase, id: 'ID-CLEAN' },
    ];
    invalidIdData.rentLedgerV202.push(...(reverse ? invalidIdPair.reverse() : invalidIdPair));
    const invalidIdRuntime = loadRuntime(invalidIdData, [], activeRuntimeWindow());
    assert.equal(invalidIdRuntime.ledgerRecords().some((entry) => entry.receiptNo === 'R-RAW-ID-ORDER'), false);
    assert.equal(settledCollectionTotal(invalidIdRuntime.contextFor('SYNTHETIC TEST PROPERTY')), 90);

    const invalidReceiptData = fixture();
    const invalidReceiptBase = { ...invalidIdBase, id: 'VOUCHER-ORDER', voucherNo: 'V-RAW-RECEIPT-ORDER' };
    delete invalidReceiptBase.receiptNo;
    const invalidReceiptPair = [
      { ...invalidReceiptBase, receiptNo: 'BAD\uFEFF' },
      { ...invalidReceiptBase, receiptNo: '' },
    ];
    invalidReceiptData.rentLedgerV202.push(...(reverse ? invalidReceiptPair.reverse() : invalidReceiptPair));
    const invalidReceiptRuntime = loadRuntime(invalidReceiptData, [], activeRuntimeWindow());
    assert.equal(invalidReceiptRuntime.ledgerRecords().some((entry) => entry.voucherNo === 'V-RAW-RECEIPT-ORDER'), false);
    assert.equal(settledCollectionTotal(invalidReceiptRuntime.contextFor('SYNTHETIC TEST PROPERTY')), 90);
  }
});

test('V206.1 normalizes digit scripts consistently across unit receipt resolution', () => {
  const data = fixture();
  data.contractsV202[0].unit = '12';
  data.tenantDirectoryV202[0].unit = '12';
  data.rentLedgerV202[0].unit = '١٢';
  data.rentLedgerV202[1].unit = '١٢';
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  assert.equal(record.paid, 40);
  assert.deepEqual(Array.from(runtime.tenantLedgerEntries(context, record, '2026-08'), (entry) => entry.receiptNo).sort(),
    ['R-A-PAID', 'R-A-PENDING'].sort());
  const row = runtime.propertyRentLedgerRows(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  assert.equal(row.receiptReference, 'R-A-PAID');
});

test('V206.1 keeps undated settlements financial but marks them for review and forbids receipts', () => {
  const data = fixture();
  data.rentLedgerV202 = data.rentLedgerV202.filter((entry) => !['ledger-paid-a', 'ledger-pending-a'].includes(entry.id));
  data.rentLedgerV202.push({
    id: 'invalid-date-payment', receiptNo: 'R-INVALID-DATE', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', due: 100,
    paid: 10, paidAt: '2026-02-31', status: 'paid', source: 'synthetic-test-import',
  });
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const ledgerEntry = context.propertyLedger.find((entry) => entry.id === 'invalid-date-payment');
  const collectionRow = context.propertyCollections.find((row) => row[0] === 'R-INVALID-DATE');
  assert.equal(record.paid, 10);
  assert.equal(record.paymentStatus, 'يحتاج مراجعة');
  assert.equal(record.receipts.includes('R-INVALID-DATE'), false);
  assert.equal(settledCollectionTotal(context), 60, 'financial history retains the imported amount while legal receipt issuance is blocked');
  assert.equal(runtime.collectionFinanciallySettled(collectionRow), true);
  assert.equal(runtime.collectionReceiptEligible(collectionRow), false);
  const collectionsHtml = runtime.collectionsPanel(context);
  assert.match(collectionsHtml, /2026-02-31/);
  assert.match(collectionsHtml, /Date review required/);
  assert.doesNotMatch(collectionsHtml, /(?:3|٣)\s+مارس|March\s+3/i);
  assert.equal(runtime.tenantReceiptDocument(context, record, ledgerEntry, '2026-08'), '');
  assert.equal(runtime.validRecordedDate('2026-02-31'), false);
  assert.equal(runtime.validRecordedDate('٣١/٠٢/٢٠٢٦'), false);
});

test('V206.1 uses valid receipt aliases and rejects sentinel references on save', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'fallback-reference', voucherNo: '—', receiptNo: 'R-FALLBACK', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08', due: 100,
    paid: 5, paidAt: '2026-08-30', status: 'paid', source: 'synthetic-test-import',
  });
  let runtime = loadRuntime(data, [], activeRuntimeWindow());
  assert.equal(runtime.ledgerReference(data.rentLedgerV202.at(-1)), 'R-FALLBACK');
  const row = runtime.propertyRentLedgerRows(runtime.contextFor('SYNTHETIC TEST PROPERTY'), '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  assert.equal(row.receiptReference, 'R-FALLBACK');

  for (const sentinel of ['—', 'N/A', true]) {
    const saveData = fixture();
    const elements = paymentElements(sentinel);
    runtime = loadRuntime(saveData, [], activeRuntimeWindow(), { elements, persist() {} });
    runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
    assert.equal(runtime.savePayment({ preventDefault() {} }), false);
    assert.equal(saveData.rentLedgerV202.some((entry) => String(entry.id).includes(String(sentinel))), false);
    assert.match(elements.v202PaymentError.textContent, /رقم الوصل/);
  }
});

test('V206.1 limits rent writes by role in both the UI and direct save path', () => {
  const viewerWindow = activeRuntimeWindow();
  viewerWindow.AQARI_SUPABASE.context.membership.role = 'viewer';
  const data = fixture();
  const elements = paymentElements('R-VIEWER-DENIED');
  const runtime = loadRuntime(data, [], viewerWindow, { elements, persist() { throw new Error('must not persist'); } });
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  assert.equal(runtime.rentWriteAllowed(), false);
  assert.doesNotMatch(runtime.unitsPanel(context, '2026-08', true), /data-v202-unit-payment=/);
  assert.equal(runtime.savePayment({ preventDefault() {} }), false);
  assert.equal(data.collections.some((row) => row[0] === 'R-VIEWER-DENIED'), false);
  assert.match(elements.v202PaymentError.textContent, /صلاحية/);
  assert.equal(runtime.secureRentOfficeData('SYNTHETIC TEST PROPERTY', '2026-08').canRecordPayment, false);

  for (const invalidRole of ['accountant\uFEFF', '\uFEFFproperty_manager', 'general_manager\u2029', ['accountant']]) {
    const invalidWindow = activeRuntimeWindow();
    invalidWindow.AQARI_SUPABASE.context.membership.role = invalidRole;
    const invalidRuntime = loadRuntime(fixture(), [], invalidWindow);
    assert.equal(invalidRuntime.rentWriteAllowed(), false);
    assert.equal(invalidRuntime.secureRentOfficeData('SYNTHETIC TEST PROPERTY', '2026-08').canRecordPayment, false);
  }
});

test('V206.1 contract dates and legal documents fail closed', () => {
  const runtime = loadRuntime(fixture(), [], activeRuntimeWindow());
  assert.equal(runtime.contractCoversPeriod({ status: 'signed', start_date: 'not-a-date', end_date: '2026-12-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ status: 'signed', start_date: '2026-02-31', end_date: '2026-12-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ status: 'signed', start_date: '2026-09-01', end_date: '2026-08-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ status: 'expired', start_date: '2026-01-01', end_date: '' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ status: 'signed', start_date: ['2026-01-01'], end_date: '2026-12-31' }, '2026-08'), false);
  assert.equal(runtime.contractCoversPeriod({ status: 'signed', start_date: '2026-01-01\uFEFF', end_date: '2026-12-31' }, '2026-08'), false);
  assert.equal(Number.isNaN(runtime.strictMoney('100\uFEFF')), true);

  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const draft = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-draft');
  const draftHtml = runtime.tenantContractDocument(context, draft);
  assert.match(draftHtml, /UNVERIFIED DRAFT/);
  assert.match(draftHtml, /NOT FOR SIGNATURE/);
  assert.doesNotMatch(draftHtml, /v204-contract-signatures/);

  const missingMoney = runtime.tenantContractDocument(context, {
    ...draft, contractRent: 0, currentRent: 0, insurance: 0, advance: 0, cleaningFee: 0,
    contractRentRecorded: false, currentRentRecorded: false, insuranceRecorded: false,
    advanceRecorded: false, cleaningFeeRecorded: false,
  });
  assert.match(missingMoney, /غير مسجل \/ Not recorded/);
  assert.doesNotMatch(missingMoney, /KD 0/);

  for (const mutate of [
    (contract) => { contract.start_date = '2026-02-31'; },
    (contract) => { contract.start_date = '2026-01-01TRAILING-GARBAGE'; },
    (contract) => { contract.rent = 'abc'; contract.contractRent = 'abc'; },
  ]) {
    const invalidData = fixture();
    mutate(invalidData.contractsV202[0]);
    const invalidRuntime = loadRuntime(invalidData, [], activeRuntimeWindow());
    const invalidContext = invalidRuntime.contextFor('SYNTHETIC TEST PROPERTY');
    const invalidRecord = invalidRuntime.unitDirectoryRecords(invalidContext, '2026-08')
      .find((entry) => entry.contractId === 'contract-a');
    const invalidHtml = invalidRuntime.tenantContractDocument(invalidContext, invalidRecord);
    assert.equal(invalidRecord.billable, false);
    assert.equal(invalidRecord.verified, false);
    assert.equal(invalidRecord.contractStatus, 'يحتاج تحقق');
    assert.match(invalidHtml, /UNVERIFIED DRAFT/);
    assert.match(invalidHtml, /NOT FOR SIGNATURE/);
    assert.doesNotMatch(invalidHtml, /v204-contract-signatures/);
    if (invalidData.contractsV202[0].rent === 'abc') {
      assert.match(invalidHtml, /غير مسجل \/ Not recorded/);
      assert.doesNotMatch(invalidHtml, /KD 0/);
    }
  }

  for (const mutate of [
    (contract) => { contract.start_date = '2026-01-01\uFEFF'; },
    (contract) => { contract.end_date = '2026-12-31\u200B'; },
    (contract) => { contract.rent = '100\uFEFF'; },
    (contract) => { contract.start_date = '2026-01-01\u2028'; },
    (contract) => { contract.rent = '100\u2029'; },
    (contract) => { contract.status = 'signed\u2028'; },
  ]) {
    const invalidData = fixture();
    mutate(invalidData.contractsV202[0]);
    const invalidRuntime = loadRuntime(invalidData, [], activeRuntimeWindow());
    assert.equal(invalidRuntime.contracts().some((contract) => contract.id === 'contract-a'), false);
    const invalidContext = invalidRuntime.contextFor('SYNTHETIC TEST PROPERTY');
    const invalidRecord = invalidRuntime.unitDirectoryRecords(invalidContext, '2026-08')
      .find((entry) => entry.unit === 'A');
    const invalidHtml = invalidRuntime.tenantContractDocument(invalidContext, invalidRecord);
    assert.equal(invalidRecord.hasContract, false);
    assert.equal(invalidRecord.billable, false);
    assert.equal(invalidRecord.verified, false);
    assert.match(invalidHtml, /UNVERIFIED DRAFT/);
    assert.doesNotMatch(invalidHtml, /v204-contract-signatures/);
  }

  for (const invalidOverride of ['abc', '100\uFEFF']) {
    const fallbackData = fixture();
    fallbackData.tenantDirectoryV202[0].currentRent = invalidOverride;
    const fallbackRuntime = loadRuntime(fallbackData, [], activeRuntimeWindow());
    const fallbackContext = fallbackRuntime.contextFor('SYNTHETIC TEST PROPERTY');
    const fallbackRecord = fallbackRuntime.unitDirectoryRecords(fallbackContext, '2026-08')
      .find((entry) => entry.contractId === 'contract-a');
    const fallbackHtml = fallbackRuntime.tenantContractDocument(fallbackContext, fallbackRecord);
    assert.equal(fallbackRecord.currentRent, 100, 'invalid directory override must fall back to the valid contract rent');
    assert.equal(fallbackRecord.currentRentRecorded, true);
    assert.doesNotMatch(fallbackHtml, /KD 0(?:\D|$)/);
    assert.match(fallbackHtml, /v204-contract-signatures/);
  }
});

test('V206.1 leaves no-scope legacy rows unassigned across historical properties', () => {
  const data = fixture();
  data.properties.push(['OLD PROPERTY', 'OWNER', '1', '0'], ['NEW PROPERTY', 'OWNER', '1', '0']);
  data.contractsV202.push(
    { id: 'migrant-old', property: 'OLD PROPERTY', unit: '1', tenant: 'MIGRANT TENANT', rent: 50,
      status: 'expired', start_date: '2025-01-01', end_date: '2025-12-31', source: 'synthetic-test-import' },
    { id: 'migrant-new', property: 'NEW PROPERTY', unit: '2', tenant: 'MIGRANT TENANT', rent: 60,
      status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import' },
  );
  data.collections.push(['R-MIGRANT-LEGACY', 'MIGRANT TENANT', 50, 'مدفوع']);
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  for (const property of ['OLD PROPERTY', 'NEW PROPERTY']) {
    const context = runtime.contextFor(property);
    assert.equal(context.propertyCollections.some((row) => row[0] === 'R-MIGRANT-LEGACY'), false);
    assert.equal(context.collected, 0);
  }
});

test('V206.1 keeps the public V206 command-center integration contract', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /seal:sealProtectedImport/);
  assert.match(source, /function sealProtectedImport\(\)\{\s*clearProtectedImport\(\);\s*clearProtectedDom\(\);\s*\}/);
  assert.doesNotMatch(source, /function sealProtectedImport\(\)\{[^}]*hydratePromise=null/);
  assert.match(source, /openProperty:function\(name,period\)\{return protectedAccessReady\(\)\?openWorkspace\(name,document\.activeElement,period\)/);
  assert.match(source, /rentOfficeProperties:function\(\)\{return secureRentOfficeProperties\(\)\}/);
  assert.match(source, /rentOfficeData:function\(name,period\)/);
  assert.match(source, /rentOfficeAction:function\(name,key,period,action,trigger\)/);
  assert.match(source, /if\(activeTab==='units'\)panel\.innerHTML=unitsPanel\(context,activePropertyPeriod\|\|latestOfficialPeriod\(activeProperty\)\)/);
  assert.match(source, /collectionsPanel\(context,activePropertyPeriod\)/);
  assert.match(source, /dataset\.v202Document='rent-office'/);
  assert.match(source, /if\(requested==='payment'\)\{[\s\S]*?closeDocument\(\);[\s\S]*?openPayment\(null,record\.contractId\|\|'',selectedPeriod\)/);
  assert.match(source, /protectedUnitCount=strictCount\(record\?\.\[2\]\)/);
  const runtime = loadRuntime(fixture(), [], activeRuntimeWindow());
  const office = runtime.secureRentOfficeData('SYNTHETIC TEST PROPERTY', '2026-08');
  assert.ok(office);
  assert.deepEqual(Array.from(runtime.secureRentOfficeProperties()), ['SYNTHETIC TEST PROPERTY']);
  assert.equal(office.property, 'SYNTHETIC TEST PROPERTY');
  assert.equal(office.records.some((record) => record.contractId === 'contract-a' && record.receiptNo === 'R-A-PAID'), true);
  assert.equal(office.canRecordPayment, true);

  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const otherRecord = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-b');
  assert.ok(runtime.secureRentOfficeData('SYNTHETIC TEST PROPERTY'));
  for (const invalidPeriod of ['', ['2026-08'], { toString: () => '2026-08' }, ' 2026-08 ', '2026-08\uFEFF']) {
    assert.equal(runtime.secureRentOfficeData('SYNTHETIC TEST PROPERTY', invalidPeriod), null);
  }
  assert.equal(runtime.secureRentOfficeData(['SYNTHETIC TEST PROPERTY'], '2026-08'), null);
  for (const args of [
    [['SYNTHETIC TEST PROPERTY'], record.key, '2026-08', 'statement'],
    ['SYNTHETIC TEST PROPERTY', [record.key], '2026-08', 'statement'],
    ['SYNTHETIC TEST PROPERTY', record.key, ['2026-08'], 'statement'],
    ['SYNTHETIC TEST PROPERTY', record.key, '2026-08', ['statement']],
    ['SYNTHETIC TEST PROPERTY', `${record.key}\uFEFF`, '2026-08', 'statement'],
    ['SYNTHETIC TEST PROPERTY', record.key, '2026-08', 'statement\u2028'],
  ]) {
    assert.equal(runtime.secureRentOfficeAction(...args, null), false);
  }
  runtime.setActiveTenantStatementKey(record.key);
  assert.equal(runtime.secureRentOfficeAction(
    'SYNTHETIC TEST PROPERTY', otherRecord.key, '2026-08', 'bogus', null,
  ), false);
  assert.equal(
    runtime.tenantStatementRecord(context, '2026-08').key,
    record.key,
    'a rejected public action must not change the active tenant selection',
  );
});

test('V206.1 canonicalizes Unicode references and rejects invisible controls', () => {
  const data = fixture();
  const base = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 100, paid: 7, paidAt: '2026-08-29', status: 'paid',
    source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...base, id: 'unicode-composed-a', receiptNo: 'R-é' },
    { ...base, id: 'unicode-composed-b', receiptNo: 'R-e\u0301' },
    { ...base, id: 'unicode-width-a', receiptNo: 'R-123' },
    { ...base, id: 'unicode-width-b', receiptNo: 'R-１２３' },
    { ...base, id: 'unicode-control', receiptNo: 'R-\u200bCONTROL' },
    { ...base, id: 'unicode-vs16', receiptNo: 'R-VS16\uFE0F' },
    { ...base, id: 'unicode-cgj', receiptNo: 'R-CGJ\u034F' },
    { ...base, id: 'unicode-mvs', receiptNo: 'R-MVS\u180B' },
    { ...base, id: 'unicode-interlinear', receiptNo: 'R-CF-\uFFF9123' },
    { ...base, id: 'unicode-syriac', receiptNo: 'R-CF-\u070F123' },
    { ...base, id: 'unicode-bom-leading', receiptNo: '\uFEFFR-BOM-LEADING' },
    { ...base, id: 'unicode-bom-trailing', receiptNo: 'R-BOM-TRAILING\uFEFF' },
    { ...base, id: 'unicode-line-separator', receiptNo: 'R-LINE\u2028' },
    { ...base, id: 'unicode-paragraph-separator', receiptNo: '\u2029R-PARAGRAPH' },
  );
  data.collections.push([
    '\u200b', 'TEST TENANT', 25, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-29', 'A', '', '2026-08', 'KNET',
  ]);
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const ledger = runtime.ledgerRecords();
  for (const entry of data.rentLedgerV202.filter((item) => /unicode-(?:bom|line-separator|paragraph-separator)/.test(item.id))) {
    assert.equal(runtime.ledgerReference(entry), '');
  }
  assert.equal(ledger.filter((entry) => /unicode-composed/.test(entry.id)).length, 1);
  assert.equal(ledger.filter((entry) => /unicode-width/.test(entry.id)).length, 1);
  assert.equal(
    ledger.filter((entry) => /unicode-(?:control|vs16|cgj|mvs|interlinear|syriac|bom|line-separator|paragraph-separator)/.test(entry.id))
      .every((entry) => runtime.ledgerReference(entry) === ''),
    true,
  );
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  assert.equal(record.paid, 54, 'two equivalent pairs count once each and invisible-control rows count zero');
  assert.equal(runtime.receiptExists('R-１２３'), true);
  assert.equal(runtime.receiptExists('R-CF-\uFFF9123'), false);
  assert.equal(runtime.receiptExists('R-CF-\u070F123'), false);
  assert.equal(runtime.receiptExists('\uFEFFR-BOM-LEADING'), false);
  assert.equal(runtime.receiptExists('R-BOM-TRAILING\uFEFF'), false);
  assert.equal(context.propertyCollections.some((row) => row[0] === '\u200b' && runtime.collectionReceiptEligible(row)), false);
});

test('V206.1 quarantines shape and canonical-form conflicts independent of row order', () => {
  for (const reverse of [false, true]) {
    const data = fixture();
    const legacy = ['R-SHAPE', 'TEST TENANT', 25, 'paid'];
    const padded = ['R-SHAPE', 'TEST TENANT', 25, 'paid', '', '', '', '', '', ''];
    data.collections.push(...(reverse ? [padded, legacy] : [legacy, padded]));
    const runtime = loadRuntime(data, [], activeRuntimeWindow());
    assert.equal(runtime.contextFor('SYNTHETIC TEST PROPERTY').propertyCollections.some((row) => row[0] === 'R-SHAPE'), false);
  }

  const periodConflict = fixture();
  const base = {
    id: 'PERIOD-FORM', receiptNo: 'R-PERIOD-FORM', property: 'SYNTHETIC TEST PROPERTY', unit: 'A',
    tenant: 'TEST TENANT', contractId: 'contract-a', due: 100, paid: 25, paidAt: '2026-08-29',
    status: 'paid', source: 'synthetic-test-import',
  };
  periodConflict.rentLedgerV202.push(
    { ...base, period: '2026-08' },
    { ...base, period: '٢٠٢٦-٠٨' },
  );
  assert.equal(loadRuntime(periodConflict, [], activeRuntimeWindow()).ledgerRecords()
    .some((entry) => entry.receiptNo === 'R-PERIOD-FORM'), false);

  const blankKeyConflict = fixture();
  const keyBase = { ...base, id: 'BLANK-KEY-FORM', receiptNo: 'R-BLANK-KEY', period: '2026-08' };
  blankKeyConflict.rentLedgerV202.push({ ...keyBase, paymentKey: '' }, { ...keyBase, paymentKey: '   ' });
  assert.equal(loadRuntime(blankKeyConflict, [], activeRuntimeWindow()).ledgerRecords()
    .some((entry) => entry.receiptNo === 'R-BLANK-KEY'), false);
});

test('V206.1 rejects placeholder tenant and unit identities', () => {
  for (const placeholder of ['—', 'غير مسجل', 'لا يوجد']) {
    const data = fixture();
    data.contractsV202.push({
      id: `placeholder-${placeholder}`, property: 'SYNTHETIC TEST PROPERTY', unit: placeholder,
      tenant: placeholder, rent: 10, status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31',
      source: 'synthetic-test-import',
    });
    data.rentLedgerV202.push({
      id: `ledger-placeholder-${placeholder}`, receiptNo: `R-${placeholder}`,
      property: 'SYNTHETIC TEST PROPERTY', unit: placeholder, tenant: placeholder,
      contractId: `placeholder-${placeholder}`, period: '2026-08', due: 10, paid: 10,
      paidAt: '2026-08-29', status: 'paid', source: 'synthetic-test-import',
    });
    const runtime = loadRuntime(data, [], activeRuntimeWindow());
    assert.equal(runtime.contracts().some((contract) => contract.id === `placeholder-${placeholder}`), false);
    assert.equal(settledCollectionTotal(runtime.contextFor('SYNTHETIC TEST PROPERTY')), 90);
  }
});

test('V206.1 keeps mill precision exact within a conservative accounting bound', () => {
  const runtime = loadRuntime(fixture());
  assert.equal(runtime.strictMoney('999999999999.988'), 999999999999.988);
  assert.equal(runtime.strictMoney('999999999999.989'), 999999999999.989);
  assert.notEqual(runtime.strictMoney('999999999999.988'), runtime.strictMoney('999999999999.989'));
  assert.equal(Number.isNaN(runtime.strictMoney('1000000000000.001')), true);
  assert.equal(Number.isNaN(runtime.strictMoney('9007199254740.988')), true);
  assert.equal(Number.isNaN(runtime.strictMoney('9007199254740.989')), true);
  assert.equal(Number.isNaN(runtime.strictMoney(0.00099999999999999)), true);

  const data = fixture();
  data.collections.push([
    'R-SUB-MILL', 'TEST TENANT', 0.00099999999999999, 'paid', 'SYNTHETIC TEST PROPERTY',
    '2026-08-29', 'A', '', '2026-08', 'KNET',
  ]);
  const checked = loadRuntime(data, [], activeRuntimeWindow());
  const context = checked.contextFor('SYNTHETIC TEST PROPERTY');
  const row = context.propertyCollections.find((entry) => entry[0] === 'R-SUB-MILL');
  assert.equal(checked.collectionReceiptEligible(row), false);
  assert.equal(settledCollectionTotal(context), 90);
});

test('V206.1 uses structural unit record keys without delimiter collisions', () => {
  const data = fixture();
  data.contractsV202.push(
    { id: 'a|x', contract_no: 'c|d', property: 'SYNTHETIC TEST PROPERTY', unit: 'b', tenant: 'e',
      rent: 10, status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import' },
    { id: 'a', contract_no: 'c', property: 'SYNTHETIC TEST PROPERTY', unit: 'x|b', tenant: 'd|e',
      rent: 20, status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import' },
  );
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08').filter((record) => ['a|x', 'a'].includes(record.contractId));
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((record) => record.key)).size, 2);
  const office = runtime.secureRentOfficeData('SYNTHETIC TEST PROPERTY', '2026-08');
  const exposed = office.records.filter((record) => ['a|x', 'a'].includes(record.contractId));
  assert.equal(new Set(exposed.map((record) => record.key)).size, 2);
});

test('V206.1 aggregates rent in exact fils without false partial balances', () => {
  const data = fixture();
  const contract = data.contractsV202.find((entry) => entry.id === 'contract-a');
  contract.rent = 0.8;
  contract.contractRent = 0.8;
  data.rentLedgerV202 = data.rentLedgerV202.filter((entry) => !['ledger-paid-a', 'ledger-pending-a'].includes(entry.id));
  const base = {
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a',
    period: '2026-08', due: 0.8, paidAt: '2026-08-30', status: 'paid', source: 'synthetic-test-import',
  };
  data.rentLedgerV202.push(
    { ...base, id: 'fils-100', receiptNo: 'R-FILS-100', paid: 0.1 },
    { ...base, id: 'fils-700', receiptNo: 'R-FILS-700', paid: 0.7, paidAt: '2026-08-31' },
  );
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const statement = runtime.rentStatementItems(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  const ledgerRow = runtime.propertyRentLedgerRows(context, '2026-08').find((entry) => entry.contractId === 'contract-a');
  assert.equal(runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', contract, '2026-08'), 0.8);
  for (const item of [record, statement, ledgerRow]) {
    assert.equal(item.paid, 0.8);
    assert.equal(item.balance, 0);
    assert.equal(item.paymentStatus, 'مسدد');
  }
  assert.equal(settledCollectionTotal(context), 50.8);
});

test('V206.1 never infers a property when an explicit property field is malformed', () => {
  const data = fixture();
  const otherProperty = 'OTHER TEST PROPERTY';
  data.properties.push([otherProperty, 'OTHER OWNER', '1', '0']);
  const malformed = [
    { ref: 'R-CROSS-CF', property: `${otherProperty}\u200B`, marker: 'CROSS-CF' },
    { ref: 'R-CROSS-ARRAY', property: [otherProperty], marker: 'CROSS-ARRAY' },
    { ref: 'R-CROSS-BOM-ONLY', property: '\uFEFF', marker: 'CROSS-BOM-ONLY' },
    { ref: 'R-CROSS-NEWLINE-ONLY', property: '\n', marker: 'CROSS-NEWLINE-ONLY' },
    { ref: 'R-CROSS-LINE-SEPARATOR', property: '\u2028', marker: 'CROSS-LINE-SEPARATOR' },
  ];
  for (const item of malformed) {
    data.collections.push([
      item.ref, 'TEST TENANT', 9, 'paid', item.property,
      '2026-08-30', 'A', '', '2026-08', 'cash',
    ]);
    data.maintenance.push(['A', item.marker, 9, 'open', item.property]);
  }
  data.collections.push(['R-ABSENT-PROPERTY', 'TEST TENANT', 9, 'pending']);
  data.maintenance.push(['A', 'ABSENT-PROPERTY-MAINTENANCE', 9, 'open']);

  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const primary = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const other = runtime.contextFor(otherProperty);
  const badRefs = new Set(malformed.map(({ ref }) => ref));
  const badMarkers = new Set(malformed.map(({ marker }) => marker));
  for (const context of [primary, other]) {
    assert.ok(context);
    assert.equal(context.propertyCollections.some((row) => badRefs.has(row[0])), false);
    assert.equal(context.maintenance.some((row) => badMarkers.has(row[1])), false);
  }
  assert.ok(primary.propertyCollections.some(
    (row) => row[0] === 'R-ABSENT-PROPERTY' && row[3] === 'يحتاج مراجعة',
  ));
  assert.ok(primary.maintenance.some((row) => row[1] === 'ABSENT-PROPERTY-MAINTENANCE'));
  assert.equal(settledCollectionTotal(primary), 90);
  assert.equal(other.collected, 0);
});

const CANONICAL_PROPERTY = 'CAFÉ 12';
const CANONICAL_PROPERTY_VARIANT = 'CAFE\u0301\u00A0１２';

function canonicalPropertyFixture() {
  const data = fixture();
  data.properties = [[CANONICAL_PROPERTY, 'CANONICAL OWNER', '1', '100']];
  data.contractsV202 = [{
    id: 'contract-canonical', contract_no: 'CANON-1', tenant: 'CANONICAL TENANT',
    property: CANONICAL_PROPERTY, unit: 'U', rent: 100, status: 'signed',
    start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  }];
  data.tenantDirectoryV202 = [];
  data.rentStatementsV202 = [];
  data.rentLedgerV202 = [];
  data.collections = [];
  return data;
}

test('V206.1 deduplicates canonical-equivalent property identities', () => {
  for (const reverse of [false, true]) {
    const ledgerData = canonicalPropertyFixture();
    const ledgerBase = {
      receiptNo: 'R-PROPERTY-CANON', tenant: 'CANONICAL TENANT', unit: 'U',
      contractId: 'contract-canonical', contractNo: 'CANON-1', period: '2026-08',
      due: 100, paid: 25, balance: 75, paidAt: '2026-08-01', method: 'cash',
      status: 'paid', source: 'synthetic-test-import',
    };
    const ledgerPair = [
      { ...ledgerBase, id: 'ledger-property-a', property: CANONICAL_PROPERTY },
      { ...ledgerBase, id: 'ledger-property-b', property: CANONICAL_PROPERTY_VARIANT },
    ];
    ledgerData.rentLedgerV202.push(...(reverse ? ledgerPair.slice().reverse() : ledgerPair));
    const ledgerRuntime = loadRuntime(ledgerData);
    const ledgerContext = ledgerRuntime.contextFor(CANONICAL_PROPERTY_VARIANT);
    const contract = ledgerContext.propertyContracts[0];
    assert.equal(ledgerContext.propertyLedger.length, 1);
    assert.equal(ledgerContext.propertyCollections.length, 1);
    assert.equal(settledCollectionTotal(ledgerContext), 25);
    assert.equal(ledgerRuntime.paidForPeriod(CANONICAL_PROPERTY, contract, '2026-08'), 25);

    const collectionData = canonicalPropertyFixture();
    const collectionBase = [
      'R-COLLECTION-CANON', 'CANONICAL TENANT', 25, 'paid', CANONICAL_PROPERTY,
      '2026-08-01', 'U', '', '2026-08', 'cash',
    ];
    const collectionPair = [
      collectionBase,
      collectionBase.map((value, index) => index === 4 ? CANONICAL_PROPERTY_VARIANT : value),
    ];
    collectionData.collections.push(...(reverse ? collectionPair.slice().reverse() : collectionPair));
    const collectionRuntime = loadRuntime(collectionData);
    const collectionContext = collectionRuntime.contextFor(CANONICAL_PROPERTY);
    assert.equal(collectionContext.propertyCollections.length, 1);
    assert.equal(collectionContext.settledCollections.length, 1);
    assert.equal(settledCollectionTotal(collectionContext), 25);
  }
});

test('V206.1 accepts canonical-equivalent property aliases as one contract', () => {
  for (const [property, propertyName] of [
    [CANONICAL_PROPERTY, CANONICAL_PROPERTY_VARIANT],
    [CANONICAL_PROPERTY_VARIANT, CANONICAL_PROPERTY],
  ]) {
    const data = canonicalPropertyFixture();
    data.contractsV202[0] = { ...data.contractsV202[0], property, propertyName };
    const runtime = loadRuntime(data);
    const contracts = runtime.contracts();
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].id, 'contract-canonical');
    assert.equal(contracts[0].property, CANONICAL_PROPERTY);
    assert.equal(runtime.contextFor(CANONICAL_PROPERTY_VARIANT).propertyContracts.length, 1);
    assert.equal(runtime.contextFor('CAFÉ  12'), null);
  }
});

test('V206.1 keeps an exact-key out-of-term payment visible only for review', () => {
  const data = fixture();
  const payment = {
    id: 'out-of-term-exact-key', receiptNo: 'R-OUT-OF-TERM-EXACT-KEY',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
    contractId: 'contract-a', period: '2027-01', due: 100, paid: 25,
    paidAt: '2027-01-05', status: 'paid', source: 'synthetic-test-import',
    paymentKey: 'synthetic test property|contract:contract-a|unit:a|2027-01',
  };
  data.rentLedgerV202.push(payment);
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  runtime.setActiveProperty(payment.property);
  const context = runtime.contextFor(payment.property);
  const contract = context.propertyContracts.find((entry) => entry.id === payment.contractId);
  const record = runtime.unitDirectoryRecords(context, payment.period)
    .find((entry) => entry.contractId === payment.contractId);
  const reviewRow = context.propertyCollections.find((row) => row[0] === payment.receiptNo);
  assert.equal(payment.paymentKey, runtime.paymentKey(
    payment.property, payment.contractId, payment.unit, payment.period,
  ));
  assert.ok(runtime.ledgerRecords().some((entry) => entry.id === payment.id));
  assert.ok(context.propertyLedger.some((entry) => entry.id === payment.id));
  assert.ok(reviewRow);
  assert.equal(reviewRow[3], 'يحتاج مراجعة');
  assert.equal(runtime.collectionFinanciallySettled(reviewRow), false);
  assert.equal(runtime.collectionReceiptEligible(reviewRow), false);
  assert.equal(context.settledCollections.some((row) => row[0] === payment.receiptNo), false);
  assert.equal(settledCollectionTotal(context), 90);
  assert.equal(runtime.paidForPeriod(payment.property, contract, payment.period), 0);
  assert.equal(record.rent, 0);
  assert.equal(record.paid, 0);
  assert.equal(record.receipts.includes(payment.receiptNo), false);
  assert.deepEqual(Array.from(runtime.tenantLedgerEntries(context, record, payment.period)), []);
  runtime.setActiveTenantStatementKey(record.key);
  assert.equal(runtime.openTenantReceipt(null, payment.receiptNo, payment.period), false);
  assert.equal(runtime.openReceiptDocument(reviewRow, null), false);
});

test('V206.3 preserves an exact canonical payment key across overlapping contracts', () => {
  const data = fixture();
  data.contractsV202.push({
    id: 'contract-a-overlap', contract_no: 'OVERLAP-A', tenant: 'TEST TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'A', rent: 75, status: 'signed',
    start_date: '2026-01-01', end_date: '2026-12-31', source: 'synthetic-test-import',
  });
  data.rentLedgerV202.push(
    {
      id: 'ambiguous-legacy-payment', receiptNo: 'LEGACY-AMBIGUOUS',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
      period: '2026-08', due: 50, paid: 50, paidAt: '2026-08-22',
      status: 'paid', source: 'synthetic-test-import',
    },
    {
      id: 'canonical-key-payment', receiptNo: 'KEYED-OVERLAP',
      property: 'SYNTHETIC TEST PROPERTY', unit: 'A', tenant: 'TEST TENANT',
      period: '2026-08', due: 75, paid: 25, paidAt: '2026-08-23', status: 'paid',
      source: 'synthetic-test-import',
      paymentKey: 'synthetic test property|contract:contract-a-overlap|unit:a|2026-08',
    },
  );
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08')
    .filter((entry) => entry.unit === 'A' && entry.hasContract);
  const original = records.find((entry) => entry.contractId === 'contract-a');
  const overlap = records.find((entry) => entry.contractId === 'contract-a-overlap');
  const originalContract = context.propertyContracts.find((entry) => entry.id === 'contract-a');
  const overlapContract = context.propertyContracts.find((entry) => entry.id === 'contract-a-overlap');
  assert.equal(records.some((entry) => entry.receipts.includes('LEGACY-AMBIGUOUS')), false);
  assert.deepEqual([original.paid, overlap.paid], [40, 25]);
  assert.deepEqual([
    runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', originalContract, '2026-08'),
    runtime.paidForPeriod('SYNTHETIC TEST PROPERTY', overlapContract, '2026-08'),
  ], [40, 25]);
  assert.equal(overlap.receipts.includes('KEYED-OVERLAP'), true);
});

test('V206.3 latest official period skips malformed and duplicate newer statements', () => {
  const data = fixture();
  data.rentStatementsV202 = [
    { id: 'valid-august', property: 'SYNTHETIC TEST PROPERTY', period: '2026-08', totalRent: 300, totalCollected: 90 },
    { id: 'invalid-september-a', property: 'SYNTHETIC TEST PROPERTY', period: '2026-09', totalRent: -1 },
    { id: 'invalid-september-b', property: 'SYNTHETIC TEST PROPERTY', period: '2026-09', totalRent: 999 },
  ];
  const runtime = loadRuntime(data);
  assert.equal(runtime.officialStatementFor('SYNTHETIC TEST PROPERTY', '2026-09'), null);
  assert.equal(runtime.latestOfficialPeriod('SYNTHETIC TEST PROPERTY'), '2026-08');
});

test('V208.1 keeps partial official statements arithmetically consistent', () => {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const sourcePayment = fixture().rentLedgerV202.find((entry) => entry.id === 'ledger-paid-a');

  for (const [statement, expected] of [
    [{ totalRent: 1000 }, [40, 960]],
    [{ totalCollected: 250 }, [250, 50]],
  ]) {
    const data = fixture();
    data.rentLedgerV202 = [{
      ...sourcePayment,
      period,
      paidAt: `${period}-01`,
      paymentKey: `synthetic test property|contract:contract-a|unit:a|${period}`,
    }];
    data.rentStatementsV202 = [{
      id: `partial-${Object.keys(statement)[0]}`,
      property: 'SYNTHETIC TEST PROPERTY',
      period,
      ...statement,
    }];
    const runtime = loadRuntime(data);
    const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
    const model = runtime.propertyRentLedgerModel(context, period);
    assert.deepEqual([context.collected, context.due], expected);
    assert.equal(context.due, model.totals.balance);
  }

  const idOnlyData = fixture();
  idOnlyData.rentLedgerV202 = [{
    ...sourcePayment,
    receiptNo: '',
    id: 'CURRENT-ID-ONLY',
    period,
    paidAt: `${period}-01`,
    paymentKey: `synthetic test property|contract:contract-a|unit:a|${period}`,
  }];
  idOnlyData.rentStatementsV202 = [{
    id: 'partial-id-only', property: 'SYNTHETIC TEST PROPERTY', period, totalRent: 1000,
  }];
  const idOnlyRuntime = loadRuntime(idOnlyData);
  const idOnlyContext = idOnlyRuntime.contextFor('SYNTHETIC TEST PROPERTY');
  const idOnlyModel = idOnlyRuntime.propertyRentLedgerModel(idOnlyContext, period);
  assert.deepEqual(
    [idOnlyContext.collected, idOnlyContext.due, idOnlyModel.totals.paid, idOnlyModel.totals.balance],
    [0, 1000, 0, 1000],
    'an internal id without a receipt or voucher remains review-only in every official total',
  );

  const legacyOnlyData = fixture();
  legacyOnlyData.rentLedgerV202 = [];
  legacyOnlyData.collections = [[
    'R-LEGACY-OFFICIAL', 'TEST TENANT', 40, 'paid', 'SYNTHETIC TEST PROPERTY',
    `${period}-01`, 'A', 'Legacy collection without ledger provenance', period, 'Cash',
  ]];
  legacyOnlyData.rentStatementsV202 = [{
    id: 'partial-legacy-only', property: 'SYNTHETIC TEST PROPERTY', period, totalRent: 1000,
  }];
  const legacyOnlyRuntime = loadRuntime(legacyOnlyData);
  const legacyOnlyContext = legacyOnlyRuntime.contextFor('SYNTHETIC TEST PROPERTY');
  const legacyOnlyModel = legacyOnlyRuntime.propertyRentLedgerModel(legacyOnlyContext, period);
  assert.deepEqual(
    [legacyOnlyContext.collected, legacyOnlyContext.due, legacyOnlyModel.totals.paid, legacyOnlyModel.totals.balance],
    [0, 1000, 0, 1000],
    'official fallbacks use ledger-row provenance instead of an unmatched legacy collection',
  );
  assert.equal(legacyOnlyContext.settledCollections.length, 1, 'the legacy row remains visible for review');
  assert.equal(legacyOnlyContext.paymentCount, 1, 'the payment KPI counts canonical settled transactions independently of official money reconciliation');

  const countBase = fixture();
  const paidA = countBase.rentLedgerV202.find((entry) => entry.id === 'ledger-paid-a');
  const paidB = countBase.rentLedgerV202.find((entry) => entry.id === 'ledger-paid-b');
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const previousDate = new Date(Date.UTC(periodYear, periodMonth - 2, 1));
  const previousPeriod = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}`;
  countBase.rentLedgerV202 = [
    { ...paidA, id: 'count-a-1', receiptNo: 'R-COUNT-A-1', period, paidAt: `${period}-01`,
      paymentKey: `synthetic test property|contract:contract-a|unit:a|${period}` },
    { ...paidA, id: 'count-a-2', receiptNo: 'R-COUNT-A-2', period, paidAt: `${period}-02`,
      paymentKey: `synthetic test property|contract:contract-a|unit:a|${period}` },
    { ...paidB, id: 'count-b-1', receiptNo: 'R-COUNT-B-1', period, paidAt: `${period}-03`,
      paymentKey: `synthetic test property|contract:contract-b|unit:b|${period}` },
    { ...paidA, id: 'count-history', receiptNo: 'R-COUNT-HISTORY', period: previousPeriod, paidAt: `${previousPeriod}-03`,
      paymentKey: `synthetic test property|contract:contract-a|unit:a|${previousPeriod}` },
  ];
  for (const [statement, expectedCollected] of [
    [null, 130],
    [{ totalRent: 300 }, 130],
    [{ totalCollected: 0 }, 0],
    [{ totalRent: 300, payerCount: 0 }, 130],
  ]) {
    const countData = structuredClone(countBase);
    countData.rentStatementsV202 = statement ? [{
      id: 'count-statement', property: 'SYNTHETIC TEST PROPERTY', period, ...statement,
    }] : [];
    const countRuntime = loadRuntime(countData);
    const countContext = countRuntime.contextFor('SYNTHETIC TEST PROPERTY');
    assert.equal(countContext.settledCollections.length, 4, 'all-period history remains available');
    assert.equal(countContext.periodSettledCollections.length, 3, 'the KPI source contains only the selected month');
    assert.equal(countContext.paymentCount, 3, 'official amount or payer fields must not change the monthly transaction count');
    assert.equal(countContext.collected, expectedCollected, 'collection money and payment count must use one monthly scope');
  }
});

test('V208.1 uses the ledger-row rent basis for partial official balances', () => {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const expiredData = fixture();
  expiredData.contractsV202 = [{
    id: 'historical-current', contract_no: 'HIST-1', tenant: 'HISTORICAL TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'H', rent: 400, status: 'expired',
    start_date: `${now.getFullYear()}-01-01`, end_date: `${now.getFullYear()}-12-31`,
    source: 'synthetic-test-import',
  }];
  expiredData.tenantDirectoryV202 = [];
  expiredData.rentLedgerV202 = [];
  expiredData.rentStatementsV202 = [{
    id: 'expired-partial', property: 'SYNTHETIC TEST PROPERTY', period, totalCollected: 50,
  }];
  let runtime = loadRuntime(expiredData);
  let context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  let model = runtime.propertyRentLedgerModel(context, period);
  assert.deepEqual([context.collected, context.due, model.totals.balance], [50, 350, 350]);

  const recordedDueData = fixture();
  recordedDueData.contractsV202 = [{
    id: 'recorded-due-contract', contract_no: 'DUE-1', tenant: 'DUE TENANT',
    property: 'SYNTHETIC TEST PROPERTY', unit: 'R', rent: 400, status: 'signed',
    start_date: `${now.getFullYear()}-01-01`, end_date: `${now.getFullYear()}-12-31`,
    source: 'synthetic-test-import',
  }];
  recordedDueData.tenantDirectoryV202 = [];
  recordedDueData.rentLedgerV202 = [{
    id: 'recorded-due-payment', receiptNo: 'R-RECORDED-DUE', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'R', tenant: 'DUE TENANT', contractId: 'recorded-due-contract', period,
    due: 350, paid: 50, paidAt: `${period}-01`, status: 'paid', source: 'synthetic-test-import',
  }];
  recordedDueData.rentStatementsV202 = [{
    id: 'recorded-due-partial', property: 'SYNTHETIC TEST PROPERTY', period, totalCollected: 50,
  }];
  runtime = loadRuntime(recordedDueData);
  context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  model = runtime.propertyRentLedgerModel(context, period);
  assert.deepEqual([context.collected, context.due, model.totals.balance], [50, 300, 300]);
});

test('V208.1 never offers or executes payment for a non-billable unit card', () => {
  const runtime = loadRuntime(fixture(), [], activeRuntimeWindow());
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const records = runtime.unitDirectoryRecords(context, '2026-08');
  const draftIndex = records.findIndex((record) => record.contractId === 'contract-draft');
  const expiredIndex = records.findIndex((record) => record.contractId === 'contract-expired');
  const activeIndex = records.findIndex((record) => record.contractId === 'contract-a');
  assert.equal(records[draftIndex].billable, false);
  assert.equal(records[expiredIndex].billable, false);
  assert.equal(records[activeIndex].billable, true);
  assert.equal(records[activeIndex].collectible, true);
  const panel = runtime.unitsPanel(context, '2026-08', true);
  assert.match(panel, new RegExp(`data-v202-unit-payment="${activeIndex}"`));
  assert.doesNotMatch(panel, new RegExp(`data-v202-unit-payment="${draftIndex}"`));
  assert.doesNotMatch(panel, new RegExp(`data-v202-unit-payment="${expiredIndex}"`));
  assert.equal(runtime.openUnitPayment({ getAttribute: () => String(draftIndex) }), false);
  assert.doesNotMatch(runtime.paymentDialogMarkup(context, 'contract-draft'), /value="contract-draft"\s+selected/);
  assert.equal(runtime.secureRentOfficeAction(
    'SYNTHETIC TEST PROPERTY', records[draftIndex].key, '2026-08', 'payment', null,
  ), false);

  const historicalData = fixture();
  historicalData.contractsV202[0].status = 'expired';
  const historicalRuntime = loadRuntime(historicalData, [], activeRuntimeWindow());
  historicalRuntime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const historicalContext = historicalRuntime.contextFor('SYNTHETIC TEST PROPERTY');
  const historicalRecords = historicalRuntime.unitDirectoryRecords(historicalContext, '2026-08');
  const historicalIndex = historicalRecords.findIndex((record) => record.contractId === 'contract-a');
  assert.equal(historicalRecords[historicalIndex].billable, true, 'historical statements retain in-term expired rent');
  assert.equal(historicalRecords[historicalIndex].collectible, false, 'expired rent cannot open a new collection');
  assert.doesNotMatch(
    historicalRuntime.unitsPanel(historicalContext, '2026-08', true),
    new RegExp(`data-v202-unit-payment="${historicalIndex}"`),
  );
  assert.equal(historicalRuntime.openUnitPayment({ getAttribute: () => String(historicalIndex) }), false);
});

test('V208.1 canonicalizes settled status labels in bilingual receipts', () => {
  const runtime = loadRuntime(fixture());
  for (const [status, expected] of [
    ['Paid', 'مدفوع / Paid'],
    ['part paid', 'جزئي / Partially paid'],
    ['partially paid', 'جزئي / Partially paid'],
    ['مدفوع جزئي', 'جزئي / Partially paid'],
    ['جزئيًا', 'جزئي / Partially paid'],
    ['received', 'مستلم / Received'],
  ]) {
    assert.equal(runtime.settledPayment(status), true);
    const html = runtime.receiptDocument([
      `R-${status}`, 'TEST TENANT', 10, status, 'SYNTHETIC TEST PROPERTY',
      '2026-08-20', 'A', 'Rent', '2026-08', 'Cash',
    ]);
    assert.ok(html.includes(expected), `${status} must render as ${expected}`);
  }
});

test('V208.1 selects the latest valid payment across ISO and local date formats', () => {
  const data = fixture();
  data.rentLedgerV202.push(
    {
      id: 'ledger-local-older', receiptNo: 'R-LOCAL-OLDER', property: 'SYNTHETIC TEST PROPERTY',
      unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
      due: 100, paid: 5, paidAt: '29/08/2026', status: 'paid', source: 'synthetic-test-import',
    },
    {
      id: 'ledger-iso-latest', receiptNo: 'R-ISO-LATEST', property: 'SYNTHETIC TEST PROPERTY',
      unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
      due: 100, paid: 6, paidAt: '2026-08-30', status: 'paid', source: 'synthetic-test-import',
    },
    {
      id: 'ledger-arabic-latest', receiptNo: 'R-ARABIC-LATEST', property: 'SYNTHETIC TEST PROPERTY',
      unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
      due: 100, paid: 7, paidAt: '٣١/٠٨/٢٠٢٦', status: 'paid', source: 'synthetic-test-import',
    },
  );
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  const entries = runtime.tenantLedgerEntries(context, record, '2026-08');
  const row = runtime.propertyRentLedgerRows(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  assert.equal(record.paidAt, '٣١/٠٨/٢٠٢٦');
  assert.equal(entries.at(-1).receiptNo, 'R-ARABIC-LATEST');
  assert.equal(row.paymentDate, '٣١/٠٨/٢٠٢٦');
  assert.equal(row.receiptReference, 'R-ARABIC-LATEST');
  assert.match(runtime.tenantStatementDocument(context, record, '2026-08'), /data-v202-tenant-receipt="R-ARABIC-LATEST"/);
});

test('V208.1 never mixes invalid-date payment metadata with another legal receipt', () => {
  const data = fixture();
  data.rentLedgerV202.push({
    id: 'invalid-latest-metadata', receiptNo: 'R-INVALID-LATEST', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
    due: 100, paid: 7, paidAt: '2026-12-99', method: 'WIRE', knetTransactionNo: 'BAD-999',
    note: 'INVALID-DATE-NOTE',
    status: 'paid', source: 'synthetic-test-import',
  });
  data.rentLedgerV202.push({
    id: 'pending-metadata', receiptNo: 'R-PENDING-METADATA', property: 'SYNTHETIC TEST PROPERTY',
    unit: 'A', tenant: 'TEST TENANT', contractId: 'contract-a', period: '2026-08',
    due: 100, paid: 3, paidAt: '2026-08-31', method: 'CASH', knetTransactionNo: 'PENDING-999',
    note: 'PENDING-NOTE', status: 'pending', source: 'synthetic-test-import',
  });
  const runtime = loadRuntime(data, [], activeRuntimeWindow());
  const context = runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const record = runtime.unitDirectoryRecords(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  const row = runtime.propertyRentLedgerRows(context, '2026-08')
    .find((entry) => entry.contractId === 'contract-a');
  assert.equal(row.paymentStatus, 'يحتاج مراجعة');
  assert.equal(row.paymentDate, '2026-08-12');
  assert.equal(row.paymentMethod, 'KNET');
  assert.equal(row.knetTransactionNo, '012345');
  assert.equal(row.receiptReference, 'R-A-PAID');
  assert.notEqual(row.paymentMethod, 'WIRE');
  assert.notEqual(row.knetTransactionNo, 'BAD-999');
  assert.deepEqual(Array.from(record.methods), ['KNET']);
  assert.deepEqual(Array.from(record.knetTransactions), ['012345']);
  assert.deepEqual(Array.from(record.paymentNotes), ['August 2026 rent — KNET operation: 012345']);
  const tenantHtml = runtime.tenantStatementDocument(context, record, '2026-08');
  assert.doesNotMatch(tenantHtml, /WIRE|BAD-999|R-INVALID-LATEST|INVALID-DATE-NOTE|PENDING-NOTE|PENDING-999/);
  assert.match(tenantHtml, /KNET|012345|R-A-PAID/);
});

test('executive daily collections use dated settled ledger entries within the authorized property', () => {
 const runtime=loadRuntime(fixture(),[],activeRuntimeWindow());
 const day=runtime.dailyCollectionSummary('SYNTHETIC TEST PROPERTY','2026-08-12');
 assert.ok(day);assert.equal(day.paid,40);assert.equal(day.count,1);
 assert.equal(runtime.dailyCollectionSummary('SYNTHETIC TEST PROPERTY','2026-09-07').paid,0);
 assert.equal(runtime.dailyCollectionSummary('missing','2026-08-12'),null);
 assert.equal(runtime.dailyCollectionSummary('SYNTHETIC TEST PROPERTY','bad'),null);
 const signedOut=loadRuntime(fixture());
 assert.equal(signedOut.dailyCollectionSummary('SYNTHETIC TEST PROPERTY','2026-08-12'),null);
});


test('V267 payment search matches name, contract and localized exact apartment without accepting an expired or partial unit',()=>{
 const runtime=loadRuntime(fixture(),[],activeRuntimeWindow());
 const context=runtime.contextFor('SYNTHETIC TEST PROPERTY');
 assert.ok(runtime.searchPaymentContracts(context,'TEST TENANT').length>=2);
 assert.ok(runtime.searchPaymentContracts(context,'DUPLICATE-TEST').length>=2);
 assert.equal(runtime.searchPaymentContracts(context,'D').length,0);
 const custom={propertyContracts:[{...context.propertyContracts.find(c=>c.id==='contract-a'),id:'unit14',contract_no:'R-14',tenant:'Ali',unit:'14'}]};
 assert.equal(runtime.searchPaymentContracts(custom,'٤').length,0);
 assert.equal(runtime.searchPaymentContracts(custom,'١٤')[0].id,'unit14');
});

for(const mode of ['reject','missing-readback','conflict','scope-change']){
 test('V267 cloud payment '+mode+' cannot expose a successful local collection',async()=>{
  const data=fixture(),error={textContent:''};let reads=0,saves=0;
  let cloud=JSON.parse(JSON.stringify(data));const w=activeRuntimeWindow();
  w.AQARI_CLOUD_SYNC={decodeCloudPayload:payload=>({primary:payload})};
  w.AQARI_SUPABASE.loadAppState=async()=>{
   reads++;if(mode==='scope-change')w.AQARI_SUPABASE.context=null;
   const payload=JSON.parse(JSON.stringify(cloud));
   if(mode==='conflict')payload.collections.push(['other-device']);
   return {payload,revision:4};
  };
  w.AQARI_SUPABASE.saveAppState=async(payload,revision)=>{saves++;assert.equal(revision,4);if(mode==='reject')throw Error('network');if(mode!=='missing-readback')cloud=JSON.parse(JSON.stringify(payload));};
  const runtime=loadRuntime(data,[],w,{elements:{v202PaymentError:error},persist(){assert.fail('must not publish unconfirmed data')}});
  runtime.setActiveProperty('SYNTHETIC TEST PROPERTY');
  const before=JSON.stringify(data);
  const record=['VERIFY','TEST TENANT',10,'مدفوع','SYNTHETIC TEST PROPERTY','2026-08-28','A','','2026-08','KNET'];
  const ledger={receiptNo:'VERIFY',contractId:'contract-a',contractNo:data.contractsV202.find(c=>c.id==='contract-a').contract_no,tenant:'TEST TENANT',unit:'A',period:'2026-08'};
  assert.equal(await runtime.commitPayment(record,ledger),false);
  assert.equal(JSON.stringify(data),before);
  assert.equal(saves,['conflict','scope-change'].includes(mode)?0:1);
 });
}

test('V267 synthetic tenant → saved lease → collection → immutable voucher survives reload and opens for print',async()=>{
 const rentalSandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(root,'v267-rental-records.js'),'utf8'),rentalSandbox);
 const rentals=rentalSandbox.module.exports;
 let data=fixture(),cloud=JSON.parse(JSON.stringify(data)),revision=1;
 const w=activeRuntimeWindow();w.AQARI_CLOUD_SYNC={decodeCloudPayload:payload=>({primary:payload})};
 w.AQARI_SUPABASE.loadAppState=async()=>({payload:JSON.parse(JSON.stringify(cloud)),revision});
 w.AQARI_SUPABASE.saveAppState=async(payload,expected)=>{assert.equal(expected,revision);cloud=JSON.parse(JSON.stringify(payload));revision++;};
 const store=rentals.createStore({scope:()=>({userId:'test',workspaceId:'workspace'}),local:()=>data,load:w.AQARI_SUPABASE.loadAppState,save:w.AQARI_SUPABASE.saveAppState,cache(){}});
 const tenant={id:'new-profile',nameAr:'مستأجر اختبار جديد',nameEn:'New Synthetic Tenant',civilId:'123456789012',phone:'55555555',nationality:'اختبار'};
 await store.change(['tenantProfilesV267','tenants'],db=>{const p=rentals.profile(tenant,[]);db.tenantProfilesV267=[p];db.tenants.push([p.nameAr,'','','نشط',p.id]);return p},(db,p)=>db.tenantProfilesV267[0].id===p.id);
 data=JSON.parse(JSON.stringify(cloud));
 for(const status of ['draft','ready','approved','signing','signed']){
  await store.change(['contractsV202','tenantDirectoryV202'],db=>{
   const c=rentals.lease({id:987,contract_no:'NEW-987',tenantId:tenant.id,property:'SYNTHETIC TEST PROPERTY',unit:'9',rent:'100',deposit:'50',start_date:'2026-01-01',end_date:'2026-12-31',status},db.contractsV202,db.tenantProfilesV267,db.properties);
   db.contractsV202=db.contractsV202.filter(x=>x.id!==987).concat([c]);
   db.tenantDirectoryV202=db.tenantDirectoryV202.filter(x=>x.contractNo!=='NEW-987').concat([{property:c.property,unit:c.unit,tenant:c.tenant,contractNo:c.contract_no,verified:status==='signed',source:'v267-cloud'}]);return c;
  },(db,c)=>db.contractsV202.some(x=>x.id===c.id&&x.status===c.status));
  data=JSON.parse(JSON.stringify(cloud));
 }
 const overlay={dataset:{},classList:{add(){},remove(){},contains(){return true}},setAttribute(){},removeAttribute(){},querySelector(){return null}};
 const elements={v202PaymentContract:{value:'987'},v202PaymentNumber:{value:'V267-ROUNDTRIP'},v202PaymentAmount:{value:'100'},v202PaymentStatus:{value:'مدفوع'},v202PaymentPeriod:{value:'2026-08'},v202PaymentDate:{value:'2026-08-28'},v202PaymentMethod:{value:'KNET'},v202PaymentNote:{value:''},v202PaymentError:{textContent:''},v202DocumentDialog:overlay,v202DocumentDialogTitle:{textContent:''},v202DocumentBody:{innerHTML:''}};
 let afterPrint,printCalls=0;w.addEventListener=(event,handler)=>{if(event==='afterprint')afterPrint=handler};w.print=()=>{assert.equal(typeof afterPrint,'function');printCalls++;afterPrint()};
 const writer=loadRuntime(data,[],w,{elements});writer.setActiveProperty('SYNTHETIC TEST PROPERTY');
 assert.equal(await writer.savePayment({preventDefault(){}}),true,elements.v202PaymentError.textContent);
 assert.match(elements.v202DocumentBody.innerHTML,/Rent Voucher/);assert.match(elements.v202DocumentBody.innerHTML,/NEW-987/);
 assert.equal(writer.printDocument(),true);assert.equal(printCalls,1);
 const reloaded=JSON.parse(JSON.stringify(cloud)),reader=loadRuntime(reloaded,[],activeRuntimeWindow());
 reader.setActiveProperty('SYNTHETIC TEST PROPERTY');reader.setActivePeriod('2026-08');
 assert.match(reader.collectionsPanel(reader.contextFor('SYNTHETIC TEST PROPERTY')),/V267-ROUNDTRIP/);
 const row=reloaded.collections.find(x=>x[0]==='V267-ROUNDTRIP');assert.ok(row);assert.equal(reloaded.rentReceiptsV267.length,1);
 const linkedContext=reader.contextFor('SYNTHETIC TEST PROPERTY');
 const linkedTenant=reader.unitDirectoryRecords(linkedContext,'2026-08').find(x=>String(x.contractId)==='987');
 const linkedPayment=reloaded.rentLedgerV202.find(x=>x.receiptNo==='V267-ROUNDTRIP');
 assert.match(reader.tenantReceiptDocument(linkedContext,linkedTenant,linkedPayment,'2026-08'),/Rent Voucher/);
 assert.match(reader.savedVoucher(row),/New Synthetic Tenant/);
 reloaded.contractsV202.find(c=>c.id===987).tenant='CHANGED LATER';
 assert.match(reader.savedVoucher(row),/New Synthetic Tenant/);assert.doesNotMatch(reader.savedVoucher(row),/CHANGED LATER/);
 assert.equal(reader.savedVoucher([...row.slice(0,2),999,...row.slice(3)]),'');
 reloaded.rentLedgerV202.find(x=>x.receiptNo==='V267-ROUNDTRIP').contractId='wrong';assert.equal(reader.savedVoucher(row),'');
});


test('property cash net never treats reference rent as collected money', () => {
  const data=fixture();data.properties[0][3]='8870';
  let runtime=loadRuntime(data);
  assert.equal(runtime.contextFor('SYNTHETIC TEST PROPERTY').net,0);
  data.expenses=[['SYNTHETIC TEST PROPERTY','maintenance','25','supplier']];
  runtime=loadRuntime(data);
  assert.equal(runtime.contextFor('SYNTHETIC TEST PROPERTY').net,null,
    'Undated legacy expenses cannot support a monthly cash net');
});

test('property journey does not claim a printable statement from legacy expenses or collection counts', () => {
  const runtime=loadRuntime(fixture());
  const context=runtime.contextFor('SYNTHETIC TEST PROPERTY');
  context.activeContracts=[];
  context.official=null;
  context.propertyCollections=[['historic unverified row']];
  context.expenses=[['undated expense']];
  const pending=runtime.journey(context);
  assert.match(pending,/يلزم اعتماد بيانات العقود أولاً/);
  assert.doesNotMatch(pending,/جاهز للطباعة/);
  context.official={period:context.period};
  assert.match(runtime.journey(context),/كشف مصدر محفوظ/);
});

test('property dues remain pending for drafts and invalid terms instead of declaring a zero balance', () => {
  const data=fixture();
  data.contractsV202=data.contractsV202.filter(c=>c.id==='contract-a');
  let runtime=loadRuntime(data),context=runtime.contextFor('SYNTHETIC TEST PROPERTY');
  context.period='2026-08';context.official=null;
  assert.equal(runtime.dueNeedsReview(context),false);
  context.due=0;
  assert.match(runtime.dueKpi(context),/لا يوجد متبقٍ على العقود المعتمدة/);
  data.contractsV202[0].status='draft';
  runtime=loadRuntime(data);context=runtime.contextFor('SYNTHETIC TEST PROPERTY');context.official=null;
  assert.equal(runtime.dueNeedsReview(context),true);
  assert.match(runtime.dueKpi(context),/قيد المراجعة/);
  assert.doesNotMatch(runtime.dueKpi(context),/لا يوجد متبق/);
  context.official={period:context.period};
  assert.match(runtime.dueKpi(context),/حسب كشف المصدر/);
  data.contractsV202[0].status='signed';
  runtime=loadRuntime(data);context=runtime.contextFor('SYNTHETIC TEST PROPERTY');context.period='2026-08';context.official=null;
  context.propertyContracts.push({...context.propertyContracts[0],id:'unresolved',start_date:'unreadable'});
  assert.equal(runtime.dueNeedsReview(context),true);
});

test('empty monthly statement is marked for review in printable output', () => {
  const data=fixture();data.contractsV202.forEach(c=>{c.status='draft';});
  const runtime=loadRuntime(data,[],activeRuntimeWindow()),context=runtime.contextFor('SYNTHETIC TEST PROPERTY');
  const model=runtime.propertyRentLedgerModel(context,'2026-09');
  assert.equal(model.reviewRequired,true);
  assert.equal(model.rows.length,0);
  const document=runtime.propertyRentLedgerDocument(context,'2026-09');
  assert.match(document,/Pending review/);
  assert.match(document,/not a clearance/);
  assert.doesNotMatch(document,/DUE<\/span><strong>٠ د.ك/);
  assert.doesNotMatch(document,/BALANCE<\/span><strong>٠ د.ك/);
});
