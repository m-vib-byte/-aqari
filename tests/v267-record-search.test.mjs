import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordSearch,openSearchRecord} from '../src/v267/api/record-search.js';

function harness({rows={},permissions={},respond}={}){
 const context={user:{id:'a'},workspace:{id:'w'},membership:{user_id:'a',workspace_id:'w',role:'general_manager',is_active:true}};
 const data={aqari_tenants:[{id:'t',workspace_id:'w',full_name:'مستأجر مستقل',phone:'+965 5555-1234',civil_id:'289092312345'}],
  aqari_properties:[{id:'p',workspace_id:'w',name:'برج الاختبار'}],aqari_units:[{id:'u',workspace_id:'w',property_id:'p',unit_no:'204'}],
  aqari_leases:[{id:'l',workspace_id:'w',tenant_id:'t',unit_id:'u',contract_no:'OLD-2030',status:'vacated',start_date:'2020-01-01',end_date:'2021-01-01',monthly_rent:100}],...rows};
 const granted={user_id:'a',workspace_id:'w',role:'general_manager',permissions:{tenants:{read:true},contracts:{read:true},properties:{read:true},...permissions}};
 const calls=[],listeners=new Map();
 function query(call){
  calls.push(call);const q={select(c){call.columns=c;return q;},eq(k,v){call.filters[k]=v;return q;},order(k){call.order=k;return q;},range(a,b){call.range=[a,b];return q;},limit(n){call.limit=n;return q;},in(k,v){call.in=[k,v];return q;},abortSignal(s){call.signal=s;return q;},then(ok,bad){return Promise.resolve().then(()=>respond?.(call,data,granted)??{data:call.rpc?granted:(data[call.table]||[]).filter(r=>Object.entries(call.filters).every(([k,v])=>r[k]===v)&&(!call.in||call.in[1].includes(r[call.in[0]]))).slice(call.range?.[0]||0,call.range?call.range[1]+1:call.limit),error:null}).then(ok,bad);}};return q;
 }
 const client={from:table=>query({table,filters:{}}),rpc:(rpc,args)=>query({rpc,args,filters:{}})};
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.events=new Map();this.attrs={};this.value='';this.textContent='';this.classList={add(){}};this.dataset={};}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get options(){return this.children;}
  setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.events.set(k,f);}
  showModal(){}close(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 }
 globalThis.document={body:new Element('body'),head:new Element('head'),getElementById:()=>null,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'a',workspaceId:'w'}},AQARI_SUPABASE:{context,getClient:async()=>client},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 return {calls,data,context,granted,listeners,cleanup(){for(const el of [...document.body.children])el.children[0]?.onclick?.();}};
}

