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

import {salaryTotals} from '../src/v267/domain/payroll.js';
import {amountWords,ACKNOWLEDGEMENTS} from '../src/v267/domain/salary-slip.js';
test('Dhahawi reference amounts total 150 and include each addition and deduction exactly once',()=>{
 const p={basic:120,allowances:5,overtime:5,indemnity:10,holidays:10};assert.deepEqual(salaryTotals(p),{additions:'150.000',deductions:'0.000',net:'150.000'});
 assert.equal(netPay({...p,loan_payment:30,reward:2,housing:3,late:1,absence:2,deductions:3,advance_repayment:4}),'175.000');
 assert.throws(()=>netPay({...p,late:-1}));assert.throws(()=>netPay({...p,absence:'0.0001'}));
});
test('salary amount words preserve fils and the supplied bilingual 150 wording',()=>{
 assert.deepEqual(amountWords('150.000'),{ar:'فقط مائة وخمسون دينار كويتي لا غير',en:'One Hundred And Fifty Kuwaiti Dinars Only'});
 assert.equal(amountWords('0.125').en,'Zero Kuwaiti Dinars And One Hundred And Twenty Five Fils Only');
 assert.ok(amountWords('1200.001').ar.includes('فلس'));assert.ok(amountWords('999999999.999').en.includes('Million'));
 for(const v of ['-1','NaN','1000000000','1.0001'])assert.throws(()=>amountWords(v));
});
test('complete Dhahawi slip renders fixed snapshot, issue date, receipt clauses and unsigned approvals',()=>{
 const p={id:'test',voucher_no:'DT-20260909-000001',issued_at:'2026-09-08T22:00:00Z',state:'issued',month:'2026-08-01',snapshot:{name_ar:'موظف اختبار',name_en:'TEST EMPLOYEE',civil_id:'TEST-ID',passport:'ONE-PASSPORT',nationality:'هندي',nationality_en:'Indian',job_ar:'فني',job_en:'Technician',hired_on:'2024-09-30'},slip_details:{template:'dhahawi-v1',payer_ar:'مسؤول اختبار',payer_en:'<img onerror=evil>'},basic:120,allowances:5,overtime:5,indemnity:10,holidays:10,method:'cash'};
 const html=voucherHTML(p);for(const s of ['DHAHAWI TOWER','Salary Slip','09/09/2026','30/09/2024','150.000','One Hundred And Fifty','Payments / المستحقات','Monetary Reward','Employee housing','Official holidays','Late entry','Absence','ACKNOWLEDGMENT','Chairman of the Board','Administration stamp','إقرار واستلام'])assert.ok(html.includes(s),s);
 assert.equal(html.split('ONE-PASSPORT').length-1,2);assert.ok(html.includes('&lt;img onerror=evil&gt;'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('data:image'));assert.equal(ACKNOWLEDGEMENTS.length,6);
 assert.ok(html.includes('payment pending'));assert.ok(!html.includes('29/08/2026'));assert.ok(!html.includes('Sunil Rambelas'));
 assert.ok(voucherHTML({...p,state:'draft',issued_at:null,voucher_no:null}).includes('On issue'));
});
