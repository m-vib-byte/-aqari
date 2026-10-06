import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectQuality} from '../src/v267/components/data-quality.mjs';
test('unit duplicate is property scoped and input remains unchanged',()=>{const data={units:[{id:'1',property_id:'a',unit_no:'401'},{id:'2',property_id:'b',unit_no:'401'},{id:'3',property_id:'a',unit_no:'401'}]};const before=JSON.stringify(data);assert.deepEqual(inspectQuality(data),[{kind:'duplicate_unit',ids:['1','3']}]);assert.equal(JSON.stringify(data),before);});
test('optional email and missing identifiers do not invent duplicates',()=>{assert.deepEqual(inspectQuality({tenants:[{id:'a',full_name:'A'},{id:'b',full_name:'B'}]}),[]);});
test('shared phone remains a candidate and draft dates remain pending',()=>{const results=inspectQuality({tenants:[{id:'a',full_name:'A',phone:'55 55'},{id:'b',full_name:'B',phone:'5555'}],leases:[{id:'c',status:'draft',start_date:null,end_date:null}]});assert.deepEqual(results.map(r=>r.kind),['shared_phone_review','draft_leases','pending_contract_dates']);});

test('operational properties without units are flagged while source-only properties are ignored',()=>{
 const results=inspectQuality({properties:[{id:'p1',metadata:{}},{id:'p2',metadata:{source_only:true}},{id:'p3',metadata:null}],units:[{id:'u1',property_id:'p3',unit_no:'1'}]});
 assert.deepEqual(results,[{kind:'property_without_units',ids:['p1']}]);
});

test('contract relationships distinguish empty links from references absent in the scan',()=>{
 const data={units:[{id:'u'}],tenants:[{id:'t',full_name:'Tenant'}],leases:[
  {id:'valid',unit_id:'u',tenant_id:'t',start_date:'2026-01-01',end_date:'2026-12-31'},
  {id:'empty',unit_id:null,tenant_id:'',start_date:'2026-01-01',end_date:'2026-12-31'},
  {id:'missing',unit_id:'elsewhere',tenant_id:'other',start_date:'2026-01-01',end_date:'2026-12-31'}
 ]};const before=structuredClone(data);
 assert.deepEqual(inspectQuality(data),[
  {kind:'lease_without_unit',ids:['empty']},{kind:'lease_unit_not_in_scan',ids:['missing']},
  {kind:'lease_without_tenant',ids:['empty']},{kind:'lease_tenant_not_in_scan',ids:['missing']}
 ]);assert.deepEqual(data,before);
});
test('multiple contracts may share a tenant and are not duplicate people or invalid links',()=>{
 const result=inspectQuality({units:[{id:'u1'},{id:'u2'}],tenants:[{id:'t',full_name:'Tenant'}],leases:['u1','u2'].map((unit_id,i)=>({id:'l'+i,unit_id,tenant_id:'t',start_date:'2026-01-01',end_date:'2026-12-31'}))});assert.deepEqual(result,[]);
});
test('a scan that did not request relationship fields makes no relationship claim',()=>{
 assert.deepEqual(inspectQuality({leases:[{id:'legacy',start_date:'2026-01-01',end_date:'2026-12-31'}]}),[]);
});
test('draft and historical contracts retain missing-link observations without being changed',()=>{
 const leases=['draft','ended','cancelled'].map((status,i)=>({id:'l'+i,status,unit_id:null,tenant_id:null}));
 const result=inspectQuality({leases});
 assert.deepEqual(result.find(x=>x.kind==='lease_without_unit')?.ids,['l0','l1','l2']);
 assert.deepEqual(result.find(x=>x.kind==='lease_without_tenant')?.ids,['l0','l1','l2']);
 assert.deepEqual(leases.map(l=>l.status),['draft','ended','cancelled']);
});

