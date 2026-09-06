'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const bridge=fs.readFileSync(path.join(__dirname,'..','secure-auth-bridge.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function sourceFunction(source,name){
 const start=source.indexOf('function '+name+'(');assert.notEqual(start,-1,'missing '+name);
 const open=source.indexOf('{',start);let depth=1,i=open+1;
 while(i<source.length&&depth){if(source[i]==='{')depth++;else if(source[i]==='}')depth--;i++;}
 assert.equal(depth,0);return source.slice(start,i);
}
function runtime(role='general_manager'){
 const context={user:{id:'user-a'},workspace:{id:'workspace-a'},membership:{user_id:'user-a',workspace_id:'workspace-a',is_active:true,role}};
 const window={AQARI_SUPABASE:{context:structuredClone(context)},AQARI_DATA_GATE:{scope:{userId:'user-a',workspaceId:'workspace-a'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'user-a',workspaceId:'workspace-a'}}};
 const sandbox=vm.createContext({window,context,roleAccess:{admin:['*'],property:['home','properties','tenants'],accountant:['home','collections']},currentUserV120:()=>({role:'مدير عام'})});
 vm.runInContext(sourceFunction(html,'canNavigateV206')+';window.canNavigateV206=canNavigateV206;'+sourceFunction(bridge,'accessIdentity')+';'+sourceFunction(bridge,'sameIdentity')+';'+sourceFunction(bridge,'canUseAuthenticatedRoute'),sandbox);
 return {window,sandbox,allow:route=>vm.runInContext('canUseAuthenticatedRoute('+JSON.stringify(route)+')',sandbox)};
}
test('the old general-manager list demonstrably omitted ordinary property and tenant routes',()=>{
 const sandbox=vm.createContext({currentUserV120:()=>({role:'مدير عام'})});
 vm.runInContext(sourceFunction(html,'roleRoutesV121')+';'+sourceFunction(html,'canAccessV121'),sandbox);
 for(const route of ['properties','tenants','smartContractsPage'])assert.equal(vm.runInContext('canAccessV121('+JSON.stringify(route)+')',sandbox),false);
});
test('the bridge binds legacy navigation to its validated secure decision',()=>{
 assert.match(bridge,/window\.canAccessV121\s*=\s*canUseAuthenticatedRoute/);
});
test('verified general-manager routes use the existing secure role policy',()=>{
 const r=runtime();for(const route of ['home','properties','tenants','smartContractsPage','collectionProPage','maintenanceProPage'])assert.equal(r.allow(route),true,route);
});
for(const kind of ['no-bridge-context','no-user','inactive','membership-user','membership-workspace','role-changed','sealed-data','sealed-storage','data-user','data-workspace','storage-user','storage-workspace','no-policy']){
 test('route stays denied for '+kind,()=>{
  const r=runtime(),w=r.window;
  if(kind==='no-bridge-context')vm.runInContext('context=null',r.sandbox);
  if(kind==='no-user')w.AQARI_SUPABASE.context.user=null;
  if(kind==='inactive')w.AQARI_SUPABASE.context.membership.is_active=false;
  if(kind==='membership-user')w.AQARI_SUPABASE.context.membership.user_id='other';
  if(kind==='membership-workspace')w.AQARI_SUPABASE.context.membership.workspace_id='other';
  if(kind==='role-changed')w.AQARI_SUPABASE.context.membership.role='viewer';
  if(kind==='sealed-data')w.AQARI_DATA_GATE.scope=null;
  if(kind==='sealed-storage')w.AQARI_EARLY_STORAGE_GATE.scope=null;
  if(kind==='data-user')w.AQARI_DATA_GATE.scope.userId='other';
  if(kind==='data-workspace')w.AQARI_DATA_GATE.scope.workspaceId='other';
  if(kind==='storage-user')w.AQARI_EARLY_STORAGE_GATE.scope.userId='other';
  if(kind==='storage-workspace')w.AQARI_EARLY_STORAGE_GATE.scope.workspaceId='other';
  if(kind==='no-policy')delete w.canNavigateV206;
  assert.equal(r.allow('properties'),false);
 });
}
test('local manager labels cannot elevate a viewer or change the existing role policy',()=>{
 const viewer=runtime('viewer');assert.equal(viewer.allow('properties'),false);assert.equal(viewer.allow('home'),false);
 const property=runtime('property_manager');assert.equal(property.allow('properties'),true);assert.equal(property.allow('collections'),false);
 const accountant=runtime('accountant');assert.equal(accountant.allow('properties'),false);assert.equal(accountant.allow('collections'),true);
});
test('an unavailable or throwing secure role policy fails closed',()=>{
 const r=runtime();r.window.canNavigateV206=()=>{throw Error('unavailable')};assert.equal(r.allow('properties'),false);
});
