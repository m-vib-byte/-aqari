import test from 'node:test';
import assert from 'node:assert/strict';
import {kuwaitDay,readManagementCounters} from '../src/v267/components/management-counters.js';

function fixture({permissions={},countOverride,failAt,denyAfter=false,role='general_manager'}={}) {
 const calls=[];let accessReads=0,inFlight=0,maxInFlight=0,closed=false;
 const day='2026-09-13',lease=(id,end,status='signed',start='2026-01-01',workspace_id='w')=>({id,workspace_id,start_date:start,end_date:end,status});
 const rows={
  aqari_properties:[{id:'p',workspace_id:'w',metadata:{}},{id:'source',workspace_id:'w',metadata:{source_only:true}},{id:'foreign',workspace_id:'other',metadata:{}}],
  aqari_tenants:Array.from({length:1501},(_,i)=>({id:'t'+i,workspace_id:'w'})),
  aqari_leases:[lease('today',day),lease('day30','2026-10-13'),lease('day31','2026-10-14'),lease('day60','2026-11-12'),lease('day61','2026-11-13'),lease('day90','2026-12-12'),lease('day91','2026-12-13'),lease('old','2026-09-12'),lease('explicit-expired','2026-09-12','expired'),lease('draft','2027-01-01','draft'),lease('ready','2027-01-01','ready'),lease('approved','2027-01-01','approved'),lease('signing','2027-01-01','signing'),lease('cancelled','2026-09-20','cancelled'),lease('future','2026-10-01','signed','2026-09-14'),lease('foreign','2026-09-20','signed','2026-01-01','other')],
  aqari_maintenance_requests:['received','assigned','in_progress','completed','cancelled'].map((status,i)=>({id:'m'+i,workspace_id:'w',status}))
 };
 const access=()=>({user_id:'u',workspace_id:'w',role,features:{kpi_dashboard:true},permissions:{finance:{read:true},...Object.fromEntries(['properties','tenants','contracts','maintenance'].map(k=>[k,{read:true}])),...permissions}});
 class Query {
  constructor(table){this.table=table;this.filters=[];}
  select(columns,options){assert.equal(columns,'id');assert.deepEqual(options,{count:'exact',head:true});return this;}
  eq(k,v){this.filters.push(r=>r[k]===v);if(k==='workspace_id')assert.equal(v,'w');return this;}
  or(expression){assert.equal(expression,'metadata->>source_only.is.null,metadata->>source_only.neq.true');this.filters.push(r=>r.metadata?.source_only!==true);return this;}
  in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
  lte(k,v){this.filters.push(r=>r[k]<=v);return this;}
  gte(k,v){this.filters.push(r=>r[k]>=v);return this;}
  lt(k,v){this.filters.push(r=>r[k]<v);return this;}
  async abortSignal(signal){
   calls.push(this.table);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
   await new Promise(resolve=>setTimeout(resolve,1));inFlight--;
   if(signal.aborted)throw Error('aborted');
   if(failAt===calls.length)return {error:{message:'failed'},status:503,count:null};
   return {data:null,error:null,count:countOverride===undefined?rows[this.table].filter(r=>this.filters.every(f=>f(r))).length:countOverride};
  }
 }
 const client={from:table=>new Query(table),rpc(name,args){assert.equal(name,'aqari_workspace_access');assert.deepEqual(args,{p_workspace_id:'w'});return {abortSignal:async()=>{accessReads++;const data=access();if(denyAfter&&accessReads>1)data.permissions.contracts.read=false;return {data};}};}};
 const session={bound:{user:'u',workspace:'w',role},client,check(){if(closed)throw Error('closed');},async request(query){this.check();const result=await query.abortSignal(new AbortController().signal);this.check();if(result.error)throw Object.assign(Error(result.error.message),result.error,{status:result.status});return result.data;}};
 return {session,calls,close:()=>closed=true,max:()=>maxInFlight,accessReads:()=>accessReads};
}

test('Kuwait date crosses midnight correctly and rejects invalid timestamps',()=>{
 assert.equal(kuwaitDay('2026-12-31T21:00:00Z'),'2027-01-01');
 assert.equal(kuwaitDay('2026-09-12T20:59:59Z'),'2026-09-12');
 assert.throws(()=>kuwaitDay('invalid'));
});

test('saved counts cover the complete dataset and disjoint 30/60/90 expiry boundaries',async()=>{
 const f=fixture(),r=await readManagementCounters(f.session,'2026-09-13');
 assert.deepEqual(Object.fromEntries(r.items.map(x=>[x.id,x.value])),{properties:1,tenants:1501,active_contracts:7,review_contracts:2,signature_contracts:2,expired_contracts:2,expiry_30:2,expiry_60:2,expiry_90:2,open_maintenance:3,unassigned_maintenance:1});
 assert.equal(f.calls.length,11);assert.equal(f.accessReads(),2);assert.ok(f.max()<=4);
});

test('unavailable sections are not queried or represented as zero',async()=>{
 const f=fixture({permissions:{contracts:{read:false},maintenance:{read:false}}}),r=await readManagementCounters(f.session,'2026-09-13');
 assert.deepEqual(r.items.map(x=>x.id),['properties','tenants']);
 assert.deepEqual(f.calls,['aqari_properties','aqari_tenants']);
});

test('role and finance permission are checked before any table request',async()=>{
 for(const options of [{role:'collector'},{permissions:{finance:{read:false}}}]){
  const f=fixture(options);await assert.rejects(readManagementCounters(f.session,'2026-09-13'),/ACCESS_DENIED/);assert.equal(f.calls.length,0);
 }
});

test('a changed server permission at readback rejects the entire report',async()=>{
 const f=fixture({denyAfter:true});await assert.rejects(readManagementCounters(f.session,'2026-09-13'),/ACCESS_DENIED/);
});

test('missing, string, negative or fractional counts never become zero',async()=>{
 for(const countOverride of [null,'4',-1,1.5,NaN]){
  const f=fixture({countOverride});await assert.rejects(readManagementCounters(f.session,'2026-09-13'),/تعذر التحقق/);
 }
 const f=fixture({countOverride:0});assert.ok((await readManagementCounters(f.session,'2026-09-13')).items.every(x=>x.value===0));
});

test('request failure and session closure are propagated without a partial report',async()=>{
 const f=fixture({failAt:4});await assert.rejects(readManagementCounters(f.session,'2026-09-13'),/failed/);
 const g=fixture();g.close();await assert.rejects(readManagementCounters(g.session,'2026-09-13'),/closed/);
});

test('date validation fails before issuing any request and handles leap-year arithmetic',async()=>{
 const f=fixture();await assert.rejects(readManagementCounters(f.session,'2026-02-30'),/تاريخ/);assert.equal(f.accessReads(),0);
 const r=await readManagementCounters(f.session,'2028-02-29');assert.equal(r.asOf,'2028-02-29');
});
