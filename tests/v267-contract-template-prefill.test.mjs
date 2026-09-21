import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolveRentalDocumentContext,linkedDocumentFieldKeys} from '../src/v267/domain/rental-document-cycle.js';

const source=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('  function templateSourceValues(){'),source.indexOf('  async function refreshTemplateSource()'));
function fixture(){
 const context={resolveRentalDocumentContext,linkedDocumentFieldKeys,templateMaster:null,existing:null,id:'new-contract',tenant:{value:'tenant-a'},selectedPropertyId:'property-a',property:{value:'property-a'},unit:{value:'unit-a'},api:{kuwaitDate:()=> '2026-09-20'},properties:[{id:'property-a',name:'Property',metadata:{source_owner:'Stored owner'}}],units:[{id:'unit-a',property_id:'property-a',unit_no:'1'}],data:{tenantProfilesV267:[{id:'tenant-a',nameAr:'Tenant A',civilId:'123456789012',nationality:'Country A'},{id:'tenant-b',nameAr:'Tenant B',civilId:'212345678901',nationality:'Country B'}]},controls:{contract_no:{value:'C-1'},contractRent:{value:'350.125'},start_date:{value:'2026-09-01'},end_date:{value:'2027-08-31'},floor:{value:'0'}}};
 vm.createContext(context);vm.runInContext(block+';this.read=templateSourceValues',context);return context;
}
test('new contract template pulls current main-form identity, dates, original rent and saved owner',()=>{
 const f=fixture(),values=f.read();
 assert.equal(values.tenant_name,'Tenant A');assert.equal(values.tenant_civil_id,'123456789012');assert.equal(values.civil_id,'123456789012');assert.equal(values.owner_name,'Stored owner');assert.equal(values.unit_no,'1');assert.equal(values.floor_no,'0');assert.equal(values.monthly_rent,'350.125');assert.equal(values.contract_no,'C-1');assert.equal(values.contract_date,'2026-09-20');
});
test('switching tenant or clearing unit cannot retain prior identity in template controls',()=>{
 const f=fixture();f.read();f.tenant.value='tenant-b';let values=f.read();assert.equal(values.tenant_name,'Tenant B');assert.equal(values.civil_id,'212345678901');
 f.unit.value='';values=f.read();assert.equal(values.tenant_name,'');assert.equal(values.unit_no,'');assert.equal(values.monthly_rent,'');
});
test('same property name cannot change UUID binding and a forged property or absent tenant is rejected',()=>{
 const f=fixture();f.properties.push({id:'property-b',name:'Property'});assert.equal(f.read().owner_name,'Stored owner');f.property.value='property-b';assert.equal(f.read().owner_name,'');f.property.value='property-a';f.tenant.value='missing';assert.equal(f.read().tenant_name,'');
});

test('saved owner and automatic unit data from the authoritative property master prefill the model',()=>{
 const f=fixture();f.properties[0].metadata=[];f.templateMaster={property:{id:'property-a',owners:[{name:'Master owner'}]},unit:{id:'unit-a',propertyId:'property-a',automaticRef:'91810001'}};const values=f.read();assert.equal(values.owner_name,'Master owner');assert.equal(values.unit_automatic_no,'91810001');
});

test('source enrichment reads only the selected property/unit and rejects cross-workspace context',async()=>{
 for(const mismatch of [false,true]){
  const f=fixture(),calls=[];f.templateBindingKey='';f.templatePicker={setValues:values=>calls.push(values)};f.d={session:{bound:{workspace:'workspace',user:'manager'},check(){}}};
  f.rpc=async(name,args)=>{assert.equal(name,'aqari_property_contract_context');assert.equal(args.p_property_id,'property-a');assert.equal(args.p_unit_id,'unit-a');return {workspace_id:mismatch?'other':'workspace',user_id:'manager',property:{id:'property-a',owners:[{name:'Bound owner'}]},unit:{id:'unit-a',propertyId:'property-a'}};};
  vm.runInContext(source.slice(source.indexOf('  async function refreshTemplateSource(){'),source.indexOf('  function tenantInfo()'))+';this.refresh=refreshTemplateSource',f);
  if(mismatch){await assert.rejects(f.refresh(),/تأكيد/);assert.equal(f.templateMaster,null);}else{await f.refresh();assert.equal(calls.at(-1).owner_name,'Bound owner');}
 }
});
