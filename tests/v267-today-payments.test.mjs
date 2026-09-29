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
 const missingHeroAnchor=`    const dailyRows=propertyNames(scope).map(function(name){return window.AQARI_V202?.dailyCollectionSummary?.(name,day)});\n    const daily=dailyRows.length&&dailyRows.every(function(row){return row&&row.day===day})?dailyRows.reduce(function(out,row){out.paid+=Math.round(row.paid*1000);out.undated+=row.undated;return out},{paid:0,undated:0}):null;\n  function markup(state){\n<span>تحصيل منقول</span>`;
 assert.throws(()=>patchTodayPayments(missingHeroAnchor),/hero label anchor not found/);
});

test('today payments support JavaScript parses',()=>{
 for(const file of ['scripts/install-v267-today-payments.mjs','src/v267/support/today-payments-patch.js']){
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
 }
});
