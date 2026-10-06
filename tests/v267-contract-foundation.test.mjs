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

test('early release frees the next day while retaining the contractual end and inclusive release day',()=>{
 const original={id:'released',property:'برج أ',unit:'3',start_date:'2026-01-01',end_date:'2026-12-31',status:'expired',vacatedOn:'2026-06-30'};
 const candidate={id:'new',property:'برج أ',unit:'3',start_date:'2026-07-01',end_date:'2027-06-30'};
 for(const field of ['vacatedOn','vacated_on']){
  const old={...original};delete old.vacatedOn;old[field]='2026-06-30';
  assert.equal(activeUnitConflict([old],candidate),null);
  assert.equal(activeUnitConflict([old],{...candidate,start_date:'2026-06-30'}),old);
  assert.equal(activeUnitConflict([old],{...candidate,start_date:'2026-06-01'}),old);
  assert.equal(old.end_date,'2026-12-31','release must never rewrite the contractual end');
 }
});

test('expired status or an invalid release date cannot silently free the unit',()=>{
 const old={id:'old',property:'برج أ',unit:'3',start_date:'2026-01-01',end_date:'2026-12-31',status:'expired'};
 const candidate={id:'new',property:'برج أ',unit:'3',start_date:'2026-07-01',end_date:'2027-06-30'};
 for(const date of [undefined,'','invalid','2026-02-30','2025-12-31','2027-01-01']){
  const row={...old,vacatedOn:date};assert.equal(activeUnitConflict([row],candidate),row);
 }
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


test('source-only statement properties are excluded from contract property choices',()=>{
 const source=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
 assert.match(source,/from\('aqari_properties'\)[\s\S]*metadata->>source_only\.is\.null,metadata->>source_only\.neq\.true/);
});


test('historical statement-import drafts do not reserve the operational unit',()=>{
 const historical={id:'source-1',status:'draft',source:'statement-import',property:'برج شيخة',unit:'101',start_date:'2026-01-01',end_date:'2026-12-31',contract_no:'SRC-1'};
 const candidate={id:'new-1',property:'برج شيخة',unit:'101',start_date:'2026-06-01',end_date:'2027-05-31'};
 assert.equal(activeUnitConflict([historical],candidate),null);
 const ordinary={...historical,id:'draft-2',source:'v267-cloud',contract_no:'DRAFT-2'};
 assert.equal(activeUnitConflict([ordinary],candidate)?.contract_no,'DRAFT-2');
});


test('contract foundation uses a responsive workspace and queues draft autosaves without bypassing final validation',()=>{
 const source=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
 assert.match(source,/aq267-contract-foundation-workspace/);
 assert.match(source,/form\.noValidate=true/);
 assert.match(source,/const scheduleAutosave=/);
 assert.match(source,/await patchPreparation\(patch,'حفظ تلقائي لمسودة تأسيس العقد'\)/);
 assert.match(source,/await verifyBinding\(floor\.value\)/);
 assert.match(source,/if\(!preparation\.tenantId/);
});

test('signed-contract uploads provide a PDF drag-and-drop surface while keeping verified upload flow',()=>{
 const source=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8');
 assert.match(source,/aq267-contract-upload-dropzone/);
 assert.match(source,/drop\.ondrop=/);
 assert.match(source,/validateDocument\(chosen,26214400\)/);
 assert.match(source,/createVerifiedUpload\(d\.session/);
});
