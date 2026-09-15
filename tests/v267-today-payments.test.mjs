import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patchTodayPayments,TODAY_PAYMENTS_MARKER} from '../src/v267/support/today-payments-patch.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

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
});

test('today payments support JavaScript parses',()=>{
 for(const file of ['scripts/install-v267-today-payments.mjs','src/v267/support/today-payments-patch.js']){
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
 }
});
