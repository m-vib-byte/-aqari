import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patchTodayPayments} from '../src/v267/support/today-payments-patch.js';
import {patchProtectedKnetApi,patchTodayKnetUi,KNET_API_MARKER,KNET_UI_MARKER} from '../src/v267/support/today-knet-details-patch.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('protected KNET API stays inside V202 access scope and returns linked detail fields',()=>{
  const patched=patchProtectedKnetApi(read('v202-property-os.js'));
  assert.match(patched,/function dailyKnetPayments\(name,day\)/);
  assert.match(patched,/if\(!protectedAccessReady\(\)/);
  assert.match(patched,/const property=propertyRecord\(name\)/);
  assert.match(patched,/settledPayment\(entry\?\.status\)/);
  assert.match(patched,/validLedgerPaymentAmount\(entry\)/);
  assert.match(patched,/ledgerPaymentDateKey\(entry\.paidAt\)===dayKey/);
  assert.match(patched,/v267KnetLedgerEntry\(entry\)/);
  assert.match(patched,/knetTransactionNo/);
  assert.match(patched,/ledgerTransactionNo\(entry\)/);
  assert.match(patched,/ledgerReference\(entry\)/);
  for(const field of ['property','unit','tenant','contractId','contractNo','amount','paidAt','period','method','transactionNo','receiptNo','internalReceiptNo','externalReceiptNo','accountant']){
    assert.match(patched,new RegExp(field+':'));
  }
  assert.match(patched,/dailyKnetPayments:dailyKnetPayments/);
  new Function(patched);
});

test('KNET API deduplicates by operation or either receipt and fails closed on conflicting duplicates',()=>{
  const patched=patchProtectedKnetApi(read('v202-property-os.js'));
  assert.match(patched,/transaction:'\+normalizedReference\(transactionNo\)/);
  assert.match(patched,/receipt:'\+normalizedReference\(internalReceiptNo\)/);
  assert.match(patched,/voucher:'\+normalizedReference\(externalReceiptNo\)/);
  assert.match(patched,/function root\(index\)/);
  assert.match(patched,/function join\(left,right\)/);
  assert.match(patched,/const signatures=new Set/);
  assert.match(patched,/if\(signatures\.size!==1\)\{reviewCount\+=group\.length;return\}/);
  assert.match(patched,/if\(group\.some\(function\(item\)\{return item\.tokens\.length===0\}\)\)\{reviewCount\+=group\.length;return\}/);
  assert.match(patched,/const receiptCount=new Set/);
});

test('today command center shows exact KNET totals, receipts, review delta and protected detail rows',()=>{
  const base=read('v210-daily-command-center.js');
  const withToday=patchTodayPayments(base);
  const patched=patchTodayKnetUi(withToday);
  assert.match(patched,/AQARI_V202\?\.dailyKnetPayments\?\.\(name,day\)/);
  assert.match(patched,/norm\(row\.property\)===norm\(name\)/);
  assert.match(patched,/id="v267TodayKnetDetails"/);
  assert.match(patched,/<h3 id="v267TodayKnetTitle">KNET اليوم<\/h3>/);
  assert.match(patched,/فرق العمليات\/الوصولات/);
  assert.match(patched,/reviewCount/);
  assert.match(patched,/row\.transactionNo&&'KNET '/);
  assert.match(patched,/row\.receiptNo&&'وصل '/);
  assert.match(patched,/row\.accountant&&'المحاسب '/);
  assert.match(patched,/داخلي /);
  assert.match(patched,/خارجي\/يدوي /);
  assert.match(patched,/data-v210-property/);
  assert.doesNotMatch(patched,/localStorage|sessionStorage/);
  new Function(patched);
});

test('KNET overlays are idempotent and refuse stale anchors before or after build installation',()=>{
  const protectedBase=read('v202-property-os.js');
  const protectedOnce=patchProtectedKnetApi(protectedBase);
  assert.equal(patchProtectedKnetApi(protectedOnce),protectedOnce);
  assert.ok(protectedOnce.includes(KNET_API_MARKER));
  const protectedStale=protectedOnce
    .replaceAll(KNET_API_MARKER,'movedDailyKnetPayments')
    .replace('  function secureRentOfficeData(name,period){','  function movedSecureRentOfficeData(name,period){');
  assert.throws(()=>patchProtectedKnetApi(protectedStale),/anchor not found/);

  const todayBase=patchTodayPayments(read('v210-daily-command-center.js'));
  const uiOnce=patchTodayKnetUi(todayBase);
  assert.equal(patchTodayKnetUi(uiOnce),uiOnce);
  assert.ok(uiOnce.includes(KNET_UI_MARKER));
  const uiStale=uiOnce
    .replaceAll(KNET_UI_MARKER,'movedTodayKnetDetails')
    .replace('    const signature=JSON.stringify([state.scope,state.period,state.summary,state.day,state.daily,state.knet]);','    const movedSignature=JSON.stringify([state.scope,state.period,state.summary,state.day,state.daily,state.knet]);');
  assert.throws(()=>patchTodayKnetUi(uiStale),/anchor not found/);
});

test('KNET installer and support source parse as JavaScript',()=>{
  for(const file of ['scripts/install-v267-today-knet-details.mjs','src/v267/support/today-knet-details-patch.js']){
    const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
  }
});
