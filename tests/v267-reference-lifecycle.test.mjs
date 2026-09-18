import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('home is mounted when it arrives after the shell, and remounted after legacy page replacement',()=>{
 const nodes=new Map(),listeners=new Map();let authenticated=true;
 const element=id=>({id,addEventListener(type){listeners.set(id,(listeners.get(id)||0)+1);},insertAdjacentHTML(){nodes.set('aqOwnerExactHome',element('aqOwnerExactHome'));}});
 const body={classList:{add(){}},insertAdjacentHTML(){nodes.set('aqOwnerExactShell',element('aqOwnerExactShell'));}};
 const context=vm.createContext({document:{body,documentElement:{classList:{contains:()=>authenticated}},readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)},window:{AQARI_SUPABASE:{context:{membership:{is_active:true,user_id:'u',workspace_id:'w'},user:{id:'u'},workspace:{id:'w'}}},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'u',workspaceId:'w'}}},t:x=>x,direction:()=> 'rtl',getLocale:()=> 'ar'});
 let source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 source+='\nrefreshMetrics=()=>{};syncActive=()=>{};railMarkup=topMarkup=bottomMarkup=homeMarkup=()=>"";';
 vm.runInContext(source,context);
 vm.runInContext('mountShell()',context);assert.ok(nodes.has('aqOwnerExactShell'));assert.ok(!nodes.has('aqOwnerExactHome'));
 nodes.set('home',element('home'));vm.runInContext('mountShell()',context);assert.ok(nodes.has('aqOwnerExactHome'));
 vm.runInContext('mountShell()',context);assert.equal(listeners.get('aqOwnerExactShell'),1);assert.equal(listeners.get('aqOwnerExactHome'),1);
 nodes.delete('aqOwnerExactHome');vm.runInContext('mountShell()',context);assert.ok(nodes.has('aqOwnerExactHome'));assert.equal(listeners.get('aqOwnerExactHome'),2);
 authenticated=false;nodes.delete('aqOwnerExactHome');vm.runInContext('mountShell()',context);assert.ok(!nodes.has('aqOwnerExactHome'));
});

test('canonical dashboard does not suppress the fallback until replacement content is present',()=>{
 const calls=[];const context=vm.createContext({document:{readyState:'loading',addEventListener(){}},window:{},workspaceIcon:()=>''});
 const source=readFileSync(new URL('../src/v267/live-stability-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);context.calls=calls;
 vm.runInContext('scope=()=>({});observeSources=()=>calls.push("observe");ensureDashboard=()=>false;suppressDuplicateShells=()=>calls.push("hide");',context);
 vm.runInContext('refresh()',context);assert.deepEqual(calls,['observe']);calls.length=0;
 vm.runInContext('ensureDashboard=()=>true;normalizePages=refreshMetrics=refreshPropertyCards=renderFollowups=loadLiveData=()=>{};refresh()',context);
 assert.deepEqual(calls,['hide','observe']);
});
