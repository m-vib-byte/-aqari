import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paymentCycleMonths,paymentCycleLabel} from '../src/v267/domain/payment-cycle.js';
import {allocatePrepaidAmount,prepaidBatchManifest,prepaidReceiptArtifacts} from '../src/v267/domain/prepaid-rent.js';
import {patchContractFoundation,patchRentalContracts,FOUNDATION_MARKER,CONTRACTS_MARKER} from '../src/v267/support/payment-cycle-patch.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('staging-database/sql/rent-payment-cycle-prepaid-20260915.sql');
const grandfather=read('staging-database/sql/rent-payment-cycle-grandfather-fix-20260915.sql');
const batchId='11111111-1111-4111-8111-111111111111';
const leaseId='22222222-2222-4222-8222-222222222222';
const operationRef='33333333-3333-4333-8333-333333333333';

test('payment cycle is explicit and limited to monthly quarterly semiannual annual',()=>{
 for(const n of [1,3,6,12])assert.equal(paymentCycleMonths(n),n);
 assert.equal(paymentCycleMonths(undefined,{historical:true}),1);
 assert.match(paymentCycleLabel(3),/3 أشهر/);
 assert.throws(()=>paymentCycleMonths(2),/دورة سداد/);
});

test('prepaid amount allocates FIFO across positive balances and supports a partial final month',()=>{
 const periods=[
  {period:'2026-10-01',due_amount:100,balance:40,due_on:'2026-10-01'},
  {period:'2026-11-01',due_amount:100,balance:100,due_on:'2026-11-01'},
  {period:'2026-12-01',due_amount:100,balance:100,due_on:'2026-12-01'}
 ];
 assert.deepEqual(allocatePrepaidAmount(periods,190,{maxPeriods:3}).map(x=>[x.period,x.amount]),[['2026-10-01',40],['2026-11-01',100],['2026-12-01',50]]);
 assert.throws(()=>allocatePrepaidAmount(periods,250,{maxPeriods:2}),/عدد الفترات المختارة/);
});

test('prepaid allocator rejects malformed, duplicate, out-of-order or silently truncated server schedules before reserving receipts',()=>{
 const october={period:'2026-10-01',due_amount:100,balance:100,due_on:'2026-10-01'};
 const november={period:'2026-11-01',due_amount:100,balance:100,due_on:'2026-11-01'};
 assert.throws(()=>allocatePrepaidAmount([november,october],50),/مرتبًا زمنياً/);
 assert.throws(()=>allocatePrepaidAmount([october,{...october,balance:50}],50),/فترة مكررة/);
 assert.throws(()=>allocatePrepaidAmount([{...october,period:'2026-10-15'}],50),/غير صالح/);
 assert.throws(()=>allocatePrepaidAmount([{...october,balance:'NaN'}],50),/غير صالح/);
 assert.throws(()=>allocatePrepaidAmount([{...october,due_amount:10.0009}],5),/غير صالح/);
 assert.throws(()=>allocatePrepaidAmount([october,november,{...october,balance:50}],50,{maxPeriods:2}),/عدد الفترات المختارة/);
});

test('prepaid batch manifest requires exact sum and server reservation identities',()=>{
 const contract={id:'c1',contract_no:'AQ-C-2026-000001'};
 const allocations=[{operationRef,period:'2026-10-01',amount:100,receiptNo:'AQ-R-2026-00000001',contractReceiptSequence:1}];
 const row=prepaidBatchManifest({id:batchId,contract,leaseId,method:'bank',transactionNo:'BANK-100',paidAt:'2026-09-15',total:100,allocations});
 assert.equal(row.total,100);assert.equal(row.transactionNo,'BANK-100');assert.equal(row.allocations.length,1);
 assert.throws(()=>prepaidBatchManifest({id:batchId,contract,leaseId,method:'bank',transactionNo:'BANK-100',paidAt:'2026-09-15',total:99,allocations}),/مجموع توزيع/);
 assert.throws(()=>prepaidBatchManifest({id:batchId,contract,leaseId,method:'bank',transactionNo:'BANK-100',paidAt:'2026-02-30',total:100,allocations}),/غير مكتملة/);
 assert.throws(()=>prepaidBatchManifest({id:batchId,contract,leaseId,method:'bank',transactionNo:'BANK-100',paidAt:'2026-09-15',total:200,allocations:[...allocations,{...allocations[0],amount:100}]}),/مكرر/);
});

