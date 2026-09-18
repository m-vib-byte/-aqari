import test from 'node:test';
import assert from 'node:assert/strict';
import {bindLocale,setLocale} from '../src/v267/components/locale.js';
import {voucherHTML,salaryTotals} from '../src/v267/domain/payroll.js';
import {ACKNOWLEDGEMENTS} from '../src/v267/domain/salary-slip.js';
import {SALARY_MESSAGES} from '../src/v267/domain/salary-labels.js';
const storage={getItem:()=>null,setItem:()=>{}};
const payroll={month:'2026-09-01',state:'paid',basic:'350',allowances:'10',deductions:'5',advance_repayment:'2.125',method:'transfer',reference:'Record <ref>',notes:'Record <note>',voucher_no:'SAL-101',snapshot:{name_ar:'Record A',name_en:'Record B',job_ar:'Role A',job_en:'Role B',civil_id:'123',passport:'P123',properties:['P1']},slip_details:{payer_ar:'Payer A',payer_en:'Payer B'},admin_approval:{name:'Approver A',at:'2026-09-01'},chairman_approval:{name:'Approver B',at:'2026-09-01'}};
const foreign={ar:/Salary Slip|Employee Signature|Payments|Deductions|Month|Voucher number/,en:/[\u0600-\u06ff\u0900-\u097f\u0d00-\u0d7f]/u,hi:/[\u0600-\u06ff\u0d00-\u0d7f]/u,ur:/[\u0900-\u097f\u0d00-\u0d7f]/u,ml:/[\u0600-\u06ff\u0900-\u097f]/u};
test('both generated salary templates localize display without altering records or totals',()=>{
 bindLocale({workspace:'salary-test',user:'one'},storage);const original=JSON.stringify(payroll);
 for(const language of ['ar','en','hi','ur','ml']){
  setLocale(language,storage);
  for(const template of ['legacy','dhahawi-v1']){
   const p={...payroll,slip_details:{...payroll.slip_details,template}},html=voucherHTML(p),visible=html.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,'');
   assert.ok(html.includes(`lang="${language}"`));assert.ok(html.includes(`dir="${['ar','ur'].includes(language)?'rtl':'ltr'}"`));
   assert.doesNotMatch(visible,foreign[language],language+' '+template);
   assert.ok(html.includes('352.875'));assert.ok(html.includes('Record &lt;ref&gt;'));assert.ok(html.includes('Record &lt;note&gt;'));
   assert.ok(html.includes('Approver A'));assert.ok(html.includes('Approver B'));assert.equal(salaryTotals(p).net,'352.875');
   if(template==='dhahawi-v1'&&['ar','en'].includes(language))for(const pair of ACKNOWLEDGEMENTS)assert.ok(visible.includes(pair[language==='ar'?0:1]));
  }
 }
 assert.equal(JSON.stringify(payroll),original);
});
test('salary document catalog covers all four translated languages and preserves parameters',()=>{
 for(const [source,values]of Object.entries(SALARY_MESSAGES))for(const [i,language]of ['en','hi','ur','ml'].entries()){
  assert.ok(values[i]?.trim(),source+' '+language);assert.doesNotMatch(values[i],foreign[language]);
  assert.equal(values[i].includes('{payer}'),source.includes('{payer}'));
 }
});
