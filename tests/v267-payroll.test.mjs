import test from 'node:test';
import assert from 'node:assert/strict';
import {money,netPay,voucherHTML,validateDocument,kuwaitTime} from '../src/v267/domain/payroll.js';
test('salary arithmetic uses fils and rejects invalid or negative inputs',()=>{
 assert.equal(money('١٢٣٫٤٥٦'),'123.456');assert.equal(netPay({basic:'500.001',allowances:'20.009',overtime:'0.010',deductions:'0.019',advance_repayment:'10.001'}),'510.000');
 for(const value of ['',null,'-1','1e3','1.2345','NaN','1000000000'])assert.throws(()=>money(value));
 assert.throws(()=>netPay({basic:10,allowances:0,overtime:0,deductions:11,advance_repayment:0}));
});
test('voucher preserves bilingual snapshot, approvals, methods and blank physical evidence',()=>{
 const html=voucherHTML({id:'sample',month:'2026-09-01',snapshot:{name_ar:'موظف اختبار',name_en:'<script>not executed</script>',properties:['برج الاختبار']},basic:500,allowances:25,overtime:20,deductions:5,advance_repayment:10,method:'transfer',reference:'REF<&',state:'issued',admin_approval:{name:'مدير اختبار',at:'2026-09-09T06:00:00Z'}});
 assert.ok(html.includes('530.000'));assert.ok(html.includes('موظف اختبار'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('REF&lt;&amp;'));assert.ok(html.includes('Employee fingerprint'));assert.ok(html.includes('Chairman'));assert.ok(html.includes('Administration stamp'));assert.ok(html.includes('مدير اختبار'));assert.ok(!html.includes('data:image'));
 assert.ok(kuwaitTime('2026-09-09T06:00:00Z').includes('09:00'));
});
test('document validation rejects disguised content and oversized files',async()=>{
 await validateDocument(new Blob(['%PDF-1.7 sample'],{type:'application/pdf'}));
 await validateDocument(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}));
 await assert.rejects(()=>validateDocument(new Blob(['<html>'],{type:'application/pdf'})));
 await assert.rejects(()=>validateDocument(new Blob(['%PDF'],{type:'text/html'})));
 await assert.rejects(()=>validateDocument({size:10485761,type:'application/pdf'}));
});
