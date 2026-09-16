import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isKnetPaymentMethod,statementPaymentReference} from '../src/v267/domain/payment-reference.js';

test('property statement classifies KNET methods without treating other methods as KNET',()=>{
 for(const method of ['KNET','K-Net','k net','كي نت','كي-نت','كي نت من المصدر'])assert.equal(isKnetPaymentMethod(method),true,method);
 for(const method of ['cash','نقدي','تحويل بنكي','شيك','ليس كي نت',''])assert.equal(isKnetPaymentMethod(method),false,method);
});

test('property statement labels a KNET operation as KNET and keeps other references generic',()=>{
 assert.deepEqual(statementPaymentReference({payment_method_raw:'كي نت',payment_operation_raw:' KNET-123 '}),{label:'رقم KNET بالمصدر',value:'KNET-123'});
 assert.deepEqual(statementPaymentReference({payment_method_raw:'تحويل بنكي',payment_operation_raw:'TX-9'}),{label:'مرجع الدفع بالمصدر',value:'TX-9'});
 assert.deepEqual(statementPaymentReference({payment_method_raw:'KNET',payment_operation_raw:'   '}),{label:'رقم KNET بالمصدر',value:null});
});

test('property statement UI uses the guarded payment-reference formatter and does not expose bank-account fields',()=>{
 const source=fs.readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
 assert.match(source,/statementPaymentReference\(row\)/);
 assert.doesNotMatch(source,/bank_account|account_number|\biban\b/i);
});

test('property statement PDF carries confirmed saved source provenance without inventing another source',()=>{
 const pdfSource=fs.readFileSync(new URL('../lib/property_statement_pdf.py',import.meta.url),'utf8');
 for(const marker of ["('صفحة الاتصال بالمصدر','contact_source_page')","('صفحة البيانات المالية بالمصدر','financial_source_page')","('الرقم المدني بالمصدر','civil_id_raw')","('الهاتف بالمصدر','phone_raw')","('نهاية العقد بالمصدر','contract_end_raw')","('بداية العقد بالمصدر','contract_start_raw')"]){
  assert.match(pdfSource,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
 assert.match(pdfSource,/بيانات المصدر التكميلية/);
 assert.match(pdfSource,/أرقام صفحات المصدر/);
 assert.match(pdfSource,/قراءة فقط من نفس صفوف الكشف المحفوظ/);
 assert.doesNotMatch(pdfSource,/email_raw|bank_account|account_number|\biban\b/i);
});
