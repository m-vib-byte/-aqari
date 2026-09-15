import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../src/v267/pages/bank-reconciliation.js',import.meta.url),'utf8');
const installer=readFileSync(new URL('../scripts/install-v267-bank-reconciliation.mjs',import.meta.url),'utf8');

test('unknown transfers stay unmatched and UI never promises automatic matching',()=>{
 assert.match(page,/stateLabel\(item\.state\)/);
 assert.match(page,/حفظ كتحويل غير مطابق/);
 assert.match(page,/لن تربطه المنصة تلقائياً بأي مستأجر أو عقد أو عقار أو دفعة/);
 assert.match(page,/لا توجد مطابقة تلقائية أو تقريبية/);
 assert.match(page,/response\?\.autoMatched!==false/);
});

test('explicit matching requires a selected authoritative payment, reason and readback',()=>{
 assert.match(page,/paymentId:payment\.value/);
 assert.match(page,/reason:text\(reason\.value\)/);
 assert.match(page,/response\?\.record\?\.state!=='reconciled'/);
 assert.match(page,/Number\(response\?\.record\?\.revision\)!==Number\(current\.revision\)\+1/);
 assert.match(page,/إعادة إلى غير مطابق/);
});

test('financial register integration is bounded and fail-closed on moved anchor',()=>{
 assert.match(installer,/financial-register\.js/);
 assert.match(installer,/V267 bank reconciliation integration anchor not found/);
 assert.match(installer,/openBankReconciliation/);
 assert.match(installer,/مطابقة التحويلات البنكية/);
});
