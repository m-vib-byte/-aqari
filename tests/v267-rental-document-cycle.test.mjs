import test from 'node:test';
import assert from 'node:assert/strict';
import {documentTemplateBlueprints,linkedDocumentFieldKeys,validateTemplateFields,renderDocumentTemplate,resolveRentalDocumentContext,resolveDocumentSigners,fieldValue} from '../src/v267/domain/rental-document-cycle.js';

function fixture(){
 const tenant={id:'tenant-local',nameAr:'اسم المستأجر',nameEn:'Tenant Example',civilId:'123456789012',nationality:'كويتي',nationalityEn:'Kuwaiti',passportNo:'P1',phone:'50000000',email:'example@test.invalid'};
 const contract={id:'contract-local',contract_no:'AQ-C-2026-1',tenantId:tenant.id,propertyId:'property-db',unitId:'unit-db',property:'عقار محفوظ',unit:'101',floor:'1',start_date:'2026-09-01',end_date:'2027-08-31',writtenOn:'2026-08-30',contractRent:350.125,rent:300.125,deposit:0,advance:0,cleaningFee:0,accountant:'محاسب محفوظ'};
 const payload={contractsV202:[contract],tenantProfilesV267:[tenant]};
 const sources={workspaceId:'workspace-1',leases:[{id:'lease-db',workspace_id:'workspace-1',external_ref:contract.id,tenant_id:'tenant-db',unit_id:'unit-db',snapshot:contract}],tenants:[{id:'tenant-db',external_ref:tenant.id,profile:tenant,full_name:tenant.nameAr}],units:[{id:'unit-db',property_id:'property-db',unit_no:'101'}],properties:[{id:'property-db',external_ref:'property-local',name:'عقار محفوظ',metadata:{source_owner:'مالك المصدر',source_address:'عنوان المصدر'}}],propertyMasters:[{id:'property-db',name:'عقار محفوظ',owners:[{id:'owner-1',name:'مالك العقار',civilId:'222222222222'}],representative:{name:'وكيل مستقل',civilId:'333333333333'},address:'العنوان المحفوظ'}]};
 return {payload,sources,contract,tenant};
}
const makeTemplate=fields=>({title:'عنوان محفوظ',kind:'rental_agreement',fields,clauses:[{title:'البند الأصلي',text:fields.map(f=>'{{'+f.key+'}}').join(' / ')}]});
const field=(key,label=key,type='text',required=true)=>({key,label,type,required});

test('five independent blueprints follow document cycle order, with distinct signers and no user records',()=>{
 assert.deepEqual(documentTemplateBlueprints.map(x=>x.kind),['rental_agreement','apartment_handover','rent_receipt','eviction','owner_final_clearance']);
 for(const blueprint of documentTemplateBlueprints){
  assert.equal(blueprint.clauses,undefined);
  assert.equal(blueprint.id,undefined);
  assert.equal(blueprint.status,undefined);
  assert.equal(new Set(blueprint.fields.map(x=>x.key)).size,blueprint.fields.length);
  assert.ok(blueprint.signers.every(x=>x.nameKey&&x.signatureKey&&x.fingerprintKey));
 }
 assert.deepEqual(documentTemplateBlueprints[1].signers.map(x=>x.role),['tenant']);
 assert.deepEqual(documentTemplateBlueprints[2].signers.map(x=>x.role),['receiver','accountant']);
 assert.deepEqual(resolveDocumentSigners('custom-shop',{}).map(x=>x.role),['owner','tenant']);
 assert.ok(linkedDocumentFieldKeys.includes('civil_id'));
 assert.ok(!linkedDocumentFieldKeys.includes('handover_date'));
});

test('IDs resolve one common identity across every document with original contract rent and zero amounts',()=>{
 const {payload,sources}=fixture(),before=JSON.stringify({payload,sources});
 const context=resolveRentalDocumentContext(payload,{contractId:'contract-local'},sources);
 assert.deepEqual(context.links,{contractId:'contract-local',leaseId:'lease-db',tenantId:'tenant-local',propertyId:'property-db',unitId:'unit-db',receiptId:''});
 assert.equal(context.values.tenant_name,'اسم المستأجر');
 assert.equal(context.values.civil_id,context.values.tenant_civil_id);
 assert.equal(context.values.nationality,'كويتي');
 assert.equal(context.values.monthly_rent,'350.125');
 assert.equal(context.values.deposit_amount,'0');
 assert.equal(context.values.owner_name,'مالك العقار');
 assert.equal(context.values.representative_name,'وكيل مستقل');
 assert.equal(JSON.stringify({payload,sources}),before);
});

