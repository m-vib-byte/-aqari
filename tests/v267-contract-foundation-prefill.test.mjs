import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {foundationTemplateValues,isFoundationContractTemplate} from '../src/v267/domain/contract-foundation.js';
import {linkedDocumentFieldKeys} from '../src/v267/domain/rental-document-cycle.js';

const source=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
const control=value=>({value});
function fixture(){
 const preparation={status:'preparation',id:'draft-a',contractNo:'AQ-C-2026-000001',tenantId:'tenant-a',propertyId:'property-a',property:'Same building name',unitId:'unit-a',unit:'1'};
 const state={tenantProfilesV267:[{id:'tenant-a',nameAr:'Saved tenant',civilId:'123456789012',nationality:'Saved nationality'},{id:'tenant-b',nameAr:'Another tenant',civilId:'212345678901',nationality:'Other nationality'}]};
 const properties=[{id:'property-a',name:'Same building name'},{id:'property-b',name:'Same building name'}],units=[{id:'unit-a',property_id:'property-a',unit_no:'1'},{id:'unit-b',property_id:'property-b',unit_no:'1'}];
 const master={workspace_id:'workspace',user_id:'manager',property:{id:'property-a',name:'Same building name',owners:[{name:'Saved owner'}]},unit:{id:'unit-a',propertyId:'property-a',floor:'0',automaticRef:'91810001'},binding:{}};
 const f={translateStatic:value=>value,foundationTemplateValues,linkedDocumentFieldKeys,preparation,state,properties,units,templateMaster:master,tenantChoice:control('tenant-a'),property:control('property-a'),unit:control('unit-a'),floor:control('0'),startDate:control('2026-09-01'),endDate:control('2027-08-31'),rent:control('350.125'),deposit:control('0'),advance:control('15'),fees:control('10'),accountant:control('Saved accountant'),api:{kuwaitDate:()=> '2026-09-22'},d:{session:{bound:{workspace:'workspace',user:'manager'},check(){}}}};
 vm.createContext(f);
 const block=source.slice(source.indexOf('  function selectedBindingMatches(){'),source.indexOf('  tenantChoice.onchange=()=>{fillTenant();'));
 f.templateSelect=control('template-a');f.templates=[{id:'template-a',kind:'shop'}];preparation.kind='shop';f.templateFieldsBox={};f.templateFieldControls={setValues(){}};f.readBinding=async()=>master;f.d.run=fn=>fn();
 f.mountTemplateFields=(box,selected,values,options)=>{f.mounted={box,selected,values,options};return {values:()=>values,setValues(next){f.mounted.values=next;}};};
 vm.runInContext(block+';this.read=templateSourceValues;this.assertBinding=assertSelectedBinding;',f);
 return f;
}

test('foundation template uses saved identity, explicit IDs, reserved number and current financial/date controls',()=>{
 const f=fixture(),values=f.read();
 assert.equal(values.tenant_name,'Saved tenant');assert.equal(values.civil_id,'123456789012');assert.equal(values.tenant_nationality,'Saved nationality');
 assert.equal(values.owner_name,'Saved owner');assert.equal(values.property_name,'Same building name');assert.equal(values.unit_no,'1');assert.equal(values.floor_no,'0');assert.equal(values.unit_automatic_no,'91810001');
 assert.equal(values.contract_no,'AQ-C-2026-000001');assert.equal(values.monthly_rent,'350.125');assert.equal(values.deposit_amount,'0');assert.equal(values.start_date,'2026-09-01');assert.equal(values.contract_date,'2026-09-22');
 f.rent.value='450.500';f.startDate.value='2026-10-01';f.accountant.value='New accountant';
 assert.equal(f.read().monthly_rent,'450.500');assert.equal(f.read().start_date,'2026-10-01');assert.equal(f.read().accountant_name,'New accountant');
});

test('changed visible tenant/property/unit clears ALL linked fields and blocks review or submission until saved',()=>{
 for(const [field,value]of [['tenantChoice','tenant-b'],['property','property-b'],['unit','unit-b']]){
  const f=fixture();f[field].value=value;
  assert.ok(linkedDocumentFieldKeys.every(key=>f.read()[key]===''));
  assert.throws(()=>f.assertBinding(),/احفظ اختيار المستأجر/);
 }
 const f=fixture();f.preparation.propertyId=null;assert.throws(()=>f.assertBinding(),/احفظ/);assert.equal(f.read().tenant_name,'');
});

test('template selection locks canonical and alias fields while enriching authoritative owner data',async()=>{
 const f=fixture();f.templateMaster=null;assert.equal(f.read().owner_name,'');
 await f.templateSelect.onchange();
 assert.equal(f.mounted.selected.id,'template-a');assert.equal(f.mounted.values.owner_name,'Saved owner');assert.equal(f.mounted.values.civil_id,'123456789012');
 assert.equal(f.mounted.options.lockedKeys,linkedDocumentFieldKeys);
});

