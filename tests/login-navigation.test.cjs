const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = [...fs.readFileSync(root+'/login.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const access = {user:{id:'test-user'},workspace:{id:'test-space'},membership:{user_id:'test-user',workspace_id:'test-space',role:'general_manager',is_active:true}};
const tick = () => new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function loginRuntime(options={}){
  const handlers = new Map(), destinations=[];
  const nodes = Object.fromEntries(['loginForm','email','password','loginButton','recoveryButton','retryButton','status','continueButton'].map(id=>[id,{value:'',disabled:false,hidden:true,textContent:'',addEventListener(type,fn){handlers.set(id+':'+type,fn);}}]));
  let checks=0,signIns=0;
  const adapter={
    context:access,
    async getClient(){return {};},
    async getSession(){return options.session===false?null:{user:access.user};},
    async refreshContext(){checks++;return options.refresh?options.refresh.promise:(options.context||access);},
    async signIn(){signIns++;},
    clearPersistedSession(){throw new Error('restoration must not erase the session');}
  };
  const window={AQARI_PUBLIC_CONFIG:{},supabase:{createClient(){}},AQARI_SUPABASE:adapter,addEventListener(){},location:{origin:'https://aqari.test',replace(url){destinations.push(url);}}};
  vm.runInNewContext(source,{window,navigator:{},document:{getElementById(id){return nodes[id];}},setTimeout(){return 1;},clearTimeout(){},console});
  return {nodes,handlers,destinations,get checks(){return checks;},get signIns(){return signIns;}};
}
test('saved sessions offer explicit continuation, then server verification without another password', async()=>{
  const r=loginRuntime();await tick();
  assert.deepEqual(r.destinations,[]);assert.equal(r.checks,0);assert.equal(r.nodes.continueButton.hidden,false);
  r.handlers.get('continueButton:click')();await tick();
  assert.deepEqual(r.destinations,['/app?release=V266']);assert.equal(r.signIns,0);assert.equal(r.checks,1);
});
test('signed-out or inactive users are never forwarded to the main app',async()=>{
  const signedOut=loginRuntime({session:false});const inactive=loginRuntime({context:{...access,membership:{...access.membership,is_active:false}}});await tick();
  inactive.handlers.get('continueButton:click')();await tick();
  assert.equal(signedOut.nodes.continueButton.hidden,true);
  assert.deepEqual(signedOut.destinations,[]);assert.deepEqual(inactive.destinations,[]);assert.equal(signedOut.checks,0);
});
test('manual sign-in wins over an older delayed restoration',async()=>{
  const refresh=deferred(),r=loginRuntime({refresh});await tick();
  r.handlers.get('continueButton:click')();await tick();
  r.nodes.email.value='test@example.invalid';r.nodes.password.value='fictional-test-password';
  await r.handlers.get('loginForm:submit')({preventDefault(){}});
  assert.deepEqual(r.destinations,['/app?release=V266']);assert.equal(r.signIns,1);
  refresh.resolve(access);await tick();assert.equal(r.destinations.length,1);
});
test('main app waits for verified workspace data before selecting home and unlocking',async()=>{
  const remote=deferred(),events=[],listeners={},attrs=new Map(),classes=new Set(),timers=new Map();
  const gate={setAttribute(k,v){attrs.set(k,v);},removeAttribute(k){attrs.delete(k);},classList:{add(){},remove(){events.push('gate-hidden');}}};
  const retry={hidden:true,addEventListener(){}};
  const window={
    AQARI_SUPABASE:{context:access,async refreshContext(){return {...access,profile:{display_name:'Test'}};},async loadAppState(){return remote.promise;},async getClient(){return {auth:{onAuthStateChange(){}}};}},
    activateWorkspaceDbV198(){events.push('data-activated');},
    go(route){events.push(route);},addEventListener(){}
  };
  const document={readyState:'loading',documentElement:{classList:{toggle(k,v){v?classes.add(k):classes.delete(k);},add(k){classes.add(k);},remove(k){classes.delete(k);}}},getElementById(id){return id==='aqariCloudGateV168'?gate:id==='aqariSessionRetry'?retry:null;},querySelectorAll(){return [];},addEventListener(type,fn){listeners[type]=fn;}};
  const storage={setItem(){},removeItem(){},getItem(){return null;}};
  vm.runInNewContext(fs.readFileSync(root+'/secure-auth-bridge.js','utf8'),{window,document,localStorage:storage,sessionStorage:storage,location:{replace(){throw Error('unexpected redirect');}},setTimeout(fn,ms){const id={};timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(){},console});
  const ready=listeners.DOMContentLoaded();await tick();
  assert.equal(attrs.get('data-auth-phase'),'restoring');assert.equal(classes.has('aqari-login-required'),false);assert.deepEqual(events,[]);
  remote.resolve({workspace_id:'test-space',payload:null});await ready;
  assert.deepEqual(events,['data-activated','home','gate-hidden']);assert.equal(classes.has('aqari-auth-unlocked'),true);
});
