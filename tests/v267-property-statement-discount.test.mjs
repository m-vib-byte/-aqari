import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchPropertyStatementDiscountUi,statementOwnerApprovedDiscount,PROPERTY_STATEMENT_DISCOUNT_MARKER} from '../src/v267/support/property-statement-discount-patch.js';

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

test('property statement discount overlay fails closed when expected anchors drift',()=>{
  assert.throws(()=>patchPropertyStatementDiscountUi('export const changed=true;'),/anchor not found/);
});
