'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'v206-rent-ledger.js');

function loadRuntime(runtimeWindow = {}) {
  const original = fs.readFileSync(runtimePath, 'utf8');
  const wrapperEnd = original.lastIndexOf('})();');
  assert.notEqual(wrapperEnd, -1);
  const expose = `
    globalThis.__AQARI_V206_TESTING__ = Object.freeze({
      accessScope,
      accessReady,
      validEmail,
      viewModel,
      rowMarkup,
      csvCell,
      safeFilename,
      tenantMailto
    });
  `;
  const source = original.slice(0, wrapperEnd) + expose + original.slice(wrapperEnd);
  const sandbox = {
    console,
    window: runtimeWindow,
    document: { readyState: 'loading', addEventListener() {} },
    Intl,
    Date,
    setTimeout() {},
    clearTimeout() {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: runtimePath });
  return sandbox.__AQARI_V206_TESTING__;
}

function officeFixture() {
  return {
    property: 'برج ضحاوي', period: '2026-08', latestPeriod: '2026-08', official: true,
    sourcePages: '1-31', unitCount: 31, totalRent: 23605, totalCollected: 1680,
    totalBalance: 21925, totalInsurance: 5850, totalAdvance: 1250, totalCleaning: 520,
    canRecordPayment: false,
    records: [
      {
        key: 'unit-701', unit: '701', tenant: 'Tenant Seven', contractNo: 'D701', contractId: 'contract-701',
        hasContract: true, contractRent: 250, currentRent: 210, rent: 210, insurance: 400,
        advance: 50, cleaningFee: 40, paid: 210, pending: 25, balance: 0,
        paymentStatus: 'مسدد', paidAt: '2026-08-23', method: 'KNET', transactionNo: 'KN-701',
        receiptNo: '09942', contractReceived: 'مستلم', accountant: 'A. One', email: 'tenant701@example.test',
      },
      {
        key: 'unit-13', unit: '13', tenant: 'Tenant Thirteen', contractNo: 'D13', contractId: 'contract-13',
        hasContract: true, contractRent: 1680, currentRent: 1680, rent: 1680, insurance: 200,
        advance: 0, cleaningFee: 15, paid: 0, pending: 1680, balance: 1680,
        paymentStatus: 'قيد المراجعة', email: 'tenant@example.test\r\nBcc:bad@example.test',
      },
    ],
  };
}

