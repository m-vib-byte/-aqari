import test from 'node:test';
import assert from 'node:assert/strict';
import {printable} from '../src/v267/pages/vacating-settlement.js';
const balances={rent_due_total:'2800.000',rent_paid_total:'2800.000',rent_balance:'0.000',tenant_credit:'0.000',deposit_balance:'0.000'};
const snapshot={lease_id:'lease',contract_no:'ORIGINAL-CONTRACT',tenant_name:'ORIGINAL-TENANT',property_name:'Original',unit_no:'101',vacate_date:'2026-08-31',damage_amount:'0.000',keys_returned:true,inspection_completed:true,meters_recorded:true,final_balances:balances};
const row={...snapshot,contract_no:'CHANGED-CONTRACT',tenant_name:'CHANGED-TENANT',settlement_no:'VS-1',settlement_snapshot:snapshot};
test('settlement printing retains the saved identity when the live tenant or contract changes',()=>{
 const html=printable(row,'settlement');assert.ok(html.includes('ORIGINAL-TENANT'));assert.ok(html.includes('ORIGINAL-CONTRACT'));assert.ok(!html.includes('CHANGED-TENANT'));assert.ok(!html.includes('CHANGED-CONTRACT'));
});
test('missing saved balance cannot be represented as a paid zero',()=>{
 assert.throws(()=>printable({...row,settlement_snapshot:{...snapshot,final_balances:{}}},'settlement'));
});
