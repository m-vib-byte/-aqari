import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchPropertyStatementDiscountUi,statementOwnerApprovedDiscount,PROPERTY_STATEMENT_DISCOUNT_MARKER,PROPERTY_STATEMENT_COLLECTION_MARKER} from '../src/v267/support/property-statement-discount-patch.js';

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

test('property statement overlay displays contract rent, owner-approved discount and current rent separately',()=>{
  const original=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
  const patched=patchPropertyStatementDiscountUi(original);
  assert.match(patched,new RegExp(PROPERTY_STATEMENT_DISCOUNT_MARKER));
  assert.match(patched,/خصم معتمد من المالك/);
  assert.match(patched,/__owner_discount/);
  assert.match(patched,/إيجار العقد والخصم المعتمد والإيجار الحالي تبقى قيماً منفصلة/);
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
