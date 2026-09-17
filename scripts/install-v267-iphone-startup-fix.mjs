import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const runtimePath=new URL('../src/v267/unified-layout-runtime.js',import.meta.url);
let runtime=readFileSync(runtimePath,'utf8');
const observerAnchor="function watch(){observer?.disconnect?.();observer=new MutationObserver(()=>{applyGlobalPageClasses();refreshDashboard();mountDesktopNav();});observer.observe(document.body,{subtree:true,childList:true});}";
const observerReplacement=`let dashboardRefreshQueued=false;
function watch(){
 observer?.disconnect?.();
 observer=new MutationObserver(records=>{
  applyGlobalPageClasses();
  mountDesktopNav();
  const externalMutation=records.some(record=>{
   const target=record?.target;
   return !target?.closest?.('#'+ROOT_ID);
  });
  if(!externalMutation||dashboardRefreshQueued)return;
  dashboardRefreshQueued=true;
  requestAnimationFrame(()=>{
   dashboardRefreshQueued=false;
   refreshDashboard();
  });
 });
 observer.observe(document.body,{subtree:true,childList:true});
}`;
if(runtime.includes(observerAnchor)){
 runtime=runtime.replace(observerAnchor,observerReplacement);
 writeFileSync(runtimePath,runtime);
 console.log('Fixed V267 authenticated dashboard MutationObserver self-refresh loop.');
}else if(!runtime.includes('dashboardRefreshQueued')){
 throw Error('V267_IPHONE_OBSERVER_ANCHOR_MISSING');
}

const loginPath=new URL('../login.html',import.meta.url);
let login=readFileSync(loginPath,'utf8');
const loginAnchor='setControls();retireLegacyReleaseState();warmCore();})();</script>';
const loginReplacement=`setControls();
retireLegacyReleaseState().then(function(){
 try{
  var resetKey='__aqari_sw_retired_v267';
  if('serviceWorker' in navigator && navigator.serviceWorker.controller && sessionStorage.getItem(resetKey)!=='1'){
   sessionStorage.setItem(resetKey,'1');
   window.location.reload();
   return;
  }
  sessionStorage.removeItem(resetKey);
 }catch(_error){}
 warmCore();
},function(){ warmCore(); });
})();</script>`;
if(login.includes(loginAnchor)){
 login=login.replace(loginAnchor,loginReplacement);
 writeFileSync(loginPath,login);
 console.log('Serialized V267 login startup after legacy worker/cache retirement with one-time controller reload.');
}else if(!login.includes("__aqari_sw_retired_v267")){
 throw Error('V267_IPHONE_LOGIN_RETIRE_ANCHOR_MISSING');
}

runtime=readFileSync(runtimePath,'utf8');
login=readFileSync(loginPath,'utf8');
if(runtime.includes('MutationObserver(()=>{applyGlobalPageClasses();refreshDashboard();mountDesktopNav();})'))throw Error('V267_IPHONE_OBSERVER_LOOP_REMAINS');
if(!runtime.includes("const externalMutation=records.some")||!runtime.includes("target?.closest?.('#'+ROOT_ID)"))throw Error('V267_IPHONE_OBSERVER_GUARD_MISSING');
if(login.includes('retireLegacyReleaseState();warmCore();'))throw Error('V267_IPHONE_LOGIN_STARTUP_RACE_REMAINS');
if(!login.includes("sessionStorage.setItem(resetKey,'1')")||!login.includes('window.location.reload();'))throw Error('V267_IPHONE_STALE_CONTROLLER_RESET_MISSING');

execFileSync(process.execPath,['--check','src/v267/unified-layout-runtime.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-iphone-startup-blocker.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 iPhone startup blocker fix without changing business workflows or data.');