test('source resolver refuses name-only, cross-property, missing-tenant and duplicated identity joins',()=>{
 const f=fixture(),sources={properties:f.properties,units:f.units,workspaceId:'workspace'};
 assert.throws(()=>foundationTemplateValues(f.state,{...f.preparation,propertyId:null},{},sources),/احفظ ربط/);
 assert.throws(()=>foundationTemplateValues(f.state,{...f.preparation,unitId:'unit-b'},{},sources),/يتطابق/);
 assert.throws(()=>foundationTemplateValues(f.state,{...f.preparation,tenantId:'missing'},{},sources),/ملف المستأجر/);
 assert.throws(()=>foundationTemplateValues({...f.state,tenantProfilesV267:[...f.state.tenantProfilesV267,{...f.state.tenantProfilesV267[0]}]},f.preparation,{},sources),/تعارض معرّفات/);
});

test('promotion regenerates linked clauses from latest saved state instead of stale or manually supplied identity',async()=>{
 const f=fixture();const current=structuredClone(f.state);current.tenantProfilesV267[0].nameAr='Latest saved tenant';current.contractPreparationDraftsV267=[{...f.preparation}];
 let passed;
 Object.assign(f,{completeTenantIdentity:()=>true,templateForContract:(template,values)=>{passed=values;return {clauses:[{title:'Identity',text:values.tenant_name+' / '+values.owner_name}]};},activeUnitConflict:()=>null,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),changeState:async mutate=>mutate(current)});
 f.api.lease=value=>value;f.api.directoryFields=()=>({});
 const block=source.slice(source.indexOf(' async function promoteContract('),source.indexOf(' async function start(){'));
 vm.runInContext(block+';this.promote=promoteContract;',f);
 const result=await f.promote({contractRent:'400',floor:'0'},{id:'template-a'},{tenant_name:'Injected tenant',owner_name:'Injected owner',amount:'999',custom_clause:'Kept custom value'},f.templateMaster);
 assert.equal(passed.tenant_name,'Latest saved tenant');assert.equal(passed.owner_name,'Saved owner');assert.equal(passed.custom_clause,'Kept custom value');assert.equal(passed.amount,'');
 assert.equal(result.clauses[0].text,'Latest saved tenant / Saved owner');assert.equal(result.propertyId,'property-a');assert.equal(result.unitId,'unit-a');
});

test('receipt/handover/eviction/clearance publications cannot be offered as new contract types',()=>{
 for(const kind of ['rent_receipt','apartment_handover','eviction','owner_final_clearance'])assert.equal(isFoundationContractTemplate({kind}),false);
 for(const kind of ['rental_agreement','apartment','house','shop','custom-office'])assert.equal(isFoundationContractTemplate({kind}),true);
});

test('stale preparation cannot resurrect cancellation, overwrite a contract or replace another session binding',async()=>{
 for(const alter of [data=>data.contractPreparationDraftsV267[0].status='cancelled',data=>data.contractPreparationDraftsV267[0].status='promoted',data=>data.contractPreparationDraftsV267[0].unitId='unit-b',data=>data.contractPreparationDraftsV267[0].updatedAt='newer',data=>data.contractsV202=[{id:'draft-a',status:'signed',clauses:[{text:'Original unchanged contract'}]}],data=>data.contractPreparationDraftsV267=[]]){
  const f=fixture(),current=structuredClone(f.state);current.contractPreparationDraftsV267=[{...f.preparation}];alter(current);const before=structuredClone(current);
  f.same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);f.changeState=async mutate=>mutate(current);
  vm.runInContext(source.slice(source.indexOf(' async function promoteContract('),source.indexOf(' async function start(){'))+';this.promote=promoteContract;',f);
  await assert.rejects(f.promote({},null,{},f.templateMaster),/تغيرت مسودة|سبق تثبيت/);assert.deepEqual(current,before);
 }
});

test('preparation edits and cancellation reject closed or newer drafts without touching saved data',async()=>{
 for(const action of ['patch','cancel'])for(const alter of [row=>row.status='cancelled',row=>row.status='promoted',row=>row.tenantId='tenant-b',row=>row.unitId='unit-b',row=>row.updatedAt='newer']){
  const f=fixture(),current={contractPreparationDraftsV267:[structuredClone(f.preparation)],audit:[['Existing audit']]};alter(current.contractPreparationDraftsV267[0]);const before=structuredClone(current);
  Object.assign(f,{copy:structuredClone,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{confirm:()=>true},changeState:async mutate=>mutate(current),start:async()=>{throw Error('Must not navigate after rejection');}});
  vm.runInContext(source.slice(source.indexOf(' async function patchPreparation('),source.indexOf(' async function saveTenant('))+';this.patch=patchPreparation;this.cancel=cancelPreparation;',f);
  await assert.rejects(action==='patch'?f.patch({tenantId:'tenant-a'}):f.cancel(),/تغيرت مسودة/);assert.deepEqual(current,before);
 }
});

