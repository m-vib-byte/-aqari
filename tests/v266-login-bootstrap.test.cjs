const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'supabase-adapter.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(root, 'secure-auth-bridge.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred(){ let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; }
const identity = {userId:'user-a',workspaceId:'space-a',role:'general_manager'};
function context(){return {user:{id:'user-a',email:'test@example.invalid'},membership:{user_id:'user-a',workspace_id:'space-a',role:'general_manager',is_active:true},workspace:{id:'space-a',name:'Test'},profile:{display_name:'Test'}};}
function adapterRuntime(options={}){
  let current = context(), now = 100000, userChecks = 0;
  const calls=[];
  const client={auth:{
    async getSession(){return {data:{session:current.user?{user:{...current.user}}:null},error:null};},
    async getUser(){userChecks++;return {data:{user:current.user?{...current.user}:null},error:null};},
    stopAutoRefresh(){}
  },from(table){
    const filters={};
    const query={select(){return query;},eq(key,value){filters[key]=value;return query;},limit(){return query;},async maybeSingle(){
      calls.push({table,filters:{...filters}});
      if(options.read) {const result=await options.read(table,filters);if(result!==undefined)return result;}
      let data = table==='aqari_memberships'?current.membership:table==='aqari_workspaces'?current.workspace:table==='aqari_profiles'?current.profile:{workspace_id:'space-a',payload:{test:true},revision:1};
      return {data:data?{...data}:null,error:null};
    }};
    return query;
  }};
  const window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://example.invalid',supabasePublishableKey:'public-test-key'},supabase:{createClient(){return client;}},localStorage:{length:0,getItem(){return null;},removeItem(){}}};
  class Clock extends Date {static now(){return now;}}
  vm.runInNewContext(adapterSource,{window,Date:Clock,console,setTimeout,clearTimeout});
  return {api:window.AQARI_SUPABASE,calls,get userChecks(){return userChecks;},setCurrent(next){current=next;},advance(ms){now+=ms;}};
}
test('bootstrap reuses only the just-verified context and still revalidates after reading',async()=>{
  const r=adapterRuntime();await r.api.refreshContext();
  const data=await r.api.loadAppState(identity,{reuseVerifiedContext:true});
  assert.equal(data.workspace_id,'space-a');assert.equal(r.userChecks,2);
  assert.equal(r.calls.filter(c=>c.table==='aqari_memberships').length,2);
  assert.equal(r.calls.filter(c=>c.table==='aqari_app_state').length,1);
});
test('ordinary cloud reads retain both original access checks',async()=>{
  const r=adapterRuntime();await r.api.refreshContext();await r.api.loadAppState(identity);
  assert.equal(r.userChecks,3);
});
test('an expired in-memory verification cannot use the startup shortcut',async()=>{
  const r=adapterRuntime();await r.api.refreshContext();r.advance(5001);
  await r.api.loadAppState(identity,{reuseVerifiedContext:true});assert.equal(r.userChecks,3);
});
test('workspace and profile reads start together but do not publish partial context',async()=>{
  const workspace=deferred(),profile=deferred();const seen=[];
  const r=adapterRuntime({read(table){seen.push(table);if(table==='aqari_workspaces')return workspace.promise;if(table==='aqari_profiles')return profile.promise;}});
  const pending=r.api.refreshContext();await tick();
  assert.ok(seen.includes('aqari_workspaces'));assert.ok(seen.includes('aqari_profiles'));assert.equal(r.api.context.user,null);
  workspace.resolve({data:context().workspace,error:null});profile.resolve({data:context().profile,error:null});
  await pending;assert.equal(r.api.context.user.id,'user-a');
});
for(const change of ['revoked','role','user','workspace']){
  test('bootstrap rejects '+change+' changes during cloud loading',async()=>{
    let r; r=adapterRuntime({read(table){if(table==='aqari_app_state'){
      const next=context();if(change==='revoked')next.membership=null;
      if(change==='role')next.membership.role='viewer';
      if(change==='user')next.user.id='user-b';
      if(change==='workspace')next.workspace.id='space-b';
      r.setCurrent(next);
    }}});
    await r.api.refreshContext();await assert.rejects(r.api.loadAppState(identity,{reuseVerifiedContext:true}),e=>e.code==='AQARI_ACCESS_CHANGED');
  });
}
test('a cloud payload for another workspace is never returned',async()=>{
  const r=adapterRuntime({read(table){if(table==='aqari_app_state')return {data:{workspace_id:'space-b',payload:{private:true}},error:null};}});
  await r.api.refreshContext();await assert.rejects(r.api.loadAppState(identity,{reuseVerifiedContext:true}),/workspace/i);
});
test('clearing a session invalidates a pending parallel context read',async()=>{
  const pendingProfile=deferred();const r=adapterRuntime({read(table){if(table==='aqari_profiles')return pendingProfile.promise;}});
  const pending=r.api.refreshContext();await tick();r.api.clearPersistedSession();
  pendingProfile.resolve({data:context().profile,error:null});
  await assert.rejects(pending,e=>e.reason==='AQARI_CONTEXT_SUPERSEDED');assert.equal(r.api.context.user,null);
});
function bridgeRuntime(options={}){
  const events=[],listeners={},attrs=new Map(),classes=new Set(),timers=new Map();let now=100000,checks=0,authCallback;
  const button={disabled:false};const gate={setAttribute(k,v){attrs.set(k,v);},removeAttribute(k){attrs.delete(k);},classList:{add(){},remove(){events.push('gate-hidden');}}};
  const retry={hidden:true,addEventListener(type,fn){listeners.retry=fn;}};
  const message={textContent:'',className:''};
  const nodes={aqariCloudGateV168:gate,aqariSessionRetry:retry,cloudGateMsgV168:message,cloudEmailV168:{value:'test@example.invalid'},cloudPasswordV168:{value:'test-password'}};
  const access=context();
  const api={context:access,authStorageKey:options.hint===undefined?undefined:'test-session-key',
    async refreshContext(){checks++;return options.refresh?options.refresh():access;},
    async loadAppState(expected,settings){assert.equal(settings.reuseVerifiedContext,true);return options.remote?options.remote():{workspace_id:'space-a',payload:{}};},
    async getClient(){return {auth:{onAuthStateChange(fn){authCallback=fn;}}};},
    async signIn(){if(options.signIn)return options.signIn();},async signOut(){}
  };
  const window={AQARI_SUPABASE:api,activateWorkspaceDbV198(){events.push('data-activated');},go(route){events.push(route);},addEventListener(){}};
  const document={readyState:'loading',documentElement:{classList:{toggle(k,v){v?classes.add(k):classes.delete(k);},add(k){classes.add(k);},remove(k){classes.delete(k);}}},getElementById(id){return nodes[id]||null;},querySelectorAll(){return [button];},addEventListener(type,fn){listeners[type]=fn;}};
  const storage={setItem(){},removeItem(){},getItem(key){return key==='test-session-key'&&options.hint?'opaque-session-hint':null;}};
  class Clock extends Date {static now(){return now;}}
  vm.runInNewContext(bridgeSource,{window,document,Date:Clock,localStorage:storage,sessionStorage:storage,location:{replace(){throw Error('unexpected redirect');}},setTimeout(fn,ms){const id={};timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(){},console});
  const ready=listeners.DOMContentLoaded();
  return {window,ready,events,attrs,classes,retry,button,message,get checks(){return checks;},async advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}await tick();},auth(event,session){authCallback(event,session);}};
}
test('a signed-out app visit shows email/password immediately without a workspace check',async()=>{
  const r=bridgeRuntime({hint:false});await r.ready;
  assert.equal(r.checks,0);assert.equal(r.attrs.get('data-auth-phase'),'login');assert.equal(r.button.disabled,false);assert.deepEqual(r.events,[]);
});
test('a stored value is not authorization and cannot unlock a signed-out user',async()=>{
  const r=bridgeRuntime({hint:true,refresh:()=>({user:null})});await r.ready;
  assert.equal(r.attrs.get('data-auth-phase'),'login');assert.deepEqual(r.events,[]);
});
test('verified login opens home once, after workspace data, without another password',async()=>{
  const remote=deferred();const r=bridgeRuntime({remote:()=>remote.promise});await tick();
  assert.deepEqual(r.events,[]);remote.resolve({workspace_id:'space-a',payload:{}});await r.ready;
  assert.deepEqual(r.events,['data-activated','home','gate-hidden']);assert.equal(r.classes.has('aqari-auth-unlocked'),true);
});
test('manual email/password login works after the immediate signed-out form',async()=>{
  const r=bridgeRuntime({hint:false});await r.ready;await r.window.cloudLoginV198();
  assert.deepEqual(r.events,['data-activated','home','gate-hidden']);assert.equal(r.button.disabled,false);
});
test('a hanging restore ends with usable login and retry controls',async()=>{
  const r=bridgeRuntime({refresh:()=>new Promise(()=>{})});await tick();await r.advance(12000);await r.ready;
  assert.equal(r.attrs.get('data-auth-phase'),'error');assert.equal(r.classes.has('aqari-login-required'),true);assert.equal(r.retry.hidden,false);assert.equal(r.button.disabled,false);assert.deepEqual(r.events,[]);
});
test('context and cloud stages share one deadline, not separate twenty-second waits',async()=>{
  const active=deferred(),remote=deferred();const r=bridgeRuntime({refresh:()=>active.promise,remote:()=>remote.promise});await tick();
  await r.advance(9000);active.resolve(context());await tick();await r.advance(3000);await r.ready;
  assert.equal(r.attrs.get('data-auth-phase'),'error');assert.deepEqual(r.events,[]);
  remote.resolve({workspace_id:'space-a',payload:{}});await tick();assert.deepEqual(r.events,[]);
});
test('repeated superseded refreshes stop instead of creating an infinite bootstrap loop',async()=>{
  const r=bridgeRuntime({refresh:()=>{const e=new Error('superseded');e.reason='AQARI_CONTEXT_SUPERSEDED';throw e;}});await r.ready;
  assert.equal(r.checks,2);assert.equal(r.attrs.get('data-auth-phase'),'error');assert.equal(r.button.disabled,false);
});
test('sign-out while cloud data is loading prevents stale data from unlocking',async()=>{
  const remote=deferred();const r=bridgeRuntime({remote:()=>remote.promise});await tick();r.auth('SIGNED_OUT',null);await r.advance(0);
  remote.resolve({workspace_id:'space-a',payload:{}});await r.ready;assert.deepEqual(r.events,[]);assert.equal(r.attrs.get('data-auth-phase'),'login');
});
test('same-user auth notifications preserve the stage and do not duplicate a successful bootstrap',async()=>{
  const remote=deferred();const r=bridgeRuntime({remote:()=>remote.promise});await tick();const before=r.message.textContent;
  r.auth('TOKEN_REFRESHED',{user:context().user});await r.advance(0);assert.equal(r.message.textContent,before);
  remote.resolve({workspace_id:'space-a',payload:{}});await r.ready;assert.equal(r.checks,1);assert.equal(r.events.filter(e=>e==='home').length,1);
});