test('all supported state envelopes resolve and relational external IDs restore legacy bindings',()=>{
 for(const wrap of [data=>data,data=>({schema:'aqari-local-snapshot-v1',values:{aqari_v30:data}}),data=>({format:'aqari-cloud-state-v1',snapshot:{values:{aqari_v30:data}}})]){
  const {payload,sources,contract}=fixture();delete contract.propertyId;delete contract.unitId;
  const context=resolveRentalDocumentContext(wrap(payload),{contractId:'lease-db'},sources);
  assert.equal(context.links.unitId,'unit-db');assert.equal(context.links.contractId,'contract-local');
 }
});

test('unsaved form candidate resolves only explicit IDs without requiring a projected lease',()=>{
 const {payload,sources}=fixture();sources.leases=[];sources.tenants=[];
 assert.equal(resolveRentalDocumentContext(payload,{contractId:'contract-local'},sources).values.floor_no,'1');
});

test('name-only property, unit and tenant coincidences never bind records',()=>{
 const {payload,sources,contract}=fixture();sources.leases=[];delete contract.propertyId;delete contract.unitId;
 assert.throws(()=>resolveRentalDocumentContext(payload,{contractId:contract.id},sources),/ربط الوحدة/);
 contract.unitId='unit-db';contract.tenantId='other-tenant';payload.tenantProfilesV267.push({...payload.tenantProfilesV267[0],id:'unrelated'});
 assert.throws(()=>resolveRentalDocumentContext(payload,{contractId:contract.id},sources),/المستأجر/);
});

test('ambiguity and mismatched selected tenant, unit, property or workspace fail closed',()=>{
 for(const mutate of [
  f=>f.sources.units.push({...f.sources.units[0]}),
  f=>f.contract.unitId='another-unit',
  f=>f.contract.property_id='another-property',
  f=>f.sources.units[0].property_id='another-property',
  f=>f.sources.leases[0].workspace_id='another-workspace'
 ]){
  const f=fixture();mutate(f);assert.throws(()=>resolveRentalDocumentContext(f.payload,{contractId:'contract-local'},f.sources));
 }
 const f=fixture();assert.throws(()=>resolveRentalDocumentContext(f.payload,{contractId:'contract-local',tenantId:'other'},f.sources),/المستأجر المختار/);
});

test('tenant selection requires a unique contract and never silently picks newest lease',()=>{
 const f=fixture();assert.equal(resolveRentalDocumentContext(f.payload,{tenantId:'tenant-db'},f.sources).links.contractId,'contract-local');
 f.payload.contractsV202.push({...f.contract,id:'other-contract'});
 assert.throws(()=>resolveRentalDocumentContext(f.payload,{tenantId:'tenant-db'},f.sources),/أكثر من عقد/);
});

test('owner and representative stay separate; several owners do not silently select one',()=>{
 const f=fixture();f.sources.propertyMasters[0].owners.push({id:'owner-2',name:'مالك ثان'});
 let result=resolveRentalDocumentContext(f.payload,{contractId:'contract-local'},f.sources);
 assert.equal(result.values.owner_name,'');assert.equal(result.values.representative_name,'وكيل مستقل');
 f.contract.ownerId='owner-2';result=resolveRentalDocumentContext(f.payload,{contractId:'contract-local'},f.sources);
 assert.equal(result.values.owner_name,'مالك ثان');
 const signer=resolveDocumentSigners('owner_final_clearance',result.values)[0];
 assert.equal(signer.name,'وكيل مستقل');assert.equal(signer.label,'وكيل المالك المفوض');
 assert.equal(signer.signature,'');assert.equal(signer.fingerprint,'');
});

test('mixed array metadata is tolerated; real source_owner/source_address remain available under empty master',()=>{
 const f=fixture();f.sources.propertyMasters=[{id:'property-db',owner_name:'',address:'',owners:[]}];
 let result=resolveRentalDocumentContext(f.payload,{contractId:'contract-local'},f.sources);
 assert.equal(result.values.owner_name,'مالك المصدر');assert.equal(result.values.property_address,'عنوان المصدر');
 f.sources.properties[0].metadata=['display name','not a keyed owner'];result=resolveRentalDocumentContext(f.payload,{contractId:'contract-local'},f.sources);
 assert.equal(result.values.owner_name,'');
});

test('generic, unknown, malformed and duplicate variable definitions fail before final preview',()=>{
 for(const template of [
  makeTemplate([field('field_name')]),makeTemplate([field('tenant_name'),field('tenant_name')]),makeTemplate([field('civil_id'),field('tenant_civil_id')]),
  {...makeTemplate([field('tenant_name')]),clauses:[{title:'عنوان',text:'{{unknown_field}}'}]},
  {...makeTemplate([field('tenant_name')]),clauses:[{title:'عنوان',text:'{(tenant_name}}'}]},
  {...makeTemplate([field('tenant_name')]),title:'{{unknown_title}}'}
 ])assert.throws(()=>validateTemplateFields(template));
});

