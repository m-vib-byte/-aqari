import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('hero search submits the literal query once through record search and preserves it when signed out',async()=>{
 let authenticated=true,opened=0;
 const question={value:'  ما المستحق على عقد <123>؟  '},chat={value:''},sent=[];
 const dialog={showModal(){opened++;},querySelector:selector=>selector==='#aqExactChatInput'?chat:{requestSubmit(){sent.push(chat.value);}}};
 const context=vm.createContext({document:{readyState:'loading',addEventListener(){},documentElement:{classList:{contains:()=>authenticated}},getElementById:id=>({aqExactHeroQuestion:question,aqExactAssistant:dialog})[id]},window:{AQARI_V209:{async open(query){opened++;sent.push(query);return true;}},AQARI_SUPABASE:{context:{membership:{is_active:true,user_id:'u',workspace_id:'w'},user:{id:'u'},workspace:{id:'w'}}},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'u',workspaceId:'w'}}},setTimeout(fn){fn();},t:x=>x,direction:()=> 'rtl',getLocale:()=> 'ar',event:{preventDefault(){}}});
 const source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);
 await vm.runInContext('searchFromHero(event)',context);
 assert.deepEqual(sent,['ما المستحق على عقد <123>؟']);assert.equal(question.value,'');assert.equal(opened,1);
 authenticated=false;question.value='السؤال التالي';
 await vm.runInContext('searchFromHero(event)',context);
 assert.equal(question.value,'السؤال التالي');assert.equal(sent.length,1);assert.equal(opened,1);
 authenticated=true;question.value='   ';
 await vm.runInContext('searchFromHero(event)',context);assert.equal(sent.length,1);
});

test('home is mounted when it arrives after the shell, and remounted after legacy page replacement',()=>{
 const nodes=new Map(),listeners=new Map();let authenticated=true;
 const element=id=>({id,addEventListener(type){listeners.set(id,(listeners.get(id)||0)+1);},insertAdjacentHTML(){nodes.set('aqOwnerExactHome',element('aqOwnerExactHome'));}});
 const body={classList:{add(){},contains:()=>false},insertAdjacentHTML(){nodes.set('aqOwnerExactShell',element('aqOwnerExactShell'));}};
 const context=vm.createContext({document:{body,documentElement:{classList:{contains:()=>authenticated}},readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)},window:{AQARI_SUPABASE:{context:{membership:{is_active:true,user_id:'u',workspace_id:'w'},user:{id:'u'},workspace:{id:'w'}}},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'u',workspaceId:'w'}}},t:x=>x,direction:()=> 'rtl',getLocale:()=> 'ar'});
 let source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 source+='\nrefreshMetrics=()=>{};syncActive=()=>{};railMarkup=topMarkup=bottomMarkup=homeMarkup=()=>"";';
 vm.runInContext(source,context);
 vm.runInContext('mountShell()',context);assert.ok(nodes.has('aqOwnerExactShell'));assert.ok(!nodes.has('aqOwnerExactHome'));
 nodes.set('home',element('home'));vm.runInContext('mountShell()',context);assert.ok(nodes.has('aqOwnerExactHome'));
 vm.runInContext('mountShell()',context);assert.equal(listeners.size,0);
 nodes.delete('aqOwnerExactHome');vm.runInContext('mountShell()',context);assert.ok(nodes.has('aqOwnerExactHome'));assert.equal(listeners.size,0);
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


test('stable reference shell never rewrites legacy dashboard and ignores its own rendered mutations',()=>{
 const calls=[],classes=new Set(['aq-live-stable']);
 const nodes=new Map([['aqOwnerExactShell',{}],['aqOwnerExactHome',{}],['home',{}]]);
 const context=vm.createContext({document:{documentElement:{classList:{contains:()=>true}},readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id),body:{classList:{contains:x=>classes.has(x),add:x=>{classes.add(x);calls.push('class');}}}},window:{AQARI_SUPABASE:{context:{membership:{is_active:true,user_id:'u',workspace_id:'w'},user:{id:'u'},workspace:{id:'w'}}},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'u',workspaceId:'w'}}},t:x=>x,calls});
 const source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);
 vm.runInContext('refreshMetrics=()=>calls.push("metrics");syncActive=()=>calls.push("active");refresh();refresh();',context);
 assert.deepEqual(calls,['class']);
 const inside={closest:selector=>selector.includes('#aqOwnerExactHome')?{}:null};
 context.record={target:inside};assert.equal(vm.runInContext('isExactSourceMutation(record)',context),false);
 context.record={target:{nodeType:3,parentElement:inside}};assert.equal(vm.runInContext('isExactSourceMutation(record)',context),false);
 context.record={target:{closest:()=>null}};assert.equal(vm.runInContext('isExactSourceMutation(record)',context),true);
 classes.delete('aq-live-stable');calls.length=0;
 vm.runInContext('refresh()',context);assert.deepEqual(calls,['metrics','active']);
});
