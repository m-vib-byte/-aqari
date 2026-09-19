import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenancePayload,saveMaintenanceRequest} from '../src/v267/components/maintenance-request-create.js';
const input=()=>({id:'stable-id',scope:{user:'user',workspace:'workspace',role:'general_manager'},lease:{id:'lease',workspace_id:'workspace',tenant_id:'tenant',status:'signed',start_date:'2026-01-01',end_date:'2026-12-31'},today:'2026-09-19',category:'plumbing',description:'تسرب مياه من الحوض'});
test('constructs a classified zero-cost request for the exact active lease',()=>{
 const p=maintenancePayload(input());assert.equal(p.lease_id,'lease');assert.equal(p.tenant_id,'tenant');assert.equal(p.status,'received');assert.equal(p.cost,0);assert.equal(p.created_by,'user');assert.equal(p.category_code,'plumbing');assert.ok(Object.isFrozen(p));
});
test('rejects inactive, foreign-workspace, missing and expired leases',()=>{
 for(const patch of [{workspace_id:'other'},{status:'draft'},{start_date:'2027-01-01'},{end_date:'2026-09-18'},{tenant_id:null},{start_date:null}]){const x=input();Object.assign(x.lease,patch);assert.throws(()=>maintenancePayload(x));}
 const x=input();x.lease=null;assert.throws(()=>maintenancePayload(x));
});
test('rejects unsupported roles, historical categories and invalid descriptions',()=>{
 for(const role of ['viewer','accountant','tenant']){const x=input();x.scope.role=role;assert.throws(()=>maintenancePayload(x));}
 for(const category of ['legacy_unclassified','__proto__',''])assert.throws(()=>maintenancePayload({...input(),category}));
 for(const description of ['   ','1234','x'.repeat(3001)])assert.throws(()=>maintenancePayload({...input(),description}));
});
test('requires exact saved readback and returns the server request number',async()=>{
 const payload=maintenancePayload(input());let stored=null,inserts=0;
 const result=await saveMaintenanceRequest({payload,check(){},read:async()=>stored,insert:async p=>{inserts++;stored={...p,request_no:7};}});
 assert.equal(result.request_no,7);assert.equal(inserts,1);
});
test('recovers a committed insert with a lost response without inserting again',async()=>{
 const payload=maintenancePayload(input());let stored=null,inserts=0,reads=0;
 const deps={payload,check(){},read:async()=>{reads++;if(reads===2)throw Error('offline');return stored;},insert:async p=>{inserts++;stored={...p,request_no:8};throw Error('lost response');}};
 await assert.rejects(saveMaintenanceRequest(deps));
 assert.equal((await saveMaintenanceRequest(deps)).request_no,8);assert.equal(inserts,1);
});
test('an uncommitted network failure retries the same primary key',async()=>{
 const payload=maintenancePayload(input());let stored=null;const ids=[];
 const deps={payload,check(){},read:async()=>stored,insert:async p=>{ids.push(p.id);if(ids.length===1)throw Error('offline');stored={...p,request_no:9};}};
 await assert.rejects(saveMaintenanceRequest(deps));await saveMaintenanceRequest(deps);assert.deepEqual(ids,['stable-id','stable-id']);
});
test('never overwrites a mismatched row or reports a missing readback as success',async()=>{
 const payload=maintenancePayload(input());let writes=0;
 await assert.rejects(saveMaintenanceRequest({payload,check(){},read:async()=>({...payload,request_no:1,tenant_id:'someone-else'}),insert:async()=>writes++}));assert.equal(writes,0);
 await assert.rejects(saveMaintenanceRequest({payload,check(){},read:async()=>null,insert:async()=>{}}));
});
test('session changes during initial read prevent all writes',async()=>{
 let changed=false,writes=0;const payload=maintenancePayload(input());
 await assert.rejects(saveMaintenanceRequest({payload,check(){if(changed)throw Error('session changed');},read:async()=>{changed=true;return null;},insert:async()=>writes++}));assert.equal(writes,0);
});
test('permission denial never reports success',async()=>{
 const failure=Object.assign(Error('denied'),{code:'42501'});
 await assert.rejects(saveMaintenanceRequest({payload:maintenancePayload(input()),check(){},read:async()=>null,insert:async()=>{throw failure;}}),{code:'42501'});
});
