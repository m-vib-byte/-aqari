'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const access={userId:'test-user',workspaceId:'test-workspace',role:'general_manager'};
function context(){return {user:{id:access.userId},workspace:{id:access.workspaceId},membership:{user_id:access.userId,workspace_id:access.workspaceId,role:access.role,is_active:true}};}
const modules=[['v208-portfolio-collections.js','authAccess','sameAuthAccess','clearViews'],['v209-global-search.js','contextAccess','sameAccess','clearSearch']];
function harness(config,scopes='closed',reject=false){
  const [file,identity,equality,clear]=config;
  const source=fs.readFileSync(path.join(root,file),'utf8');
  function extract(name){const match=source.match(new RegExp('  function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n  \\}'));assert.ok(match,'missing actual production function '+name);return match[0];}
  let epoch=1,calls=0,clears=0,renders=0;
  const current=context();
  const window={AQARI_SUPABASE:{context:current,refreshContext(expected){calls++;epoch++;assert.deepEqual(JSON.parse(JSON.stringify(expected)),access);return reject?Promise.reject(new Error('revoked')):Promise.resolve(current);}},AQARI_DATA_GATE:{scope:scopes==='closed'?null:{...access}},AQARI_EARLY_STORAGE_GATE:{scope:scopes==='open'?{...access}:null}};
  const sandbox=vm.createContext({window,console,clearViews(){clears++;},clearSearch(){clears++;},render(){renders++;}});
  const functions=['accessContextReady',identity,equality,'dataScopesReady','handleAuthStateChange'];
  if(file.startsWith('v209'))functions.unshift('accessIdentity');
  vm.runInContext('let authEpoch=0,interactionEpoch=0,authSuspended=false;\n'+functions.map(extract).join('\n')+'\nglobalThis.fire=handleAuthStateChange;globalThis.suspended=()=>authSuspended;',sandbox);
  return {window,fire:sandbox.fire,suspended:sandbox.suspended,get calls(){return calls},get clears(){return clears},get epoch(){return epoch},get renders(){return renders}};
}
for(const config of modules){
 const file=config[0];
 for(const event of ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED']){
  test(file+' leaves in-flight startup verification untouched on '+event,async()=>{
   const r=harness(config);const startupEpoch=r.epoch;
   r.fire(event);await new Promise(resolve=>setImmediate(resolve));
   assert.equal(r.calls,0,'secondary UI must not start refreshContext before both data gates are active');
   assert.equal(r.epoch,startupEpoch,'startup snapshot epoch must remain current');
   assert.equal(r.suspended(),true);assert.equal(r.clears,1);
  });
 }
 test(file+' does not refresh when only one data boundary is ready',()=>{
  const r=harness(config,'partial');r.fire('INITIAL_SESSION');assert.equal(r.calls,0);assert.equal(r.suspended(),true);
 });
 test(file+' keeps exact server revalidation once the workspace is open',async()=>{
  const r=harness(config,'open');r.fire('TOKEN_REFRESHED');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.calls,1);assert.equal(r.suspended(),false);
 });
 test(file+' stays sealed when post-login access revalidation fails',async()=>{
  const r=harness(config,'open',true);r.fire('TOKEN_REFRESHED');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.calls,1);assert.equal(r.suspended(),true);
 });
 test(file+' clears views on sign-out without attempting a refresh',()=>{
  const r=harness(config,'open');r.fire('SIGNED_OUT');assert.equal(r.calls,0);assert.equal(r.suspended(),true);assert.equal(r.clears,1);
 });
 test(file+' rejects a storage boundary belonging to another workspace',()=>{
  const r=harness(config,'open');r.window.AQARI_EARLY_STORAGE_GATE.scope.workspaceId='other';r.fire('SIGNED_IN');assert.equal(r.calls,0);assert.equal(r.suspended(),true);
 });
}