test('renderer preserves wording and performs a single substitution pass including title',()=>{
 const template=makeTemplate([field('tenant_name'),field('owner_name')]);template.title='مستند {{owner_name}}';template.clauses[0].text='النص الأصلي: {{tenant_name}} — {{owner_name}}.';
 assert.throws(()=>renderDocumentTemplate(template,{tenant_name:'{{owner_name}}',owner_name:'المالك'}),/صحح القيمة الأصلية/);
 const result=renderDocumentTemplate(template,{tenant_name:'اسم {محفوظ} $&',owner_name:'المالك'});
 assert.equal(result.title,'مستند المالك');assert.equal(result.clauses[0].text,'النص الأصلي: اسم {محفوظ} $& — المالك.');
 assert.equal(result.values.tenant_name,'اسم {محفوظ} $&');assert.equal(result.values.representative_name,'');
});

test('legacy aliases fill automatically, contradictory aliases fail, required blanks block and structure previews show labels',()=>{
 const template=makeTemplate([field('civil_id','الرقم المدني'),field('nationality','الجنسية'),field('monthly_rent','الإيجار','money')]);
 const result=renderDocumentTemplate(template,{tenant_civil_id:'123456789012',tenant_nationality:'كويتي',monthly_rent:'350.125'});
 assert.equal(result.clauses[0].text,'123456789012 / كويتي / 350.125');
 assert.throws(()=>fieldValue({civil_id:'a',tenant_civil_id:'b'},'civil_id'),/تعارض/);
 assert.throws(()=>renderDocumentTemplate(template,{}),/أكمل الحقول المطلوبة/);
 assert.equal(renderDocumentTemplate(template,{}, {requireValues:false}).clauses[0].text,'«الرقم المدني» / «الجنسية» / «الإيجار»');
});

test('dates render consistently and invalid civil dates or excessive money precision are refused',()=>{
 const template=makeTemplate([field('start_date','بداية العقد','date'),field('monthly_rent','الإيجار','money')]);
 assert.equal(renderDocumentTemplate(template,{start_date:'2026-09-01',monthly_rent:0}).clauses[0].text,'01/09/2026 / 0.000');
 assert.throws(()=>renderDocumentTemplate(template,{start_date:'2026-02-30',monthly_rent:2}),/تاريخًا صحيحًا/);
 assert.throws(()=>renderDocumentTemplate(template,{start_date:'2026-09-01',monthly_rent:'2.1234'}),/ثلاثة منازل/);
});

function addReceipt(f){
 const record=['R-1','اسم المستأجر',300.125,'مدفوع','عقار محفوظ','2026-09-05','101','ملاحظة','2026-09','كي نت'];
 const ledger={receiptNo:'R-1',contractId:'contract-local',paid:300.125,paidAt:'2026-09-05',period:'2026-09',method:'كي نت',transactionNo:'TX-1',status:'مدفوع'};
 const receipt={id:'R-1',contract:{id:'contract-local'},record,transactionNo:'TX-1',accountant:'محاسب الوصل'};
 f.payload.rentLedgerV202=[ledger];f.payload.rentReceiptsV267=[receipt];
 f.sources.receipts=[{id:'payment-db',lease_id:'lease-db',reference:'R-1',amount:300.125,period:'2026-09-01',paid_at:'2026-09-05',status:'مدفوع',payment_method:'كي نت',record:ledger,receipt}];
 return f;
}

test('saved receipts link by receipt number or payment UUID; method is not mistaken for transaction reference',()=>{
 const f=addReceipt(fixture());
 for(const receiptId of ['R-1','payment-db']){
  const result=resolveRentalDocumentContext(f.payload,{contractId:'contract-local',receiptId},f.sources);
  assert.equal(result.values.receipt_no,'R-1');assert.equal(result.values.amount,'300.125');assert.equal(result.values.payment_method,'كي نت');assert.equal(result.values.payment_reference,'TX-1');assert.equal(result.values.accountant_name,'محاسب الوصل');
 }
});

test('receipt mismatch, ambiguous number, cancelled/unconfirmed state, and inconsistent amount all block preview',()=>{
 for(const mutate of [
  f=>f.payload.rentReceiptsV267[0].contract.id='other-contract',
  f=>f.sources.receipts[0].lease_id='other-lease',
  f=>f.sources.receipts.push({...f.sources.receipts[0],id:'other-payment'}),
  f=>f.sources.receipts[0].status='cancelled',
  f=>f.sources.receipts[0].status='pending',
  f=>f.sources.receipts[0].amount=25,
  f=>f.payload.rentReceiptsV267[0].record[3]='ملغى'
 ]){
  const f=addReceipt(fixture());mutate(f);assert.throws(()=>resolveRentalDocumentContext(f.payload,{contractId:'contract-local',receiptId:'R-1'},f.sources));
 }
});
