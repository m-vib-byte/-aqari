import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patchTodayPayments} from '../src/v267/support/today-payments-patch.js';
import {patchProtectedKnetRangeApi,patchKnetRangeUi,KNET_RANGE_API_MARKER,KNET_RANGE_UI_MARKER} from '../src/v267/support/knet-range-patch.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('protected KNET range API is scoped, date-bounded and linked to authoritative ledger details',()=>{
  const patched=patchProtectedKnetRangeApi(read('v202-property-os.js'));
  assert.match(patched,/function knetPayments\(name,fromDay,toDay\)/);
  assert.match(patched,/if\(!protectedAccessReady\(\)\)return null/);
  assert.match(patched,/const context=contextFor\(name\)/);
  assert.match(patched,/span>365\*86400000/);
  assert.match(patched,/settledPayment\(entry\?\.status\)/);
  assert.match(patched,/validLedgerPaymentAmount\(entry\)/);
  assert.match(patched,/day>=from&&day<=to/);
  assert.match(patched,/v267KnetLedgerEntry\(entry\)/);
  for(const field of ['property','unit','tenant','contractId','contractNo','amount','paidAt','period','method','transactionNo','receiptNo','internalReceiptNo','externalReceiptNo','accountant'])assert.match(patched,new RegExp(field+':'));
  assert.match(patched,/knetPayments:knetPayments/);
  new Function(patched);
});

test('KNET range API deduplicates operation and receipt identities and rejects conflicting groups from totals',()=>{
  const patched=patchProtectedKnetRangeApi(read('v202-property-os.js'));
  assert.match(patched,/transaction:'\+normalizedReference\(transactionNo\)/);
  assert.match(patched,/receipt:'\+normalizedReference\(internalReceiptNo\)/);
  assert.match(patched,/voucher:'\+normalizedReference\(externalReceiptNo\)/);
  assert.match(patched,/const signatures=new Set/);
  assert.match(patched,/if\(signatures\.size!==1\)\{reviewCount\+=group\.length;return\}/);
  assert.match(patched,/tokens\.length===0/);
  assert.match(patched,/const receiptCount=new Set/);
});

test('command center provides today yesterday month and bounded custom KNET filters',()=>{
  const withToday=patchTodayPayments(read('v210-daily-command-center.js'));
  const patched=patchKnetRangeUi(withToday);
  assert.match(patched,/id="v267KnetRangeReport"/);
  assert.match(patched,/id="v267KnetRangeMode"/);
  assert.match(patched,/option\('today','اليوم'\)/);
  assert.match(patched,/option\('yesterday','أمس'\)/);
  assert.match(patched,/option\('month','الشهر الحالي'\)/);
  assert.match(patched,/option\('custom','فترة مخصصة'\)/);
  assert.match(patched,/id="v267KnetFrom"/);
  assert.match(patched,/id="v267KnetTo"/);
  assert.match(patched,/end<=today/);
  assert.match(patched,/\(end-start\)<=365\*86400000/);
  assert.match(patched,/AQARI_V202\?\.knetPayments\?\.\(name,knetRange\.from,knetRange\.to\)/);
  assert.match(patched,/norm\(row\.property\)===norm\(name\)/);
  assert.match(patched,/فرق العمليات\/الوصولات/);
  assert.match(patched,/row\.transactionNo&&'KNET '/);
  assert.match(patched,/row\.receiptNo&&'وصل '/);
  assert.match(patched,/row\.accountant&&'المحاسب '/);
  assert.doesNotMatch(patched,/localStorage|sessionStorage/);
  new Function(patched);
});

test('KNET range overlays are idempotent and fail closed when anchors move',()=>{
  const protectedBase=read('v202-property-os.js');
  const protectedOnce=patchProtectedKnetRangeApi(protectedBase);
  assert.equal(patchProtectedKnetRangeApi(protectedOnce),protectedOnce);
  assert.ok(protectedOnce.includes(KNET_RANGE_API_MARKER));
  const protectedStale=protectedOnce
    .replaceAll(KNET_RANGE_API_MARKER,'movedKnetRangePayments')
    .replace('  function secureRentOfficeData(name,period){','  function movedSecureRentOfficeData(name,period){');
  assert.throws(()=>patchProtectedKnetRangeApi(protectedStale),/anchor not found/);

  const uiBase=patchTodayPayments(read('v210-daily-command-center.js'));
  const uiOnce=patchKnetRangeUi(uiBase);
  assert.equal(patchKnetRangeUi(uiOnce),uiOnce);
  assert.ok(uiOnce.includes(KNET_RANGE_UI_MARKER));
  const uiStale=uiOnce
    .replaceAll(KNET_RANGE_UI_MARKER,'movedKnetRangeReport')
    .replace("  let lastSignature='';","  let movedSignature='';");
  assert.throws(()=>patchKnetRangeUi(uiStale),/anchor not found/);
});

test('KNET range installer and support source parse as JavaScript',()=>{
  for(const file of ['scripts/install-v267-knet-range.mjs','src/v267/support/knet-range-patch.js']){
    const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
  }
});
