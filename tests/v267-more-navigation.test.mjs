import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/v267/premium-navigation-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
function setup({inside=true,authorized=true}={}){
 const calls=[];let listener;
 const menu={open:true,close(){this.open=false;calls.push('close');}};
 const status={textContent:'',classList:{toggle(){}}};
 const context={user:{id:'u'},workspace:{id:'w'},membership:{is_active:true,user_id:'u',workspace_id:'w',role:'staff'}};
 const scope={userId:'u',workspaceId:'w'};
 const window={AQARI_SUPABASE:{context},AQARI_DATA_GATE:{scope},AQARI_EARLY_STORAGE_GATE:{scope},getComputedStyle:()=>({display:'block'}),addEventListener(name,fn){listener=fn;},AQARI_UNIFIED_EXPERIENCE:{openSection(key){calls.push(key);}}};
 const service={hidden:false,disabled:false,getAttribute:()=>null,click(){calls.push('service');assert.equal(menu.open,!inside);}};
 const document={documentElement:{classList:{contains:()=>authorized}},body:{dataset:{}},getElementById:()=>status,querySelectorAll:()=>[service]};
 vm.runInNewContext(source,{window,document});
 const click=key=>{const trigger={dataset:{unifiedSection:key},closest:()=>inside?menu:null};const event={target:{closest:()=>trigger},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};listener(event);return event;};
 return {click,calls,menu,status};
}
test('More closes before opening each direct service; no hidden blocking menu remains',()=>{
 for(const key of ['units','contracts','expenses','staff','owners']){const f=setup();const event=f.click(key);assert.deepEqual(f.calls,['close','service'],key);assert.equal(event.stopped,true);assert.equal(f.menu.open,false);}
});
test('More closes before routing receipts to collections',()=>{
 const f=setup();f.click('receipts');assert.deepEqual(f.calls,['close','collections']);assert.equal(f.menu.open,false);
});
test('ordinary direct navigation does not close an unrelated dialog',()=>{
 const f=setup({inside:false});f.click('contracts');assert.deepEqual(f.calls,['service']);assert.equal(f.menu.open,true);
});
test('More navigation preserves authorization and manager-only checks',async()=>{
 for(const options of [{authorized:false},{}]){const f=setup(options);f.click(options.authorized===false?'contracts':'manager');await Promise.resolve();assert.equal(f.calls.includes('service'),false);assert.ok(f.status.textContent);}
});
test('non-direct routes retain the existing More dialog handler',()=>{
 const f=setup();const event=f.click('home');assert.equal(event.stopped,undefined);assert.equal(f.menu.open,true);assert.deepEqual(f.calls,[]);
});
