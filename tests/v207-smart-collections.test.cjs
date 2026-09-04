'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.resolve(__dirname,'..');

test('V207 adds a smart collection layer over the official V206 ledger',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const smart=fs.readFileSync(path.join(root,'v207-smart-collections.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v207-smart-collections.css'),'utf8');
  const propertyOS=fs.readFileSync(path.join(root,'v202-property-os.js'),'utf8');

  assert.match(propertyOS,/PROPERTY_RENT_LEDGER_COLUMNS/);
  assert.match(propertyOS,/data-v206-payment-status/);
  assert.match(propertyOS,/paymentStatus=due>0&&balance===0\?'مسدد':paid>0\?'جزئي':pending>0\?'قيد المراجعة':'مستحق'/);

  assert.match(loader,/function installV207SmartCollections\s*\(/);
  assert.match(loader,/smartCss\.href='\/v207-smart-collections\.css'/);
  assert.match(loader,/smartJs\.src='\/v207-smart-collections\.js'/);
  assert.match(loader,/shell\.addEventListener\('load', installV207SmartCollections, \{ once:true \}\)/);

  assert.match(smart,/const PROTECTED_SOURCE='protected-rent-import-v202'/);
  assert.match(smart,/function contractWritable\s*\(/);
  assert.match(smart,/norm\(contract\?\.source\)!==norm\(PROTECTED_SOURCE\)/);
  assert.match(smart,/rowsFromOfficialLedger/);
  assert.match(smart,/\.v206-ledger-table tbody tr\[data-v206-payment-status\]/);
  assert.match(smart,/data-v206-payment-status/);
  assert.match(smart,/function activeProperty\s*\(/);
  assert.match(smart,/\.v206-ledger-title h2/);
  assert.match(smart,/if\(documentProperty&&documentProperty!=='عقار غير مسجل'\)return documentProperty/);
  assert.match(smart,/aqari_v202_property/);
  assert.match(smart,/contractsV202/);
  assert.match(smart,/resolveContract/);
  assert.match(smart,/norm\(contract\?\.property\)!==norm\(property\)/);
  assert.match(smart,/matches\.length===1/);
  assert.match(smart,/function prioritySort\s*\(/);
  assert.match(smart,/const priority=\{due:0,partial:1,pending:2,paid:3\}/);
  assert.match(smart,/function priorityTarget\s*\(/);
  assert.match(smart,/entry=>entry\.contract&&contractWritable\(entry\.contract\)/);
  assert.match(smart,/data-v207-priority/);
  assert.match(smart,/تحصيل الأولوية/);
  assert.match(smart,/الحالات المطلوبة للعرض فقط/);
  assert.match(smart,/عرض فقط/);
  assert.match(smart,/data-v207-filter="action"/);
  assert.match(smart,/data-v207-filter="due"/);
  assert.match(smart,/data-v207-filter="partial"/);
  assert.match(smart,/data-v207-filter="pending"/);
  assert.match(smart,/data-v207-filter="paid"/);
  assert.match(smart,/data-v207-filter="all"/);
  assert.match(smart,/data-v207-search/);
  assert.match(smart,/data-v207-contract/);
  assert.match(smart,/const resolved=contracts\(\)\.find\(item=>contractId\(item\)===wanted\)\|\|null/);
  assert.match(smart,/if\(!contractWritable\(resolved\)\)return false/);
  assert.match(smart,/#v202DocumentDialog\.on \[data-v202-document-close\]/);
  assert.match(smart,/close\.click\(\)/);
  assert.match(smart,/data-v202-action="payment"/);
  assert.match(smart,/v202PaymentContract/);
  assert.match(smart,/v202PaymentAmount/);
  assert.match(smart,/document\.getElementById\('v202PaymentAmount'\)\?\.focus\(\)/);
  assert.match(smart,/مركز متابعة التحصيل/);
  assert.match(smart,/مطلوب الآن/);
  assert.doesNotMatch(smart,/rentLedgerV202/);
  assert.doesNotMatch(smart,/AQARI_SUPABASE\s*=/);

  assert.match(css,/v207-priority\.is-readonly/);
  assert.match(css,/v207-item\.is-readonly/);
  assert.match(css,/v207-status\.is-due/);
  assert.match(css,/v207-status\.is-partial/);
  assert.match(css,/v207-status\.is-pending/);
  assert.match(css,/v207-status\.is-paid/);
  assert.match(css,/@media print\{body\.aq-v207 \.v207-panel\{display:none!important\}\}/);
});