test('unchanged preparation still saves an explicit edit and retains an audited cancelled record',async()=>{
 const f=fixture(),current={contractPreparationDraftsV267:[structuredClone(f.preparation)]};let navigated=0;
 Object.assign(f,{copy:structuredClone,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{confirm:()=>true},changeState:async mutate=>mutate(current),start:async()=>{navigated++;}});
 vm.runInContext(source.slice(source.indexOf(' async function patchPreparation('),source.indexOf(' async function saveTenant('))+';this.patch=patchPreparation;this.cancel=cancelPreparation;',f);
 await f.patch({floor:'3'});assert.equal(current.contractPreparationDraftsV267[0].floor,'3');assert.equal(current.contractPreparationDraftsV267[0].status,'preparation');assert.equal(current.audit.length,1);
 await f.cancel();assert.equal(current.contractPreparationDraftsV267.length,1);assert.equal(current.contractPreparationDraftsV267[0].status,'cancelled');assert.equal(current.audit.length,2);assert.equal(navigated,1);
});

test('authoritative property binding rejects foreign workspace, user, unit and property envelopes',async()=>{
 const f=fixture(),block=source.slice(source.indexOf(' async function readBinding('),source.indexOf(' async function verifyBinding'));
 let response=f.templateMaster;f.rpc=async()=>response;
 vm.runInContext(block+';this.binding=readBinding;',f);
 assert.equal((await f.binding('property-a','unit-a')).property.id,'property-a');
 for(const patch of [{workspace_id:'other'},{user_id:'other'},{property:{id:'property-b'}},{unit:{id:'unit-b',propertyId:'property-a'}},{unit:{id:'unit-a',propertyId:'property-b'}}]){
  response={...f.templateMaster,...patch};await assert.rejects(f.binding('property-a','unit-a'),/تأكيد ربط/);
 }
});

test('payment cycle selection accepts only explicit server-supported intervals',async()=>{
 const {foundationPaymentCycle}=await import('../src/v267/domain/contract-foundation.js');
 for(const n of [1,3,6,12])assert.equal(foundationPaymentCycle(String(n)),n);
 for(const n of ['',null,undefined,0,2,'01','monthly'])assert.throws(()=>foundationPaymentCycle(n),/دورية السداد/);
});

test('foundation promotion preserves each payment cycle through the real rental record engine',async()=>{
 const engine={module:{exports:{}},structuredClone};
 vm.runInNewContext(readFileSync(new URL('../v267-rental-records.js',import.meta.url),'utf8'),engine);
 for(const paymentCycleMonths of [1,3,6,12]){
  const f=fixture(),current=structuredClone(f.state);
  Object.assign(current.tenantProfilesV267[0],{nameEn:'Test tenant',passportNo:'TEST-ONLY',phone:'55555555',email:'test@example.invalid',nationalityEn:'Test'});
  current.properties=[['Same building name']];current.contractPreparationDraftsV267=[{...f.preparation}];
  Object.assign(f,{completeTenantIdentity:()=>true,templateForContract:()=>({clauses:[{title:'Test',text:'Synthetic only'}]}),activeUnitConflict:()=>null,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),changeState:async mutate=>mutate(current)});
  f.api={...engine.module.exports,kuwaitDate:()=> '2026-10-08'};
  vm.runInContext(source.slice(source.indexOf(' async function promoteContract('),source.indexOf(' async function start(){'))+';this.promote=promoteContract;',f);
  const result=await f.promote({paymentCycleMonths,contractRent:'100',discount:'0',deposit:'0',advance:'0',cleaningFee:'0',floor:'1',accountant:'Synthetic test',start_date:'2030-01-01',end_date:'2030-12-31',freeMonthApproved:false,freeMonthPeriod:'',rentEntitlement:{version:1,startDate:'2030-01-01',firstPeriodPolicy:'full_month',manualFirstPeriodAmount:null}}, {},{},f.templateMaster);
  assert.equal(result.paymentCycleMonths,paymentCycleMonths);assert.equal(result.rent,100);assert.equal(result.status,'draft');
  assert.equal(current.contractsV202[0].paymentCycleMonths,paymentCycleMonths);assert.equal(current.contractPreparationDraftsV267[0].status,'promoted');
  assert.equal(current.collections,undefined);
 }
});