test('prepaid receipt artifacts bind allocation to the freshly verified server period and balance',()=>{
 const api={entitlementBreakdown:()=>({net:100}),entitlementDueOn:()=> '2026-10-01'};
 const contract={id:'c1',contract_no:'AQ-C-2026-000001',status:'signed',tenant:'مستأجر',property:'عقار',unit:'1'};
 const profile={id:'t1',nameEn:'Tenant'};
 const periodRow={period:'2026-10-01',due_amount:100,balance:100};
 const allocation={period:'2026-10-01',amount:50,balanceBefore:100};
 const args={api,contract,profile,periodRow,allocation,receiptNo:'AQ-R-2026-00000001',contractReceiptSequence:1,paidAt:'2026-09-15',method:'knet',transactionNo:'KNET-1',batchId};
 const artifacts=prepaidReceiptArtifacts(args);
 assert.equal(artifacts.ledger.period,'2026-10');assert.equal(artifacts.ledger.balance,50);assert.equal(artifacts.ledger.prepaymentBatchId,batchId);
 assert.throws(()=>prepaidReceiptArtifacts({...args,allocation:{...allocation,period:'2026-11-01'}}),/الفترة غير مكتملة/);
 assert.throws(()=>prepaidReceiptArtifacts({...args,allocation:{...allocation,balanceBefore:90}}),/تغير رصيد الفترة/);
});

test('database keeps monthly entitlement ledger and exposes grouped installment cycle',()=>{
 assert.match(sql,/private\.aqari_payment_cycle_months/);
 assert.match(sql,/not in\(1,3,6,12\)/);
 assert.match(sql,/public\.aqari_rent_installment_schedule/);
 assert.match(sql,/private\.aqari_refresh_rent_due_schedule\(w,lid\)/);
 assert.match(sql,/sum\(due_amount\)/);
 assert.match(sql,/sum\(paid_amount\)/);
 assert.match(sql,/sum\(credit_amount\)/);
 assert.match(sql,/floor\(month_offset::numeric\/cycle\)/);
});

test('new contracts require cycle while historical approved contracts are grandfathered without retroactive mutation',()=>{
 assert.match(sql,/PAYMENT_CYCLE_REQUIRED/);
 assert.match(sql,/PAYMENT_CYCLE_LOCKED_AFTER_APPROVAL/);
 assert.match(grandfather,/old_raw='' and raw=''/);
 assert.match(grandfather,/PAYMENT_CYCLE_REQUIRED_BEFORE_APPROVAL/);
 assert.match(grandfather,/PAYMENT_CYCLE_LOCKED_AFTER_APPROVAL/);
});

test('prepaid batch is manager MFA guarded, bounded, reservation-backed and append-only',()=>{
 assert.match(sql,/private\.aqari_validate_prepaid_rent_batches/);
 assert.match(sql,/PREPAID_BATCH_IMMUTABLE/);
 assert.match(sql,/private\.aqari_require_sensitive_aal2/);
 assert.match(sql,/private\.aqari_rent_receipt_serial_reservations/);
 assert.match(sql,/PREPAID_ALLOCATION_EXCEEDS_BALANCE/);
 assert.match(sql,/PREPAID_RECEIPT_RESERVATION_MISMATCH/);
 assert.match(sql,/update private\.aqari_rent_receipt_serial_reservations set consumed_at=now\(\)/);
 assert.match(sql,/prepaid_rent_batch/);
});

test('build patch adds cycle fields to both contract entries and prepaid action only for signed contracts',()=>{
 const foundation=patchContractFoundation(read('src/v267/pages/contract-foundation.js'));
 const contracts=patchRentalContracts(read('src/v267/pages/rental-contracts.js'));
 assert.match(foundation,new RegExp(FOUNDATION_MARKER));assert.match(foundation,/دورة السداد/);assert.match(foundation,/paymentCycleMonths:paymentCycleMonths/);
 assert.match(contracts,new RegExp(CONTRACTS_MARKER));assert.match(contracts,/aqari_rent_installment_schedule/);assert.match(contracts,/دفعة إيجار مقدمة/);assert.match(contracts,/c\.status==='signed'/);
 assert.equal(patchContractFoundation(foundation),foundation);assert.equal(patchRentalContracts(contracts),contracts);
});
