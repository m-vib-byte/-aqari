import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {guardPageImport,cancelPendingNavigation} from '../src/v267/components/navigation-import.js';

const source=name=>readFileSync(new URL('../src/v267/'+name,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
const flush=()=>new Promise(setImmediate);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('repeated ready boundaries install one listener and schedule one reboot',()=>{
 const listeners=new Map(),timers=[],scope={key:'u|w|general_manager',role:'general_manager'};
 const add=(type,fn)=>{const list=listeners.get(type)||[];if(!list.includes(fn))list.push(fn);listeners.set(type,list);};
 const context={window:{addEventListener:add},document:{readyState:'loading',addEventListener:add,body:{dataset:{}}},setTimeout:fn=>timers.push(fn),scopeValue:scope};
 vm.createContext(context);vm.runInContext(source('unified-layout-runtime.js')+'\nscope=()=>scopeValue;applyGlobalPageClasses=mountDashboard=mountDesktopNav=mountMobileNav=watch=syncNav=()=>{};this.start=boot;',context);
 context.start();
 for(let i=0;i<5;i++){
  for(const fn of [...listeners.get('aqari:auth-boundary')])fn({detail:{state:'ready'}});
  assert.equal(timers.length,1,'one ready event schedules one boot');timers.shift()();
  assert.equal(listeners.get('aqari:auth-boundary').length,1);assert.equal(listeners.get('aqari:v267-controls-changed').length,1);assert.equal(listeners.get('click').length,1);
 }
});

test('a superseded section permission read cannot open a destination over the newer click',async()=>{
 const reads=[],opened=[],context={window:{},document:{readyState:'loading',addEventListener(){}},readAccess:()=>{const request=deferred();reads.push(request);return request.promise;},scopeValue:{key:'u|w|staff',role:'staff'},opened};
 vm.createContext(context);vm.runInContext(source('unified-layout-runtime.js')+'\nscope=()=>scopeValue;access=readAccess;openNative=route=>{opened.push(route);return true;};this.open=openSection;',context);
 const older=context.open('properties'),newer=context.open('maintenance');
 reads[1].resolve({permissions:{maintenance:{read:true}}});assert.equal(await newer,true);
 reads[0].resolve({permissions:{properties:{read:true}}});assert.equal(await older,false);
 assert.deepEqual(opened,['maintenanceProPage']);
});

test('an account change during a section access read prevents the old destination',async()=>{
 const request=deferred(),opened=[],context={window:{},document:{readyState:'loading',addEventListener(){}},readAccess:()=>request.promise,scopeValue:{key:'a|w|staff',role:'staff'},opened};
 vm.createContext(context);vm.runInContext(source('unified-layout-runtime.js')+'\nscope=()=>scopeValue;access=readAccess;openNative=route=>opened.push(route);this.open=openSection;',context);
 const pending=context.open('properties');context.scopeValue={key:'b|other|staff',role:'staff'};request.resolve({permissions:{properties:{read:true}}});
 assert.equal(await pending,false);assert.deepEqual(opened,[]);
});

test('superseded owner navigation stops before the delayed fallback router',async()=>{
 const paints=[],calls=[],context={calls,paints,scopeValue:{key:'u|w|staff'},window:{go:route=>calls.push('go:'+route),AQARI_V199_BASE_GO:route=>calls.push('fallback:'+route),dispatchEvent(){}},document:{readyState:'loading',addEventListener(){}},CustomEvent:class{}};
 vm.createContext(context);vm.runInContext(source('owner-final-runtime.js')+'\nscope=()=>scopeValue;access=async()=>({permissions:{properties:{read:true},tenants:{read:true}}});waitPaint=()=>new Promise(resolve=>paints.push(resolve));routeContextReady=()=>false;page=()=>({});visible=()=>true;directPageCommit=route=>calls.push("commit:"+route);decorate=syncActive=status=()=>{};this.open=navigateOwnerFinal;',context);
 const old=context.open('properties');await flush();const current=context.open('tenants');await flush();
 paints.shift()();await flush();assert.equal(await old,false);assert.equal(calls.includes('fallback:properties'),false);
 paints.shift()();await flush();paints.shift()();assert.equal(await current,true);
 assert.deepEqual(calls,['go:properties','go:tenants','fallback:tenants','commit:tenants']);
});

test('a newer virtual section cancels the owner router delegated by its parent navigation',async()=>{
 const paints=[],calls=[],context={calls,paints,scopeValue:{key:'u|w|staff'},window:{go:route=>calls.push('go:'+route),AQARI_V199_BASE_GO:route=>calls.push('fallback:'+route)},document:{readyState:'loading',addEventListener(){}}};
 vm.createContext(context);vm.runInContext(source('owner-final-runtime.js')+'\nscope=()=>scopeValue;access=async()=>({permissions:{properties:{read:true}}});waitPaint=()=>new Promise(resolve=>paints.push(resolve));routeContextReady=()=>false;status=()=>{};this.open=navigateOwnerFinal;',context);
 let parentCurrent=true;const pending=context.open('properties',()=>parentCurrent);await flush();parentCurrent=false;paints.shift()();
 assert.equal(await pending,false);assert.deepEqual(calls,['go:properties']);
});

test('unified fallback router cannot reactivate a superseded native destination',async()=>{
 const paints=[],calls=[],context={calls,paints,scopeValue:{key:'u|w|staff'},window:{AQARI_OWNER_FINAL:{navigate:async route=>calls.push('owner:'+route)},AQARI_V199_BASE_GO:route=>calls.push('fallback:'+route)},document:{readyState:'loading',addEventListener(){},body:{dataset:{}}}};
 vm.createContext(context);vm.runInContext(source('unified-layout-runtime.js').replace('const waitPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));','const waitPaint=()=>new Promise(resolve=>paints.push(resolve));')+'\nscope=()=>scopeValue;access=async()=>({permissions:{properties:{read:true},tenants:{read:true}}});nativePage=route=>({route});visible=page=>calls.includes("fallback:"+page.route);hideVirtualPages=decorateNativePage=syncNav=()=>{};this.open=openNative;',context);
 const old=context.open('properties');await flush();const current=context.open('tenants');await flush();
 paints.shift()();await flush();assert.equal(await old,false);assert.equal(calls.includes('fallback:properties'),false);
 paints.shift()();await flush();paints.shift()();assert.equal(await current,true);
 assert.equal(context.document.body.dataset.aqUnifiedSection,'tenants');
});

function premium(){
 const request=deferred(),calls=[],status={classList:{toggle(){}},textContent:''},context={scopeValue:{user:'u',workspace:'w',role:'general_manager'},loadModule:()=>request.promise,guardPageImport,cancelPendingNavigation,window:{addEventListener(){},getComputedStyle:()=>({display:'block'})},document:{getElementById:()=>status,querySelectorAll:()=>[{getAttribute(){},click:()=>calls.push('contracts')}],body:{dataset:{}}}};
 vm.createContext(context);vm.runInContext(source('premium-navigation-runtime.js').replace("import(def.module+'?release='+encodeURIComponent(RELEASE))",'loadModule()')+'\nscope=()=>scopeValue;this.open=openDirect;',context);
 return {context,calls,request};
}
test('delayed manager module cannot open after a direct service wins',async()=>{
 const f=premium();const old=f.context.open('manager');await flush();await f.context.open('contracts');
 assert.equal(await old,false);f.request.resolve({openControlCenter:()=>f.calls.push('manager')});await flush();assert.deepEqual(f.calls,['contracts']);
});
test('delayed manager module is discarded if the workspace changes without another click',async()=>{
 const f=premium();const old=f.context.open('manager');await flush();f.context.scopeValue={user:'other',workspace:'other',role:'general_manager'};
 f.request.resolve({openControlCenter:()=>f.calls.push('manager')});assert.equal(await old,false);assert.deepEqual(f.calls,[]);
});
test('guarded manager navigation still opens once when the same scope remains active',async()=>{
 const f=premium();const pending=f.context.open('manager');await flush();f.request.resolve({openControlCenter:()=>f.calls.push('manager')});assert.equal(await pending,true);assert.deepEqual(f.calls,['manager']);
});
