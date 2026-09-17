import test from 'node:test';
import assert from 'node:assert/strict';
import {prepaidBatchManifest,prepaidReceiptArtifacts} from '../src/v267/domain/prepaid-rent.js';

const batchId='11111111-1111-4111-8111-111111111111';
const leaseId='22222222-2222-4222-8222-222222222222';
const operationRef='33333333-3333-4333-8333-333333333333';
const contract={id:'c1',contract_no:'AQ-C-2026-000001',status:'signed',tenant:'مستأجر',property:'عقار',unit:'1'};
const profile={id:'t1',nameEn:'Tenant'};
const api={entitlementBreakdown:()=>({net:100}),entitlementDueOn:()=> '2026-10-01'};

test('prepaid receipt artifacts require an exact canonical month-start period',()=>{
 const base={api,contract,profile,periodRow:{period:'2026-10-01',due_amount:100,balance:100},allocation:{period:'2026-10-01',amount:50,balanceBefore:100},receiptNo:'AQ-R-2026-00000001',contractReceiptSequence:1,paidAt:'2026-09-15',method:'knet',transactionNo:'KNET-1',batchId};
 assert.equal(prepaidReceiptArtifacts(base).ledger.period,'2026-10');
 assert.throws(()=>prepaidReceiptArtifacts({...base,periodRow:{...base.periodRow,period:'2026-10-01T00:00:00Z'}}),/الفترة غير مكتملة/);
 assert.throws(()=>prepaidReceiptArtifacts({...base,allocation:{...base.allocation,period:'2026-10-01-extra'}}),/الفترة غير مكتملة/);
 assert.throws(()=>prepaidReceiptArtifacts({...base,periodRow:{...base.periodRow,period:'2026-13-01'},allocation:{...base.allocation,period:'2026-13-01'}}),/الفترة غير مكتملة/);
});

test('prepaid batch manifest rejects non-canonical or impossible allocation periods instead of truncating them',()=>{
 const allocation={operationRef,period:'2026-10-01',amount:100,receiptNo:'AQ-R-2026-00000001',contractReceiptSequence:1};
 const base={id:batchId,contract,leaseId,method:'bank',transactionNo:'BANK-100',paidAt:'2026-09-15',total:100,allocations:[allocation]};
 assert.equal(prepaidBatchManifest(base).allocations[0].period,'2026-10-01');
 assert.throws(()=>prepaidBatchManifest({...base,allocations:[{...allocation,period:'2026-10-01T00:00:00Z'}]}),/توزيع الدفعة المقدمة غير مكتملة/);
 assert.throws(()=>prepaidBatchManifest({...base,allocations:[{...allocation,period:'2026-00-01'}]}),/توزيع الدفعة المقدمة غير مكتملة/);
});
