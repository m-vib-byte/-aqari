import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rentReceiptArtifacts,executionManifest} from '../src/v267/domain/contract-execution.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('new-contract entry reserves the contract serial on the server',()=>{
 const source=read('src/v267/pages/contract-foundation.js');
 assert.match(source,/aqari_reserve_contract_serial/);
 assert.doesNotMatch(source,/nextContractSerial\(/);
 assert.match(source,/serialSource:'server-reservation-v1'/);
});

test('final execution reserves a global receipt number and reads dual artifacts',()=>{
 const source=read('src/v267/pages/contract-execution.js');
 assert.match(source,/aqari_reserve_rent_receipt_serial/);
 assert.match(source,/p_operation_ref:ids\.settlement/);
 assert.match(source,/aqari_contract_execution_artifacts/);
 assert.match(source,/tenant_document_id/);
 assert.match(source,/owner_document_id/);
 assert.match(source,/aqari_rent_due_schedule/);
 assert.doesNotMatch(source,/nextRentReceiptSerial/);
});

test('database contract enforces platform-wide serial uniqueness and dual official copies',()=>{
 const sql=read('staging-database/sql/contract-execution-finalization-v2.sql');
 assert.match(sql,/aqari_leases_contract_no_platform_unique/);
 assert.match(sql,/aqari_rent_payments_reference_platform_unique/);
 assert.match(sql,/aqari_reserve_contract_serial/);
 assert.match(sql,/aqari_reserve_rent_receipt_serial/);
 assert.match(sql,/unique\(workspace_id,contract_ref,contract_sequence\)/i);
 assert.match(sql,/'CT-'\|\|settlement\.contract_no\|\|'-TENANT'/);
 assert.match(sql,/'CT-'\|\|settlement\.contract_no\|\|'-OWNER'/);
 assert.match(sql,/contract_execution_artifacts_issued/);
});

test('receipt snapshot carries official global number plus sequence inside contract',()=>{
 const contract={id:'contract-1',status:'signed',tenant:'أحمد',tenantId:'tenant-1',property:'برج',unit:'3',contract_no:'AQ-C-2026-000001',accountant:'محاسب',start_date:'2026-09-01',end_date:'2027-08-31'};
 const profile={id:'tenant-1',nameEn:'Ahmed'};
 const due={rent:350,deposit:0,advance:0,fees:0,total:350,period:'2026-09',breakdown:{version:1,period:'2026-09',dueOn:'2026-09-01',policy:'full_month',gross:350,discount:0,net:350,manual:false,freeMonth:false}};
 const receiptNo='AQ-R-2026-00000001';
 const artifacts=rentReceiptArtifacts({contract,profile,due,receiptNo,contractReceiptSequence:1,onDate:'2026-09-14',method:'knet',transactionNo:'TX-1'});
 assert.equal(artifacts.receipt.id,receiptNo);
 assert.equal(artifacts.receipt.contractReceiptSequence,1);
 assert.equal(artifacts.ledger.contractReceiptSequence,1);
 assert.match(artifacts.record[7],/تسلسل الوصل داخل العقد: 1/);
 const manifest=executionManifest({contract,due,onDate:'2026-09-14',method:'knet',transactionNo:'TX-1',receiptNo,contractReceiptSequence:1,zeroReason:'',ids:{settlement:'11111111-1111-4111-8111-111111111111',document:'22222222-2222-4222-8222-222222222222',version:'33333333-3333-4333-8333-333333333333',event:'44444444-4444-4444-8444-444444444444'}});
 assert.equal(manifest.rentReceiptNo,receiptNo);
 assert.equal(manifest.contractReceiptSequence,1);
});

test('zero-rent execution cannot carry a fake receipt sequence',()=>{
 const contract={id:'contract-2',status:'signed',tenantId:'tenant-2',property:'برج',unit:'4',contract_no:'AQ-C-2026-000002'};
 const due={rent:0,deposit:0,advance:0,fees:0,total:0};
 assert.throws(()=>executionManifest({contract,due,onDate:'2026-09-14',method:'none',transactionNo:'',receiptNo:'',contractReceiptSequence:1,zeroReason:'فترة مجانية',ids:{settlement:'1',document:'2',version:'3',event:'4'}}),/وصلاً وهميًا|تسلسل وصل/);
});
