import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnitSearch,openSearchUnit} from '../src/v267/api/unit-search.js';

function harness({properties,units,respond}={}){
 const data={aqari_properties:properties??[{id:'p1',workspace_id:'w1',name:'برج الاختبار'}],aqari_units:units??[{id:'u101',workspace_id:'w1',property_id:'p1',unit_no:'101'}]};
 const calls=[];
 const context={user:{id:'a'},workspace:{id:'w1'},membership:{is_active:true,user_id:'a',workspace_id:'w1',role:'property_manager'}};
 const client={from(table){
  const call={table,filters:{}};calls.push(call);
  const q={select(columns){call.columns=columns;return q},eq(k,v){call.filters[k]=v;return q},order(k){call.order=k;return q},range(a,b){call.range=[a,b];return q},limit(n){call.limit=n;return q},abortSignal(signal){call.signal=signal;return q},then(ok,bad){
   return Promise.resolve().then(()=>respond?respond(call,data):{data:(data[table]||[]).filter(r=>Object.entries(call.filters).every(([k,v])=>r[k]===v)).slice(call.range?.[0]||0,call.range?call.range[1]+1:call.limit),error:null}).then(ok,bad);
  }};return q;
 }};
 globalThis.window={AQARI_SUPABASE:{context,getClient:async()=>client},AQARI_DATA_GATE:{scope:{userId:'a',workspaceId:'w1'}},AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'}};
 globalThis.document={documentElement:{classList:{contains:()=>true}}};
 return {calls,context};
}

test('reads unit identity without contracts, rents, or tenant details',async()=>{
 const h=harness();const result=await createUnitSearch().read();
 assert.deepEqual(result,[{propertyId:'p1',unitId:'u101',property:'برج الاختبار',unit:'101'}]);
 assert.deepEqual(h.calls.map(c=>c.table),['aqari_properties','aqari_units']);
 for(const c of h.calls){assert.deepEqual(c.filters,{workspace_id:'w1'});assert.equal(c.order,'id');assert.ok(c.signal);}
 assert.equal(h.calls[1].columns,'id,workspace_id,property_id,unit_no');
});
test('pages past 500 units and removes identities whose property was denied by RLS',async()=>{
 const units=Array.from({length:501},(_,i)=>({id:'u'+i,workspace_id:'w1',property_id:i===0?'denied':'p1',unit_no:String(i)}));
 const h=harness({units});const rows=await createUnitSearch().read();
 assert.equal(rows.length,500);assert.equal(rows.at(-1).unit,'500');
 assert.deepEqual(h.calls.filter(c=>c.table==='aqari_units').map(c=>c.range),[[0,499],[500,999]]);
});
test('denied/empty property rows cannot be joined into searchable units',async()=>{
 harness({properties:[]});assert.deepEqual(await createUnitSearch().read(),[]);
});
test('rejects unexpected workspace data and query errors instead of returning no results',async()=>{
 harness({respond:()=>({data:[{id:'p',workspace_id:'another'}],error:null})});
 await assert.rejects(createUnitSearch().read(),/نطاق/);
 harness({respond:()=>({data:null,error:{message:'ACCESS_DENIED'}})});
 await assert.rejects(createUnitSearch().read(),/ACCESS_DENIED/);
});
test('account change while reading discards the response',async()=>{
 const h=harness({respond:()=>{h.context.user.id='b';return {data:[],error:null}}});
 await assert.rejects(createUnitSearch().read(),/جلسة/);
});
test('close rejects an in-flight read even when provider ignores cancellation',async()=>{
 let started;const ready=new Promise(resolve=>{started=resolve});
 const h=harness({respond:()=>{started();return new Promise(()=>{})}});
 const job=createUnitSearch();const reading=job.read();await ready;job.close();
 await assert.rejects(reading,/جلسة/);assert.equal(h.calls[0].signal.aborted,true);
});
test('opening a moved or revoked unit does not open any property file',async()=>{
 const h=harness();await assert.rejects(openSearchUnit({unitId:'u101',propertyId:'wrong'}),/لم تعد الوحدة/);
 assert.deepEqual(h.calls[0].filters,{workspace_id:'w1',id:'u101',property_id:'wrong'});
});
