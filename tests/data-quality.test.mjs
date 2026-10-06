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