test('a failed restore stays stopped when late auth events arrive',async()=>{
  const r=bridgeRuntime({refresh:()=>new Promise(()=>{})});await tick();await r.advance(12000);await r.ready;
  assert.equal(r.attrs.get('data-auth-phase'),'error');
  for(const event of ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED']){
    r.auth(event,{user:context().user});await r.advance(0);
  }
  assert.equal(r.checks,1,'late events must not start a new automatic 12-second wait');
  assert.equal(r.attrs.get('data-auth-phase'),'error');assert.equal(r.button.disabled,false);
});
test('a hanging password submission ends and late success cannot open the app',async()=>{
  const login=deferred();const r=bridgeRuntime({hint:false,signIn:()=>login.promise});await r.ready;
  const pending=r.window.cloudLoginV198();await tick();await r.advance(12000);await pending;
  assert.equal(r.attrs.get('data-auth-phase'),'error');assert.equal(r.button.disabled,false);
  login.resolve({});r.auth('SIGNED_IN',{user:context().user});await r.advance(0);
  assert.deepEqual(r.events,[]);assert.equal(r.checks,0);
});
test('manual entry is an explicit login presentation choice, never an access bypass',()=>{
  const login=fs.readFileSync(path.join(root,'login.html'),'utf8');
  assert.ok(login.includes("var manualEntry = /(?:^|[?&])manual=1(?:&|$)/.test(String(window.location.search || ''))"));
  assert.match(login,/if\(manualEntry \|\| busy \|\| preparing \|\| restoreFlight\) return restoreFlight/);
  assert.match(login,/AQARI_SUPABASE.signIn\(emailValue,passwordValue\)/);
  assert.match(bridgeSource,/link.href = '\/login\?release=V266&manual=1'/);
});
