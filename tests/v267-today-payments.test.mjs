import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patchTodayPayments,TODAY_PAYMENTS_MARKER} from '../src/v267/support/today-payments-patch.js';
import {patchDailyPaymentDetails,PAYMENT_DETAIL_MARKER} from '../src/v267/support/payment-detail-patch.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('protected daily source exposes only bounded payment display details',()=>{
 const current=read('v202-property-os.js');
 const patched=patchDailyPaymentDetails(current);
 assert.ok(patched.includes(PAYMENT_DETAIL_MARKER));
 for(const field of ['receiptNo','method','transactionNo','knetTransactionNo','paymentProvider','reference','paidAt','status','amount'])assert.match(patched,new RegExp(field));
 assert.match(patched,/knetTransactionNo\|\|transactionNo\|\|receiptNo/);
 assert.doesNotMatch(read('src/v267/support/payment-detail-patch.js'),/password|access_token|refresh_token/i);
 new Function(patched);
 assert.equal(patchDailyPaymentDetails(patched),patched);
});

test('collection entry captures bank or provider when the method requires it',()=>{
 const patched=patchDailyPaymentDetails(read('v202-property-os.js'));
 assert.match(patched,/id="v267PaymentProvider"/);
 assert.match(patched,/providerRequired=method==='تحويل بنكي'\|\|method==='شيك'\|\|method==='أخرى'/);
 assert.match(patched,/if\(isKnet&&!paymentProvider\)paymentProvider='KNET'/);
 assert.match(patched,/if\(isCash\)paymentProvider=''/);
 assert.match(patched,/أدخل اسم البنك أو مزوّد الدفع لهذه الوسيلة/);
 assert.match(patched,/method,transactionNo,paymentProvider,accountant/);
 assert.match(patched,/rentLedgerV202:\[[^\]]*'paymentProvider'/);
});

test('today payments patch extends the current protected daily command center',()=>{
 const current=read('v210-daily-command-center.js');
 const patched=patchTodayPayments(current);
 assert.match(patched,/id="v267TodayPayments"/);
 assert.match(patched,/<h3 id="v267TodayPaymentsTitle">دفعات اليوم<\/h3>/);
 assert.match(patched,/<span>دفعات اليوم<\/span>/);
 assert.match(patched,/row\.count/);
 assert.match(patched,/out\.count\+=row\.count/);
 assert.match(patched,/out\.rows\.push\(row\)/);
 assert.match(patched,/AQARI_V202\?\.dailyCollectionSummary/);
 assert.doesNotMatch(patched,/localStorage|sessionStorage/);
 new Function(patched);
});

test('collection UI clearly distinguishes KNET cash cheque and other electronic payment methods',()=>{
 const patched=patchTodayPayments(read('v210-daily-command-center.js'));
 assert.match(patched,/label:'KNET',provider:provider\|\|'KNET'/);
 assert.match(patched,/label:'كاش',provider:'لا ينطبق'/);
 assert.match(patched,/label:'شيك',provider:provider\|\|'البنك غير مسجل'/);
 assert.match(patched,/دفع إلكتروني — تحويل بنكي/);
 assert.match(patched,/دفع إلكتروني — '\+raw/);
 assert.match(patched,/paymentMethodView\(payment\.method,payment\.paymentProvider\)/);
 for(const label of ['المرجع: ','البنك/المزوّد: ','التاريخ: ','الوقت: ','الحالة: ','رقم الوصل: '])assert.ok(patched.includes(label),label);
 assert.match(patched,/payment\.status\|\|'غير مسجل'/);
 assert.match(patched,/return 'غير مسجل'/);
});

test('today payments render per-property values with escaped names and preserves undated warning',()=>{
 const patched=patchTodayPayments(read('v210-daily-command-center.js'));
 assert.match(patched,/esc\(row\.name\)/);
 assert.match(patched,/esc\(money\(row\.paid\)\)/);
 assert.match(patched,/row\.undated\?' • توجد دفعات بلا تاريخ ولا تدخل في رقم اليوم'/);
 assert.match(patched,/daily\.count\+' عملية • '/);
 assert.match(patched,/state\.daily\.count\+' عملية مسجلة اليوم'/);
});

test('today payments integration is idempotent and fails closed when required anchors move',()=>{
 const current=read('v210-daily-command-center.js');
 const once=patchTodayPayments(current);
 assert.equal(patchTodayPayments(once),once);
 assert.ok(once.includes(TODAY_PAYMENTS_MARKER));
 const withoutMarker=current.replaceAll(TODAY_PAYMENTS_MARKER,'movedTodayPayments');
 assert.throws(()=>patchTodayPayments(withoutMarker),/anchor not found/);
 assert.throws(()=>patchDailyPaymentDetails('function dailyCollectionSummary(){}'),/anchor not found/);
});

test('today payments support JavaScript parses',()=>{
 for(const file of ['scripts/install-v267-today-payments.mjs','src/v267/support/today-payments-patch.js','src/v267/support/payment-detail-patch.js']){
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
 }
});
