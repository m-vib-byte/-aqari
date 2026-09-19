import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {runAssistantTask} from '../src/v267/components/assistant-request.js';
const source=readFileSync(new URL('../src/v267/owner-feedback-runtime.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const turn=()=>new Promise(r=>setImmediate(r));
test('never-settling work times out and aborts the transport',async()=>{
 const controller=new AbortController();await assert.rejects(runAssistantTask(()=>new Promise(()=>{}),controller,10),/ASSISTANT_TIMEOUT/);assert.equal(controller.signal.aborted,true);
});
test('close settles even when a provider ignores abort; pre-cancelled work never starts',async()=>{
 const controller=new AbortController(),gate=defer();let calls=0;
 const pending=runAssistantTask(()=>{calls++;return gate.promise;},controller);await turn();controller.abort();await assert.rejects(pending,/ASSISTANT_CANCELLED/);gate.resolve('late');
 await assert.rejects(runAssistantTask(()=>{calls++;},controller),/ASSISTANT_CANCELLED/);assert.equal(calls,1);
});
function fixture(){
 const input={value:'سؤال'},button={disabled:false,isConnected:true},rows=[];
 const context={user:{id:'u'},workspace:{id:'w'},membership:{is_active:true,user_id:'u',workspace_id:'w',role:'general_manager'}};
 const dialog={open:true,dataset:{scope:JSON.stringify(['u','w','general_manager'])},close(){this.open=false;},remove(){this.removed=true;rows.forEach(x=>x.isConnected=false);}};
 const nodes={aqExactChatInput:input,aqExactChatForm:{querySelector:()=>button},aqExactChatLog:{append:x=>rows.push(x)},aqExactAssistant:dialog};let fetchCalls=0;
 const box={runAssistantTask,AbortController,setTimeout,clearTimeout,t:x=>x,uiError:message=>Object.assign(new Error(message),{trusted:true}),isUiError:e=>e?.trusted===true,fetch:async()=>{fetchCalls++;return {ok:true,json:async()=>({answer:'الرد'})};},document:{readyState:'loading',addEventListener(){},documentElement:{classList:{contains:()=>true}},body:{dataset:{}},getElementById:id=>nodes[id],querySelectorAll:()=>[],createElement:()=>({dataset:{},classList:{add(){}},isConnected:true})},window:{AQARI_SUPABASE:{context,getSession:async()=>({access_token:'test-token',user:{id:'u'}})},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_EARLY_STORAGE_GATE:{scope:{userId:'u',workspaceId:'w'}}}};
 vm.createContext(box);vm.runInContext(source,box);
 return {box,input,button,rows,dialog,context,get fetchCalls(){return fetchCalls;},send:()=>vm.runInContext('sendAssistant({preventDefault(){}})',box),cancel:()=>vm.runInContext('cancelAssistant()',box),boundary:()=>vm.runInContext('checkAssistantBoundary()',box)};
}
test('successful reply renders text and releases the send button',async()=>{
 const f=fixture();await f.send();assert.equal(f.fetchCalls,1);assert.equal(f.rows.at(-1).textContent,'الرد');assert.equal(f.button.disabled,false);
});
test('repeated submit cannot start parallel requests',async()=>{
 const f=fixture(),gate=defer();f.box.window.AQARI_SUPABASE.getSession=()=>gate.promise;
 const pending=f.send();f.input.value='سؤال آخر';await f.send();assert.equal(f.rows.length,2);assert.equal(f.button.disabled,true);
 gate.resolve({access_token:'test-token',user:{id:'u'}});await pending;assert.equal(f.fetchCalls,1);assert.equal(f.input.value,'سؤال آخر');
});
test('closed dialog cancels session lookup, permits retry and never sends a late request',async()=>{
 const f=fixture(),gate=defer();f.box.window.AQARI_SUPABASE.getSession=()=>gate.promise;
 const pending=f.send();await turn();f.dialog.open=false;f.cancel();await pending;assert.equal(f.button.disabled,false);
 gate.resolve({access_token:'test-token',user:{id:'u'}});await turn();assert.equal(f.fetchCalls,0);
 f.dialog.open=true;f.input.value='إعادة';await f.send();assert.equal(f.fetchCalls,1);
});
test('workspace switch clears the conversation and discards a late response body',async()=>{
 const f=fixture(),body=defer();f.box.fetch=async()=>({ok:true,json:()=>body.promise});
 const pending=f.send();await turn();f.context.workspace.id='other';f.boundary();await pending;
 assert.equal(f.dialog.removed,true);body.resolve({answer:'old private reply'});await turn();assert.ok(f.rows.every(x=>x.textContent!=='old private reply'));
});
test('empty responses show failure, and a different session user cannot send a request',async()=>{
 const f=fixture();f.box.fetch=async()=>({ok:true,json:async()=>({})});await f.send();assert.equal(f.rows.at(-1).textContent,'تعذر الحصول على رد آمن من المساعد.');
 const g=fixture();g.box.window.AQARI_SUPABASE.getSession=async()=>({access_token:'test-token',user:{id:'other'}});await g.send();assert.equal(g.fetchCalls,0);assert.equal(g.button.disabled,false);
});
