import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextContractSerial,executionAmount,activeUnitConflict,completeTenantIdentity} from '../src/v267/domain/contract-foundation.js';

test('contract serial advances across saved and preparation records',()=>{
 assert.equal(nextContractSerial(2026,[{contract_no:'AQ-C-2026-000002'}],[{contractNo:'AQ-C-2026-000004'}]),'AQ-C-2026-000005');
 assert.equal(nextContractSerial(2027,[{contract_no:'AQ-C-2026-999999'}],[]),'AQ-C-2027-000001');
});

test('execution amount keeps rent deposit advance and fees separate',()=>{
 assert.deepEqual(executionAmount({firstRent:'350.125',deposit:'200',advance:'50',fees:'10.500'}),{firstRent:350.125,deposit:200,advance:50,fees:10.5,total:610.625});
 assert.equal(executionAmount({firstRent:0,deposit:0,advance:0,fees:0}).total,0);
});

test('active unit overlap is blocked while cancelled contracts do not block',()=>{
 const contracts=[
  {id:'a',property:'برج أ',unit:'3',start_date:'2026-01-01',end_date:'2026-12-31',status:'signed',contract_no:'A-1'},
  {id:'b',property:'برج أ',unit:'4',start_date:'2026-01-01',end_date:'2026-12-31',status:'cancelled',contract_no:'A-2'}
 ];
 assert.equal(activeUnitConflict(contracts,{id:'x',property:'برج أ',unit:'3',start_date:'2026-06-01',end_date:'2027-05-31'})?.contract_no,'A-1');
 assert.equal(activeUnitConflict(contracts,{id:'x',property:'برج أ',unit:'4',start_date:'2026-06-01',end_date:'2027-05-31'}),null);
 assert.equal(activeUnitConflict(contracts,{id:'x',property:'برج أ',unit:'3',start_date:'2027-01-01',end_date:'2027-12-31'}),null);
});

test('new tenant identity requires complete Arabic and English identity',()=>{
 const valid={nameAr:'أحمد محمد',nameEn:'Ahmed Mohammed',civilId:'123456789012',passportNo:'P123',phone:'+96550000000',email:'tenant@example.com',nationality:'كويتي',nationalityEn:'Kuwaiti'};
 assert.equal(completeTenantIdentity(valid),true);
 assert.equal(completeTenantIdentity({...valid,nationalityEn:''}),false);
 assert.equal(completeTenantIdentity({...valid,email:'bad'}),false);
});


test('contract foundation keeps cancelled preparation as audited history instead of deleting it',()=>{
 const source=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
 assert.match(source,/async function cancelPreparation\(\)/);
 assert.match(source,/status:'cancelled'/);
 assert.match(source,/cancelledAt:now/);
 assert.match(source,/cancelledBy:d\.session\.bound\.user/);
 assert.match(source,/cancelReason:'إلغاء مسودة تأسيس غير مكتملة من شاشة العقد'/);
 assert.match(source,/إلغاء مسودة تأسيس عقد/);
 assert.match(source,/cancelDraft\.className='danger'/);
 assert.doesNotMatch(source,/contractPreparationDraftsV267=.*filter\([^\n]*id!==id/);
});