const documentFindings=data=>inspectQuality(data).filter(x=>x.kind.startsWith('document_'));
const targets={properties:[{id:'p',external_ref:'property-ref',metadata:{source_only:true}}],tenants:[{id:'t',external_ref:'tenant-ref',full_name:'Tenant'}],leases:[{id:'l',external_ref:'lease-ref',start_date:'2026-01-01',end_date:'2026-12-31'}]};
test('document links match exact external references within their declared entity type',()=>{
 const documents=[['property','property-ref'],['tenant','tenant-ref'],['lease','lease-ref']].map(([entity_type,entity_ref],i)=>({id:'d'+i,entity_type,entity_ref}));
 assert.deepEqual(documentFindings({...targets,documents}),[]);
 for(const entity_ref of ['p','tenant-ref','PROPERTY-REF',' property-ref '])assert.deepEqual(documentFindings({...targets,documents:[{id:'bad',entity_type:'property',entity_ref}]}),[{kind:'document_record_not_in_scan',ids:['bad']}]);
});
test('missing document links and unexamined entity types are separate observations',()=>{
 const documents=[{id:'no-ref',entity_type:'property',entity_ref:' '},{id:'no-type',entity_type:'',entity_ref:'x'},{id:'other',entity_type:'other',entity_ref:'x'}];
 assert.deepEqual(documentFindings({...targets,documents}),[{kind:'document_without_record_link',ids:['no-ref','no-type']},{kind:'document_scope_not_checked',ids:['other']}]);
});
test('duplicate external references do not falsely confirm a document link',()=>{
 const properties=[{id:'p1',external_ref:'shared'},{id:'p2',external_ref:'shared'}];
 assert.deepEqual(documentFindings({properties,documents:[{id:'d',entity_type:'property',entity_ref:'shared'}]}),[{kind:'document_ambiguous_record',ids:['d']}]);
});
test('omitted target data or external reference columns remain unexamined',()=>{
 const documents=[{id:'d',entity_type:'property',entity_ref:'p'}];
 for(const data of [{},{properties:[{id:'p'}]}])assert.deepEqual(documentFindings({...data,documents}),[{kind:'document_scope_not_checked',ids:['d']}]);
 assert.deepEqual(documentFindings({properties:[],documents}),[{kind:'document_record_not_in_scan',ids:['d']}]);
});
test('document observations preserve draft, uploaded and cancelled records and all input data',()=>{
 const data={...structuredClone(targets),documents:['draft','uploaded','cancelled'].map((status,i)=>({id:'d'+i,status,entity_type:'lease',entity_ref:'absent'}))},before=structuredClone(data);
 assert.deepEqual(documentFindings(data),[{kind:'document_record_not_in_scan',ids:['d0','d1','d2']}]);assert.deepEqual(data,before);
});

const paymentFindings=data=>inspectQuality(data).filter(x=>x.kind.startsWith('rent_payment_'));
const rentPayment={id:'pay',reference:'R-001',lease_id:'lease-id',payment_method:'cash',status:'paid'};
const rentLease={id:'lease-id',external_ref:'contract-reference',start_date:'2026-01-01',end_date:'2026-12-31'};
test('rent receipt references, lease identity and payment method are checked without monetary fields',()=>{
 assert.deepEqual(paymentFindings({leases:[rentLease],rentPayments:[rentPayment]}),[]);
 const rentPayments=[{...rentPayment,id:'missing',reference:' ',lease_id:null,payment_method:''}];
 assert.deepEqual(paymentFindings({leases:[rentLease],rentPayments}),[
  {kind:'rent_payment_without_reference',ids:['missing']},{kind:'rent_payment_without_method',ids:['missing']},{kind:'rent_payment_without_lease',ids:['missing']}
 ]);
});
test('rent payment links use the internal lease ID, not the contract external reference',()=>{
 assert.deepEqual(paymentFindings({leases:[rentLease],rentPayments:[{...rentPayment,lease_id:'contract-reference'}]}),[{kind:'rent_payment_lease_not_in_scan',ids:['pay']}]);
});
test('duplicate receipt references are review candidates across contracts and historical states',()=>{
 const rentPayments=[rentPayment,{...rentPayment,id:'cancelled',lease_id:'other-lease',status:'cancelled'}];
 const data={leases:[rentLease,{...rentLease,id:'other-lease'}],rentPayments},before=structuredClone(data);
 assert.deepEqual(paymentFindings(data),[{kind:'rent_payment_duplicate_reference',ids:['pay','cancelled']}]);assert.deepEqual(data,before);
});
test('missing receipt references do not form a duplicate group',()=>{
 const rentPayments=['a','b'].map(id=>({...rentPayment,id,reference:''}));
 assert.deepEqual(paymentFindings({leases:[rentLease],rentPayments}),[{kind:'rent_payment_without_reference',ids:['a','b']}]);
});
test('distinct receipt references on one lease remain separate legitimate payments',()=>{
 const rentPayments=[rentPayment,{...rentPayment,id:'second',reference:'R-002'}];assert.deepEqual(paymentFindings({leases:[rentLease],rentPayments}),[]);
});
test('omitted payment columns or lease scope cannot imply a verified relationship',()=>{
 assert.deepEqual(paymentFindings({rentPayments:[rentPayment]}),[{kind:'rent_payment_scope_not_checked',ids:['pay']}]);
 assert.deepEqual(paymentFindings({leases:[rentLease],rentPayments:[{id:'partial',reference:'R-001'}]}),[{kind:'rent_payment_scope_not_checked',ids:['partial']}]);
});
test('completed empty lease scope records a missing target without correcting it',()=>{
 assert.deepEqual(paymentFindings({leases:[],rentPayments:[rentPayment]}),[{kind:'rent_payment_lease_not_in_scan',ids:['pay']}]);
});
