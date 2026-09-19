import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchPropertyStatementDiscountUi,statementOwnerApprovedDiscount,statementSourceRemaining,statementRentTotals,PROPERTY_STATEMENT_DISCOUNT_MARKER,PROPERTY_STATEMENT_COLLECTION_MARKER,PROPERTY_STATEMENT_SOURCE_DETAIL_MARKER,PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER,PROPERTY_STATEMENT_SOURCE_PROFILE_MARKER} from '../src/v267/support/property-statement-discount-patch.js';

test('owner-approved statement discount is derived only from saved contract/current rent values',()=>{
  assert.equal(statementOwnerApprovedDiscount(250,195),55);
  assert.equal(statementOwnerApprovedDiscount('250.125','145'),105.125);
  assert.equal(statementOwnerApprovedDiscount(195,195),0);
  assert.equal(statementOwnerApprovedDiscount(195,260),0);
  assert.equal(statementOwnerApprovedDiscount('',195),null);
  assert.equal(statementOwnerApprovedDiscount(250,null),null);
  assert.equal(statementOwnerApprovedDiscount('bad',195),null);
  assert.equal(statementOwnerApprovedDiscount(-1,0),null);
});

test('source-register remaining uses only saved current rent and saved paid amount and never turns discount into debt',()=>{
  assert.equal(statementSourceRemaining(195,195),0);
  assert.equal(statementSourceRemaining('195.125','145'),50.125);
  assert.equal(statementSourceRemaining(145,195),0);
  assert.equal(statementSourceRemaining('',100),null);
  assert.equal(statementSourceRemaining(195,'bad'),null);
  assert.equal(statementSourceRemaining(-1,0),null);
});

test('statement rent totals separate contract rent, owner discount and current due and fail closed on incomplete source rows',()=>{
  assert.deepEqual(statementRentTotals([
    {contract_rent_kd:'250',current_rent_kd:'195'},
    {contract_rent_kd:'250.125',current_rent_kd:'145'}
  ]),{contractRent:500.125,ownerDiscount:160.125,currentRent:340});
  assert.deepEqual(statementRentTotals([{contract_rent_kd:195,current_rent_kd:260}]),{contractRent:195,ownerDiscount:0,currentRent:260});
  assert.equal(statementRentTotals([{contract_rent_kd:250,current_rent_kd:''}]),null);
  assert.equal(statementRentTotals([]),null);
});

test('property statement overlay displays contract rent, owner-approved discount and current rent separately',()=>{
  const original=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
  const patched=patchPropertyStatementDiscountUi(original);
  assert.match(patched,new RegExp(PROPERTY_STATEMENT_DISCOUNT_MARKER));
  assert.match(patched,/خصم معتمد من المالك/);
  assert.match(patched,/__owner_discount/);
  assert.match(patched,/إيجار العقد والخصم المعتمد والإيجار الحالي تبقى قيماً منفصلة/);
  assert.match(patched,/الخصم خاص بصف المستأجر وفترة هذا الكشف/);
  assert.match(patched,/إجمالي إيجار العقود/);
  assert.match(patched,/إجمالي خصم المالك/);
  assert.match(patched,/إجمالي الإيجار الحالي/);
  assert.match(patched,/غير مكتملة بالمصدر؛ لم تُفترض أي قيمة بديلة/);
  assert.equal(patchPropertyStatementDiscountUi(patched),patched);
});

test('property statement exposes saved source paid and remaining values without replacing protected collection truth',()=>{
  const original=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
  const patched=patchPropertyStatementDiscountUi(original);
  assert.match(patched,new RegExp(PROPERTY_STATEMENT_SOURCE_DETAIL_MARKER));
  assert.match(patched,new RegExp(PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER));
  assert.match(patched,/المدفوع بالمصدر/);
  assert.match(patched,/paid_amount_kd/);
  assert.match(patched,/المتبقي بالمصدر/);
  assert.match(patched,/__source_remaining/);
  assert.match(patched,/الجنسية بالمصدر/);
  assert.match(patched,/nationality_raw/);
  assert.match(patched,/المتبقي مشتق فقط من الإيجار الحالي ناقص المدفوع بالمصدر ولا يحسب فرق الخصم كمتأخرات/);
  assert.match(patched,/هذه القيم لا تستبدل التحصيل الفعلي المحمي/);
  assert.equal((patched.match(/paid_amount_kd/g)||[]).length,2,'one field plus one derivation helper');
  assert.equal((patched.match(/nationality_raw/g)||[]).length,1);
  assert.equal(patchPropertyStatementDiscountUi(patched),patched);
});

test('property statement exposes only saved supplementary source profile fields and leaves missing values un-invented',()=>{
  const original=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
  const patched=patchPropertyStatementDiscountUi(original);
  assert.match(patched,new RegExp(PROPERTY_STATEMENT_SOURCE_PROFILE_MARKER));
  for(const marker of [
    'رسوم النظافة بالمصدر','cleaning_kd','استلام العقد بالمصدر','contract_received_raw',
    'البريد الإلكتروني بالمصدر','email_raw','رقم الجواز بالمصدر','passport_no_raw',
    'الشهر المجاني بالمصدر','free_month_raw','تنبيه الإخلاء بالمصدر','eviction_notice_raw',
    'ملاحظات المصدر','notes_raw'
  ])assert.match(patched,new RegExp(marker));
  assert.match(patched,/تعرض فقط إذا كانت محفوظة في صف المصدر نفسه/);
  assert.match(patched,/أي قيمة مفقودة تبقى غير مدونة دون افتراض بديل/);
  assert.equal((patched.match(/email_raw/g)||[]).length,1);
  assert.equal((patched.match(/passport_no_raw/g)||[]).length,1);
  assert.equal((patched.match(/free_month_raw/g)||[]).length,1);
  assert.equal((patched.match(/eviction_notice_raw/g)||[]).length,1);
  assert.equal((patched.match(/notes_raw/g)||[]).length,1);
  assert.equal(patchPropertyStatementDiscountUi(patched),patched);
});

test('property statement automatically reads protected monthly collection for paid and remaining values',()=>{
  const original=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
  const patched=patchPropertyStatementDiscountUi(original);
  assert.match(patched,new RegExp(PROPERTY_STATEMENT_COLLECTION_MARKER));
  assert.match(patched,/aqari_monthly_collection_report/);
  assert.match(patched,/إظهار المدفوع والمتبقي من التحصيل الفعلي/);
  assert.match(patched,/تعذر تحميل المدفوع والمتبقي تلقائياً/);
  assert.equal((patched.match(/aqari_monthly_collection_report/g)||[]).length,2,'one automatic read plus the existing manual refresh');
  assert.equal(patchPropertyStatementDiscountUi(patched),patched);
});

test('property statement discount overlay fails closed when expected anchors drift',()=>{
  assert.throws(()=>patchPropertyStatementDiscountUi('export const changed=true;'),/anchor not found/);
});
