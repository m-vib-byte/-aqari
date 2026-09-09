const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('v267-tenant-portal.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,2));
function fixture(){
 const elements=new Map(),events=new Map(),revoked=[],created=[];
 class Element{
  constructor(id=''){this.id=id;this.children=[];this.events={};this.style={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;}
  get options(){return this.children;}
  append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parent=this;}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  replaceWith(...nodes){if(this.parent){const i=this.parent.children.indexOf(this);this.parent.children.splice(i,1,...nodes);}}
  addEventListener(type,fn){this.events[type]=fn;}
 }
 const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 for(const id of ['notice','content','auth','tenantName','tenantLeases','tenantPayments','tenantRequests','maintenanceLease','maintenanceForm','maintenanceDescription','maintenanceSave','tenantEmail','tenantPassword','tenantLogin','tenantSignup','tenantLogout'])$(id);
 const payload={account:{user_id:'user-a',workspace_id:'workspace-a',tenant_id:'tenant-a',is_active:true},tenant:{id:'tenant-a',workspace_id:'workspace-a',full_name:'اسم <محفوظ>'},leases:[{id:'lease-a',contract_no:'C-A',snapshot:{unit:'101',property:'عقار اختبار'},monthly_rent:'125.750',status:'signed',start_date:'2026-01-01',end_date:'2027-12-31'}],payments:[{reference:'R-A',amount:'125.750',paid_at:'2026-09-01'}],maintenance:[]};
 let authCallback,auth={user:{id:'user-a'},access_token:'fixture'},fast=false;
 const state={reads:0,inserts:[],signals:[],read:async()=>({data:structuredClone(payload)}),insert:async row=>{payload.maintenance.push({...row,request_no:1,status:'received'});return {};},fetch:async()=>({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['%PDF-fixture'])})};
 const client={auth:{getSession:async()=>({data:{session:auth}}),onAuthStateChange:fn=>{authCallback=fn;return {data:{subscription:{unsubscribe(){}}}};},signInWithPassword:async()=>({}),signUp:async()=>({}),signOut:async()=>{auth=null;authCallback('SIGNED_OUT',null);return {};},stopAutoRefresh(){},startAutoRefresh(){}},rpc:()=>({abortSignal:signal=>{state.reads++;state.signals.push(signal);return state.read(signal);}}),from:()=>({insert:row=>({abortSignal:signal=>{state.inserts.push(row);state.signals.push(signal);return state.insert(row,signal);}})})};
 class TestURL extends URL{}TestURL.createObjectURL=()=>{const u='blob:fixture-'+created.length;created.push(u);return u;};TestURL.revokeObjectURL=u=>revoked.push(u);
 const ctx={window:{AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://djkpkkgoibruaezdrchb.supabase.co',releaseStage:'preview',supabasePublishableKey:'synthetic',supabaseAuthStorageKey:'isolated',supabaseAuthRedirectUrl:'https://preview.example/tenant.html'},supabase:{createClient:()=>client},addEventListener:(type,fn)=>events.set(type,fn)},document:{getElementById:$,createElement:()=>new Element(),querySelectorAll:()=>[$('tenantSignup'),$('tenantLogout'),$('maintenanceSave')]},URL:TestURL,Blob,AbortController,crypto:{randomUUID:()=> 'request-fixture'},fetch:(...args)=>state.fetch(...args),setTimeout:(fn,ms)=>setTimeout(fn,fast&&ms===20000?15:ms),clearTimeout,console};
 vm.createContext(ctx);vm.runInContext(source+'\nglobalThis.portalTest={refresh,reload,receipt,get snapshot(){return snapshot;},get busy(){return busy;}};',ctx);
 return {$,state,payload,client,api:ctx.portalTest,revoked,created,events,emit:(event,next)=>{auth=next;authCallback(event,next);},fast:()=>{fast=true;}};
}
test('sign-out clears private fields and receipt URLs synchronously, including cross-tab sign-out',async()=>{
 const f=fixture();await tick();assert.equal(f.$('tenantName').textContent,'اسم <محفوظ>');
 await f.api.receipt(f.payload.payments[0],f.$('tenantPayments').children[0].children[0]);assert.equal(f.created.length,1);
 f.$('maintenanceDescription').value='private draft';f.emit('SIGNED_OUT',null);
 assert.equal(f.$('content').hidden,true);assert.equal(f.$('tenantName').textContent,'');assert.equal(f.$('maintenanceDescription').value,'');assert.equal(f.$('tenantPayments').children.length,0);assert.deepEqual(f.revoked,f.created);
});
test('late snapshot cannot repopulate a signed-out page even when transport ignores abort',async()=>{
 const f=fixture();await tick();let resolve;f.state.read=()=>new Promise(r=>{resolve=r;});const pending=f.api.reload();await tick();
 f.emit('SIGNED_OUT',null);assert.equal(f.state.signals.at(-1).aborted,true);await pending;
 resolve({data:f.payload});await tick();assert.equal(f.$('content').hidden,true);assert.equal(f.api.snapshot,null);
});
test('mismatched tenant identity and revoked access cannot retain an earlier snapshot',async()=>{
 const f=fixture();await tick();f.state.read=async()=>({data:{...f.payload,account:{...f.payload.account,user_id:'other'}}});await f.api.reload();assert.equal(f.api.snapshot,null);assert.equal(f.$('tenantName').textContent,'');
 f.state.read=async()=>({error:{message:'provider_secret'}});await f.api.reload();assert.ok(!f.$('notice').textContent.includes('provider_secret'));
});
test('same-user token refresh does not clear a draft or issue extra reads',async()=>{
 const f=fixture();await tick();f.$('maintenanceDescription').value='saved draft';const before=f.state.reads;
 f.emit('TOKEN_REFRESHED',{user:{id:'user-a'},access_token:'new'});await tick();assert.equal(f.state.reads,before);assert.equal(f.$('maintenanceDescription').value,'saved draft');
});
test('maintenance validates active lease, saves scoped data and confirms via readback',async()=>{
 const f=fixture();await tick();const submit=()=>f.$('maintenanceForm').events.submit({preventDefault(){}});
 f.$('maintenanceLease').value='lease-a';f.$('maintenanceDescription').value='إصلاح تسرب الماء';f.payload.leases[0].status='draft';await f.api.reload();f.$('maintenanceLease').value='lease-a';f.$('maintenanceDescription').value='إصلاح تسرب الماء';await submit();assert.equal(f.state.inserts.length,0);
 f.payload.leases[0].status='signed';await f.api.reload();f.$('maintenanceLease').value='lease-a';f.$('maintenanceDescription').value='إصلاح تسرب الماء';await submit();
 assert.equal(f.state.inserts.length,1);assert.equal(f.state.inserts[0].tenant_id,'tenant-a');assert.equal(f.state.inserts[0].workspace_id,'workspace-a');assert.equal(f.$('maintenanceDescription').value,'');assert.match(f.$('notice').textContent,/تم حفظ طلب/);
});
test('uncertain maintenance insert stays blocked through later unrelated operations',async()=>{
 const f=fixture();await tick();f.$('maintenanceLease').value='lease-a';f.$('maintenanceDescription').value='إصلاح تسرب الماء';f.state.insert=async()=>({error:{message:'provider_secret'}});
 await f.$('maintenanceForm').events.submit({preventDefault(){}});assert.equal(f.$('maintenanceSave').disabled,true);
 await f.api.receipt(f.payload.payments[0],f.$('tenantPayments').children[0].children[0]);assert.equal(f.$('maintenanceSave').disabled,true);assert.equal(f.state.inserts.length,1);
});
test('receipt body timeout aborts work and logout remains available while loading',async()=>{
 const f=fixture();await tick();f.fast();let signal;f.state.fetch=async(_,options)=>{signal=options.signal;return {ok:true,headers:{get:()=> 'application/pdf'},blob:()=>new Promise(()=>{})};};
 const pending=f.api.receipt(f.payload.payments[0],f.$('tenantPayments').children[0].children[0]);assert.equal(f.$('tenantLogout').disabled,false);await pending;assert.equal(signal.aborted,true);assert.equal(f.created.length,0);assert.equal(f.api.busy,false);
});
test('pagehide removes sensitive state and a restored page reloads it',async()=>{
 const f=fixture();await tick();f.events.get('pagehide')();assert.equal(f.$('tenantName').textContent,'');assert.equal(f.api.snapshot,null);f.events.get('pageshow')({persisted:true});await tick();assert.equal(f.$('tenantName').textContent,'اسم <محفوظ>');
});

test('sign-in auth event completes outside the callback and opens the verified account',async()=>{
 const f=fixture();await tick();f.emit('SIGNED_OUT',null);let credentials;
 f.client.auth.signInWithPassword=async values=>{credentials=values;f.emit('SIGNED_IN',{user:{id:'user-a'},access_token:'fixture'});return {};};
 f.$('tenantEmail').value='tenant@example.test';f.$('tenantPassword').value='synthetic-password';await f.$('tenantLogin').events.submit({preventDefault(){}});await tick();await tick();
 assert.equal(credentials.email,'tenant@example.test');assert.equal(credentials.password,'synthetic-password');assert.equal(f.$('tenantPassword').value,'');assert.equal(f.$('content').hidden,false);assert.equal(f.api.busy,false);
});
test('account switch discards pending old data and loads only the newly matched account',async()=>{
 const f=fixture();await tick();let resolve;f.state.read=()=>new Promise(r=>{resolve=r;});const old=f.api.reload();await tick();
 const oldData=structuredClone(f.payload);f.payload.account.user_id='user-b';f.payload.tenant.full_name='اسم الحساب الجديد';f.state.read=async()=>({data:structuredClone(f.payload)});
 f.emit('SIGNED_IN',{user:{id:'user-b'},access_token:'new'});assert.equal(f.$('tenantName').textContent,'');await old;resolve({data:oldData});await tick();await tick();
 assert.equal(f.$('tenantName').textContent,'اسم الحساب الجديد');assert.equal(f.api.snapshot.account.user_id,'user-b');
});

test('failed sign-out keeps private data cleared and exposes a working retry',async()=>{
 const f=fixture();await tick();const original=f.client.auth.signOut;f.client.auth.signOut=async()=>({error:{message:'network failure'}});
 await f.$('tenantLogout').onclick();assert.equal(f.api.snapshot,null);assert.equal(f.$('content').hidden,true);assert.equal(f.$('tenantLogout').hidden,false);assert.equal(f.$('tenantLogout').disabled,false);
 f.client.auth.signOut=original;await f.$('tenantLogout').onclick();assert.equal(f.$('tenantLogout').hidden,true);assert.equal(f.$('content').hidden,true);
});
