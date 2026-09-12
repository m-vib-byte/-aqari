import test from 'node:test';
import assert from 'node:assert/strict';
import {financialRecordRows,filterFinancialRecords} from '../src/v267/components/financial-record-browser.js';

const data={tenants:[{id:'t1',name:'أحمد'}],leases:[{id:'l1',tenant_id:'t1',contract_no:'LEASE-12'}],properties:[{id:'p1',name:'برج الاختبار'}],accounts:[{id:'a1',property_id:'p1',name:'الصندوق',kind:'cashbox',masked_reference:'****7890',status:'active'}],ledger:[{id:'r1',tenant_id:'t1',lease_id:'l1',direction:'debit',kind:'opening_debit',amount:'125.125',occurred_on:'2026-09-01',reason:'رصيد معتمد',source_type:'manual',source_id:'SOURCE-12',actor_id:'SECRET-AUTH-ID'}],reserves:[{id:'r2',property_id:'p1',direction:'hold',amount:'4.001',created_at:'2026-09-12T12:00:00Z',reason:'صيانة'}],cancellations:[{id:'c1',payment_id:'p-deleted',cancelled_at:'2026-08-31T12:00:00Z',snapshot:{reference:'RECEIPT-OLD',sensitive:'SECRET-SNAPSHOT'},reason:'وصل مكرر',approved_by_name:'مدير الاختبار'}]};
test('saved records resolve names and cancelled receipt source without exposing unrelated metadata',()=>{
 const rows=financialRecordRows(data),text=JSON.stringify(rows);
 assert.match(text,/125\.125 د.ك/);assert.match(text,/أحمد/);assert.match(text,/LEASE-12/);assert.match(text,/RECEIPT-OLD/);assert.doesNotMatch(text,/SECRET-AUTH-ID|SECRET-SNAPSHOT/);
 assert.equal(rows.find(x=>x.id==='r1').type,'ledger');assert.equal(data.ledger[0].amount,'125.125');
});
test('Arabic record search and inclusive dates filter independently without treating undated accounts as period activity',()=>{
 const rows=financialRecordRows(data);
 assert.deepEqual(filterFinancialRecords(rows,{query:'احمد',from:'2026-09-01',to:'2026-09-01'}).map(x=>x.id),['r1']);
 assert.deepEqual(filterFinancialRecords(rows,{type:'reserves',from:'2026-09-01',to:'2026-09-12'}).map(x=>x.id),['r2']);
 assert.equal(filterFinancialRecords(rows,{from:'2026-10-01',to:'2026-09-01'}).length,0);
 assert.equal(filterFinancialRecords(rows,{type:'accounts'}).length,1);
 assert.equal(filterFinancialRecords(rows,{type:'accounts',from:'2026-01-01'}).length,0);
});
test('posting history displays its saved account identity after the current account is renamed',()=>{
 const rows=financialRecordRows({...data,accounts:[{id:'a1',name:'اسم لاحق',masked_reference:'****9999'}],payments:[{id:'p1',reference:'R-1'}],postings:[{id:'post1',account_id:'a1',payment_id:'p1',amount:'12.001'}],posting_accounts:[{posting_id:'post1',captured_on_post:true,snapshot:{name:'الاسم عند الترحيل',masked_reference:'****1234'}}]});
 const row=rows.find(x=>x.type==='postings');assert.match(JSON.stringify(row),/الاسم عند الترحيل/);assert.match(JSON.stringify(row),/\*\*\*\*1234/);assert.doesNotMatch(JSON.stringify(row),/اسم لاحق|9999/);
});