test('finds historical contracts and localized contact identifiers without any rent period',async()=>{
 for(const query of ['مستاجر','OLD-2030','٢٠٤','+٩٦٥ ٥٥٥٥-١٢٣٤','۲۸۹۰۹۲۳۱۲۳۴۵']){
  const h=harness(),rows=await createRecordSearch().read(query);
  assert.equal(rows.length,1);assert.equal(rows[0].kind,'directory-contract');assert.equal(rows[0].leaseId,'l');
  assert.doesNotMatch(JSON.stringify(rows),/5555|289092312345|civil_id|phone|monthly_rent|balance/);
  for(const c of h.calls.filter(c=>c.table)){assert.equal(c.filters.workspace_id,'w');assert.equal(c.order,'id');assert.ok(c.signal);assert.equal('period' in c.filters,false);}
 }
});
test('rejects partial civil identifiers and short phone queries',async()=>{
 for(const q of ['5555','28909231','289092312346']){harness();assert.deepEqual(await createRecordSearch().read(q),[]);}
});
test('finds tenant without a lease and respects section access before reading contracts',async()=>{
 const h=harness({permissions:{contracts:{read:false}},rows:{aqari_leases:[]}});
 const rows=await createRecordSearch().read('مستأجر');assert.equal(rows[0].kind,'directory-tenant');
 assert.deepEqual(h.calls.filter(c=>c.table).map(c=>c.table),['aqari_tenants']);
});
test('tenant denial or mismatched access identity stops before reading personal data',async()=>{
 for(const patch of [{permissions:{tenants:{read:false}}},{respond:call=>call.rpc?{data:{user_id:'other'},error:null}:undefined}]){
  const h=harness(patch);await assert.rejects(createRecordSearch().read('مستأجر'),/ACCESS_DENIED/);assert.equal(h.calls.some(c=>c.table),false);
 }
});
test('RLS-hidden property/unit relations never produce a contract search result',async()=>{
 for(const rows of [{aqari_properties:[]},{aqari_units:[]}]){harness({rows});assert.deepEqual(await createRecordSearch().read('OLD-2030'),[]);}
});
test('reads later pages and rejects foreign workspace or provider errors',async()=>{
 const tenants=Array.from({length:501},(_,i)=>({id:'t'+i,workspace_id:'w',full_name:i===500?'آخر مستأجر':'غير مطابق'}));
 const h=harness({rows:{aqari_tenants:tenants},permissions:{contracts:{read:false}}});
 assert.equal((await createRecordSearch().read('آخر'))[0].tenantId,'t500');
 assert.deepEqual(h.calls.filter(c=>c.table).map(c=>c.range),[[0,499],[500,999]]);
 harness({respond:call=>call.table?{data:[{id:'foreign',workspace_id:'other'}],error:null}:undefined});await assert.rejects(createRecordSearch().read('مستأجر'),/نطاق/);
 harness({respond:call=>call.table?{data:null,error:{message:'unavailable'}}:undefined});await assert.rejects(createRecordSearch().read('مستأجر'),/unavailable/);
});
test('account changes and close discard in-flight responses',async()=>{
 const h=harness({respond:call=>{if(call.table){h.context.user.id='other';return {data:[],error:null};}}});
 await assert.rejects(createRecordSearch().read('مستأجر'),/جلسة/);
 let started;const ready=new Promise(r=>started=r);const blocked=harness({respond:call=>call.table?(started(),new Promise(()=>{})):undefined});
 const job=createRecordSearch(),pending=job.read('مستأجر');await ready;job.close();await assert.rejects(pending,/جلسة/);assert.ok(blocked.calls.at(-1).signal.aborted);
});
test('opening rechecks tenant, lease and unit association under current access',async()=>{
 const item={kind:'directory-contract',tenantId:'t',leaseId:'l',unitId:'u',propertyId:'p'};
 for(const change of [{tenantId:'wrong'},{leaseId:'wrong'},{unitId:'wrong'},{propertyId:'wrong'}]){harness();await assert.rejects(openSearchRecord({...item,...change}),/ACCESS_DENIED/);}
 harness({permissions:{contracts:{read:false}}});await assert.rejects(openSearchRecord(item),/ACCESS_DENIED/);
});
test('valid result opens and selects the actual tenant timeline, then auth loss removes it',async()=>{
 const h=harness();try{
  assert.equal(await openSearchRecord({kind:'directory-contract',tenantId:'t',leaseId:'l',unitId:'u',propertyId:'p'}),true);
  for(let i=0;i<8;i++)await new Promise(setImmediate);
  const walk=n=>[n,...n.children.flatMap(walk)],all=walk(document.body);
  assert.ok(all.some(n=>n.tagName==='select'&&n.value==='t'));
  assert.ok(all.some(n=>n.textContent.includes('OLD-2030')));
  assert.ok(h.calls.some(c=>c.table==='aqari_leases'&&c.filters.tenant_id==='t'));
  window.AQARI_DATA_GATE.scope=null;h.listeners.get('aqari:auth-boundary')();assert.equal(document.body.children.length,0);
 }finally{h.cleanup();}
});
