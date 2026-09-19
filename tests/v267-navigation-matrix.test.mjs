import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const escapeRe=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function visibleRoutes(source){
 return [...new Set(Array.from(source.matchAll(/data-v199-go=["']([^"']+)["']/g),match=>match[1]))];
}

function assertRouteTargets(index,routes){
 for(const route of routes){
  const target=['properties','tenants'].includes(route)?'list':route;
  assert.match(index,new RegExp(`id=["']${escapeRe(target)}["']`),`${route} must have a real page target (${target})`);
 }
}

test('every visible V199 and V205 navigation control resolves to a real page target',()=>{
 const index=read('index.html');
 const v199=read('v199-ui.js');
 const v205=read('v205-simplified-shell.js');
 const shellRoutes=visibleRoutes(v199);
 const simplifiedRoutes=['home','properties','tenants','collectionProPage','maintenanceProPage','smartContractsPage'];
 for(const required of ['home','properties','tenants','collectionProPage','maintenanceProPage','reports','documentsHub']){
  assert.ok(shellRoutes.includes(required),`${required} missing from the visible shell`);
 }
 for(const required of simplifiedRoutes){
  assert.ok(v205.includes(`'${required}'`)||v205.includes(`"${required}"`),`${required} missing from simplified workspace actions`);
 }
 assertRouteTargets(index,[...new Set([...shellRoutes,...simplifiedRoutes])]);
});

test('service-directory internal icons preserve the original functional click handler',()=>{
 const directory=read('src/v267/components/service-directory.js');
 const workspace=read('src/v267/workspace.js');
 assert.match(directory,/button\.dataset\.service=item\.source\?\.dataset\?\.aq267Label\|\|group\.key/);
 assert.match(directory,/item\.source\.click\(\)/);
 assert.match(workspace,/source\.dataset\.aq267Label=displayKey/);
 assert.match(workspace,/groupLabel:key=>label\('group_'\+key/);
});

function navigationRuntime(width,{stableOpens=true,currentOpens=true}={}){
 const source=read('v199-ui.js');
 const start=source.indexOf('  function routeNode(target){');
 const end=source.indexOf('  function quickAdd(target){',start);
 assert.ok(start>=0&&end>start,'transformed V199 navigation block must exist');
 const calls=[];
 const pages=new Map();
 for(const id of ['home','list','collectionProPage','maintenanceProPage','documentsHub']){
  pages.set(id,{hidden:false,visible:id==='home',getAttribute(name){return name==='aria-hidden'&&!this.visible?'true':null;}});
 }
 const open=route=>{
  for(const page of pages.values())page.visible=false;
  const id=['properties','tenants'].includes(route)?'list':route;
  if(pages.has(id))pages.get(id).visible=true;
 };
 const context={
  Promise,
  document:{getElementById:id=>pages.get(id)||null},
  markActive:target=>calls.push('active:'+target),
  closeLayers:()=>calls.push('close'),
  requestAnimationFrame:fn=>fn(),
  window:{
   innerWidth:width,
   AQARI_V199_BASE_GO(route){calls.push('stable:'+route);if(stableOpens)open(route);},
   go(route){calls.push('current:'+route);if(currentOpens)open(route);},
   getComputedStyle(page){return {display:page.visible?'block':'none',visibility:'visible'};},
   scrollTo(options){calls.push('scroll:'+options.top+':'+options.behavior);}
  }
 };
 vm.runInNewContext(source.slice(start,end)+';this.navigateV267=navigate;',context);
 return {calls,navigate:context.navigateV267,pages};
}

for(const [device,width] of [['iPhone',390],['iPad',820],['Desktop',1440]]){
 test(`${device} primary navigation opens the destination before resetting the viewport`,()=>{
  const runtime=navigationRuntime(width);
  for(const route of ['properties','tenants','collectionProPage','maintenanceProPage','home']){
   runtime.calls.length=0;
   runtime.navigate(route);
   assert.equal(runtime.calls[0],'close');
   assert.ok(runtime.calls.includes('current:'+route),route+' must use the current guarded router');
   assert.ok(runtime.calls.includes('scroll:0:auto'),route+' must reset viewport only after the target is visible');
  }
 });
}

test('failed primary transition falls back to the preserved router before scrolling',()=>{
 const runtime=navigationRuntime(820,{stableOpens:true,currentOpens:false});
 runtime.navigate('properties');
 assert.deepEqual(runtime.calls.filter(value=>/^(stable|current|scroll):/.test(value)),['current:properties','stable:properties','scroll:0:auto']);
});

test('a destination that never becomes visible never performs the old scroll-only behavior',()=>{
 const runtime=navigationRuntime(390,{stableOpens:false,currentOpens:false});
 runtime.navigate('properties');
 assert.ok(runtime.calls.includes('stable:properties'));
 assert.ok(runtime.calls.includes('current:properties'));
 assert.equal(runtime.calls.some(value=>value.startsWith('scroll:')),false);
});

test('internal destinations keep the current router chain instead of bypassing feature guards',()=>{
 const runtime=navigationRuntime(1440);
 runtime.navigate('documentsHub');
 assert.ok(runtime.calls.includes('current:documentsHub'));
 assert.equal(runtime.calls.includes('stable:documentsHub'),false);
 assert.ok(runtime.calls.includes('scroll:0:auto'));
});


test('remaining owner-accessible V267 page centers are exposed through guarded navigation',()=>{
 const workspace=read('src/v267/workspace.js');
 const expected=[
  ['./pages/approval-center.js','openApprovalCenter','aq267-approval-center'],
  ['./pages/bank-reconciliation.js','openBankReconciliation','aq267-bank-reconciliation'],
  ['./pages/contract-foundation.js','openContractFoundation','aq267-contract-foundation'],
  ['./pages/owner-experience-settings.js','openOwnerExperienceSettings','aq267-owner-experience-settings'],
  ['./pages/owner-report.js','openOwnerReport','aq267-owner-report'],
  ['./pages/owner-task-center.js','openOwnerTaskCenter','aq267-owner-task-center'],
  ['./pages/property-admin-settings.js','openPropertyAdminSettings','aq267-property-admin-settings'],
  ['./pages/property-controls.js','openPropertyControls','aq267-property-controls'],
  ['./pages/property-cost-allocation.js','openPropertyCostAllocation','aq267-property-cost-allocation'],
  ['./pages/property-onboarding.js','openPropertyOnboarding','aq267-property-onboarding'],
  ['./pages/tenant-timeline.js','openTenantTimeline','aq267-tenant-timeline']
 ];
 for(const [moduleName,method,id] of expected){
  assert.ok(workspace.includes(moduleName),moduleName+' must be reachable from the workspace');
  assert.ok(workspace.includes(method),method+' must retain its real page opener');
  assert.ok(workspace.includes(id),id+' must have a visible service control');
 }
 assert.match(workspace,/const directPage=.*directoryAllowed\(\{section,manager\}\)/s);
 assert.match(workspace,/bound!==directoryScope\(\)\|\|!directoryAllowed\(\{section,manager\}\)/);
});