test('V206 loads after V205 and uses the secure V202 rent-office API', () => {
  const loader = fs.readFileSync(path.join(root, 'final-release-ui.js'), 'utf8');
  const propertyOS = fs.readFileSync(path.join(root, 'v202-property-os.js'), 'utf8');
  const rent = fs.readFileSync(runtimePath, 'utf8');

  assert.match(loader, /function installV205SimplifiedShell\s*\(/);
  assert.match(loader, /function installV206RentLedger\s*\(/);
  assert.match(loader, /shell\.addEventListener\('load', installV206RentLedger/);
  assert.match(loader, /css\.href='\/v206-rent-ledger\.css'/);
  assert.match(loader, /script\.src='\/v206-rent-ledger\.js'/);
  assert.match(propertyOS, /rentOfficeData:function\(name,period\)/);
  assert.match(propertyOS, /rentOfficeAction:function\(name,key,period,action,trigger\)/);
  assert.match(propertyOS, /dataset\.v202Document='rent-office'/);
  assert.match(propertyOS, /function openStatementDocument[\s\S]*protectedAccessReady\(\)/);
  assert.match(rent, /getElementById\('v202DocumentDialog'\)/);
  assert.match(rent, /getElementById\('v202DocumentBody'\)/);
  assert.match(rent, /dataset\.v202Document!=='rent-office'/);
  assert.match(rent, /AQARI_V202\?\.rentOfficeData/);
  assert.match(rent, /AQARI_V202\?\.rentOfficeAction/);
  assert.doesNotMatch(rent, /\bdb\b|localStorage|sessionStorage|v201RentStatement/);
});

test('V206 financial view keeps official totals and distinct contract/current rent', () => {
  const runtime = loadRuntime();
  const model = runtime.viewModel(officeFixture());

  assert.equal(model.totalRent, 23605);
  assert.equal(model.totalPaid, 1680);
  assert.equal(model.totalBalance, 21925);
  assert.equal(model.totalInsurance, 5850);
  assert.equal(model.totalAdvance, 1250);
  assert.equal(model.totalCleaning, 520);
  assert.equal(model.totalPending, 1705, 'pending payments are reported separately, not added to collected');
  assert.equal(model.canRecordPayment, false);
  assert.deepEqual(Array.from(model.items, (item) => item.unit), ['13', '701']);

  const unit = model.items.find((item) => item.unit === '701');
  assert.equal(unit.contractRent, 250);
  assert.equal(unit.currentRent, 210);
  assert.equal(unit.receipt, '09942');
  assert.equal(unit.contractReceived, 'مستلم');
  assert.equal(unit.knet, 'KN-701');
  assert.equal(unit.email, 'tenant701@example.test');
  assert.equal(model.items.find((item) => item.unit === '13').email, '', 'header injection address must be discarded');
});

test('V206 access requires a matching active user, membership, and workspace', () => {
  const context = {
    user: { id: 'user-1' }, workspace: { id: 'workspace-1' },
    membership: { is_active: true, user_id: 'user-1', workspace_id: 'workspace-1' },
  };
  const runtime = loadRuntime({ AQARI_SUPABASE: { context } });
  assert.equal(runtime.accessReady(), true);
  context.membership.workspace_id = 'workspace-2';
  assert.equal(runtime.accessReady(), false);
  context.membership.workspace_id = 'workspace-1';
  context.membership.user_id = 'user-2';
  assert.equal(runtime.accessReady(), false);
  context.membership.user_id = 'user-1';
  context.membership.is_active = false;
  assert.equal(runtime.accessReady(), false);
});

test('V206 email, CSV, and filename outputs reject injection', () => {
  const runtime = loadRuntime();
  assert.equal(runtime.validEmail('tenant@example.test'), true);
  for (const value of ['', 'tenant@example', 'javascript:alert(1)', 'a@example.test\r\nBcc:b@example.test']) {
    assert.equal(runtime.validEmail(value), false);
  }
  const item = { tenant: 'Tenant', unit: '701', balance: 210, email: 'tenant@example.test' };
  const mailto = runtime.tenantMailto(item, '2026-08', 'برج ضحاوي');
  assert.match(mailto, /^mailto:tenant@example\.test\?/);
  assert.match(decodeURIComponent(mailto), /Tenant/);
  assert.match(decodeURIComponent(mailto), /701/);
  assert.doesNotMatch(decodeURIComponent(mailto), /civil|123456789012/i);
  assert.match(runtime.csvCell('=HYPERLINK("https://bad")'), /^"'=/);
  assert.equal(runtime.safeFilename('../../ برج ضحاوي / أغسطس'), 'برج-ضحاوي-أغسطس');
  assert.doesNotMatch(runtime.safeFilename('../../ برج ضحاوي / أغسطس'), /[\\/]/);
});

test('V206 renders a bilingual 14-column ledger and safe document actions', () => {
  const rent = fs.readFileSync(runtimePath, 'utf8');
  const headers = rent.match(/headerCell\('/g) || [];
  assert.equal(headers.length, 14);
  for (const label of [
    'FLAT NO.', 'NAME OF THE TENANT', 'CONTRACT NO.', 'RENT CONTRACT', 'INSURANCE', 'ADVANCE',
    'CLEANING FEES', 'CURRENT RENT', 'PAYMENT DATE', 'PAYMENT METHOD', 'KNET OPERATION NUMBER',
    'VOUCHER NO.', 'CONTRACT RECEIVED', 'ACCOUNTANT',
    'كشف المستأجر', 'وصل الإيجار', 'عقد الإيجار', 'إرسال بالبريد',
  ]) assert.match(rent, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(rent, /SIGNED_OUT/);
  assert.match(rent, /clearProtectedView/);
  assert.match(rent, /data-v206-row-key/);
  assert.match(rent, /data-v206-tenant-action="statement"/);
  assert.match(rent, /<caption class="v206-caption">/);
  assert.match(rent, /<th scope="col">/);
  assert.match(rent, /<th scope="row" colspan="3">/);
  assert.match(rent, /role="region"/);
  assert.match(rent, /<bdi dir="auto">/);
  assert.match(rent, /tenantDetails\(item\)/);
  for(const field of ['civilId','phone','nationality','evictionNotice','nameEn','receivedAt','floor'])assert.match(rent,new RegExp(field));
});

test('V206 layout is readable on mobile and prints only the live A4 landscape document', () => {
  const css = fs.readFileSync(path.join(root, 'v206-rent-ledger.css'), 'utf8');
  assert.match(css, /@page rent-ledger\{size:A4 landscape;margin:4mm\}/);
  assert.match(css, /\.v206-paper\{page:rent-ledger/);
  assert.match(css, /#v202DocumentDialog\[data-v202-document="rent-office"\]/);
  assert.match(css, /\.v206-letterhead\{display:grid!important/);
  assert.match(css, /\.v206-ledger\{display:table!important/);
  assert.match(css, /\.v206-ledger thead\{display:table-header-group!important/);
  assert.match(css, /\.v206-ledger :is\(th,td\)\{display:table-cell!important/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /\.v206-command-actions button\{[^}]*min-height:46px/);
  assert.match(css, /\.v206-period input\{[^}]*min-height:44px/);
  assert.match(css, /\.v206-due-main\{[^}]*min-height:68px/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /forced-colors:active/);
  assert.doesNotMatch(css, /#v201RentStatement/);
});


test('rent ledger preserves authoritative zero rent and prints it explicitly',()=>{
 const runtime=loadRuntime(),data=officeFixture();
 data.totalRent=0;data.records=[{...data.records[0],contractRent:0,currentRent:0,rent:210}];
 const model=runtime.viewModel(data);
 assert.equal(model.items[0].contractRent,0);assert.equal(model.items[0].currentRent,0);
 assert.equal(model.totalCurrentRent,0);
 const zero=new Intl.NumberFormat('ar-KW',{minimumFractionDigits:0,maximumFractionDigits:3}).format(0);
 assert.ok(runtime.rowMarkup(model.items[0],0).includes('<bdi dir="auto">'+zero+'</bdi>'));
});
test('rent ledger only falls back for missing amounts and sums fils exactly',()=>{
 const runtime=loadRuntime(),data=officeFixture();delete data.totalRent;
 data.records=[{rent:0.1,contractRent:null,currentRent:null,pending:0.1},{rent:0.2,pending:0.2}];
 const model=runtime.viewModel(data);
 assert.equal(model.totalCurrentRent,0.3);assert.equal(model.totalContractRent,0.3);assert.equal(model.totalPending,0.3);
});
