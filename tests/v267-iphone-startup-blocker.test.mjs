import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../src/v267/unified-layout-runtime.js',import.meta.url),'utf8');
const login=readFileSync(new URL('../login.html',import.meta.url),'utf8');

test('dashboard observer ignores its own rendered mutations instead of refreshing forever',()=>{
 assert.doesNotMatch(runtime,/MutationObserver\(\(\)=>\{applyGlobalPageClasses\(\);refreshDashboard\(\);mountDesktopNav\(\);\}\)/);
 assert.match(runtime,/let dashboardRefreshQueued=false/);
 assert.match(runtime,/const externalMutation=records\.some/);
 assert.match(runtime,/target\?\.closest\?\.\('\#'\+ROOT_ID\)/);
 assert.match(runtime,/requestAnimationFrame\(\(\)=>\{[\s\S]*refreshDashboard\(\)/);
});

test('login retires legacy worker and caches before warming auth dependencies',()=>{
 assert.doesNotMatch(login,/retireLegacyReleaseState\(\);warmCore\(\)/);
 const retire=login.indexOf('retireLegacyReleaseState().then(function()');
 const warm=login.indexOf('warmCore();',retire);
 assert.ok(retire>=0&&warm>retire);
});

test('a still-controlled iPhone tab receives one bounded reload after unregister',()=>{
 assert.match(login,/var resetKey='__aqari_sw_retired_v267'/);
 assert.match(login,/navigator\.serviceWorker\.controller/);
 assert.match(login,/sessionStorage\.getItem\(resetKey\)!=='1'/);
 assert.match(login,/sessionStorage\.setItem\(resetKey,'1'\)/);
 assert.match(login,/window\.location\.reload\(\)/);
 assert.match(login,/sessionStorage\.removeItem\(resetKey\)/);
});

function startup({controlled=false,marker=null,storageThrows=false}={}){
 let finish;const calls=[];
 const retirement=new Promise(resolve=>{finish=resolve;});
 const source=login.slice(login.lastIndexOf('setControls();'),login.lastIndexOf('})();</script>'));
 const context={setControls(){},retireLegacyReleaseState:()=>retirement,warmCore:()=>calls.push('warm'),
  navigator:{serviceWorker:{controller:controlled?{}:null}},window:{location:{reload:()=>calls.push('reload')}},
  sessionStorage:{getItem(){if(storageThrows)throw Error('blocked');return marker;},setItem(_key,value){marker=value;},removeItem(){marker=null;}}};
 vm.runInNewContext(source,context);
 return {calls,finish,marker:()=>marker};
}
test('startup waits for retirement before warming dependencies',async()=>{
 const runtime=startup();assert.deepEqual(runtime.calls,[]);
 runtime.finish();await Promise.resolve();assert.deepEqual(runtime.calls,['warm']);
});
test('stale controller reloads once and the marked next load can start',async()=>{
 const first=startup({controlled:true});first.finish();await Promise.resolve();
 assert.deepEqual(first.calls,['reload']);assert.equal(first.marker(),'1');
 const next=startup({controlled:true,marker:first.marker()});next.finish();await Promise.resolve();
 assert.deepEqual(next.calls,['warm']);assert.equal(next.marker(),null);
});
test('blocked browser storage does not prevent startup',async()=>{
 const runtime=startup({controlled:true,storageThrows:true});runtime.finish();await Promise.resolve();
 assert.deepEqual(runtime.calls,['warm']);
});
test('stalled cache retirement has a deadline and releases startup',async()=>{
 const timeout=login.slice(login.indexOf('function withTimeout('),login.indexOf('function resetTimedOutCore('));
 const retire=login.slice(login.indexOf('function retireLegacyReleaseState('),login.indexOf('function validContext('));
 let expire,deadline;const context={releaseResetPromise:null,window:{caches:{keys:()=>new Promise(()=>{})}},navigator:{},
 setTimeout(fn,ms){expire=fn;deadline=ms;return 1;},clearTimeout(){}};
 vm.runInNewContext(timeout+retire+';this.retire=retireLegacyReleaseState;',context);
 const pending=context.retire();assert.equal(deadline,3000);expire();await pending;
});
