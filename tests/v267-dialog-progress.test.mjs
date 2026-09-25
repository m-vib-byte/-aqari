import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {createDialog,node} from '../src/v267/components/dialog.js';

// Exercise the actual dialog and session modules without a network or real accounts.
function fixture(trigger=null){
 const original={window:globalThis.window,document:globalThis.document};
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.textContent='';this.disabled=false;}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(){}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>['button','input','select','textarea'].includes(n.tagName));}
  showModal(){} close(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 }
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:trigger,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'test-user',workspaceId:'test-workspace'}},AQARI_SUPABASE:{getClient:async()=>({}),context:{user:{id:'test-user'},workspace:{id:'test-workspace'},membership:{user_id:'test-user',workspace_id:'test-workspace',role:'general_manager',is_active:true}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('اختبار حالة الاتصال'),enabled=node('input'),disabled=node('button');disabled.disabled=true;d.body.append(enabled,disabled);
 return {d,enabled,disabled,close:()=>d.el.children[0].onclick(),cleanup(){if(!d.closed)d.el.children[0].onclick();Object.assign(globalThis,original);}};
}
test('successful read clears its loading announcement and restores prior control states',async()=>{
 const f=fixture();try{let finish;const wait=new Promise(r=>{finish=r;});const pending=f.d.run(()=>wait);await new Promise(setImmediate);
 assert.equal(f.d.status.textContent,'جارٍ الاتصال…');assert.equal(f.d.body.inert,true);assert.equal(f.enabled.disabled,false);assert.equal(f.disabled.disabled,true);
 finish();await pending;assert.equal(f.d.status.textContent,'','DIALOG_LOADING_STUCK');assert.equal(f.d.el.attrs['aria-busy'],'false');assert.equal(f.d.body.inert,false);assert.equal(f.enabled.disabled,false);assert.equal(f.disabled.disabled,true);
 }finally{f.cleanup();}
});
test('a successful task-specific readback message is retained',async()=>{
 const f=fixture();try{await f.d.run(async()=>{f.d.status.textContent='تم حفظ التعديل وإعادة قراءته.';});assert.equal(f.d.status.textContent,'تم حفظ التعديل وإعادة قراءته.');}finally{f.cleanup();}
});
test('failure is not cleared as success; a later successful retry clears only its loading state',async()=>{
 const f=fixture();try{await f.d.run(async()=>{throw Error('تعذر التحقق من الحفظ.');});assert.equal(f.d.status.textContent,'تعذر التحقق من الحفظ.');assert.equal(f.enabled.disabled,false);
 await f.d.run(async()=>{});assert.equal(f.d.status.textContent,'');assert.equal(f.d.el.attrs['aria-busy'],'false');}finally{f.cleanup();}
});
test('in-flight duplicate actions do not run twice',async()=>{
 const f=fixture();try{let finish,calls=0;const wait=new Promise(r=>{finish=r;});const pending=f.d.run(async()=>{calls++;await wait;});await new Promise(setImmediate);
 assert.equal(f.d.el.attrs['aria-busy'],'true');await f.d.run(async()=>{calls++;});assert.equal(calls,1);finish();await pending;assert.equal(f.d.el.attrs['aria-busy'],'false');}finally{f.cleanup();}
});
test('a late completion cannot change a closed dialog or a newly opened dialog',async()=>{
 const f=fixture();let fresh;try{let finish;const pending=f.d.run(()=>new Promise(r=>{finish=r;}));await new Promise(setImmediate);f.close();fresh=createDialog('نافذة جديدة');fresh.status.textContent='النافذة الجديدة';const before=f.d.status.textContent;
 finish();await pending;assert.equal(f.d.status.textContent,before);assert.equal(fresh.status.textContent,'النافذة الجديدة');assert.equal(createDialog('مكرر'),null);
 }finally{fresh?.el.children[0].onclick();f.cleanup();}
});
test('closing a dialog restores the connected trigger without scrolling the page',()=>{
 const calls=[],trigger={isConnected:true,focus:options=>calls.push(options)},f=fixture(trigger);
 try{f.close();assert.deepEqual(calls,[{preventScroll:true}]);}finally{f.cleanup();}
 const removed=fixture({isConnected:false,focus(){throw Error('detached trigger must not receive focus');}});
 try{assert.doesNotThrow(()=>removed.close());}finally{removed.cleanup();}
});

test('a back action requested during loading runs once after the current read',async()=>{
 const f=fixture();try{let finish;const visits=[];
 const pending=f.d.run(()=>new Promise(r=>{finish=r;}));await new Promise(setImmediate);
 f.d.navigate(async()=>{visits.push('superseded');});
 f.d.navigate(async()=>{visits.push('home');});
 assert.deepEqual(visits,[]);finish();await pending;
 assert.deepEqual(visits,['home']);assert.equal(f.d.el.attrs['aria-busy'],'false');
 }finally{f.cleanup();}
});
test('close remains available during loading and cancels queued navigation',async()=>{
 const f=fixture();let fresh;try{let finish,visits=0;
 const pending=f.d.run(()=>new Promise(r=>{finish=r;}));await new Promise(setImmediate);
 f.d.navigate(async()=>{visits++;});assert.equal(f.d.el.children[0].disabled,false);
 f.close();fresh=createDialog('صفحة جديدة');finish();await pending;
 assert.equal(visits,0);assert.equal(f.d.closed,true);assert.equal(fresh.closed,false);
 }finally{fresh?.close();f.cleanup();}
});
test('queued navigation rechecks the current authorization before running',async()=>{
 const f=fixture();try{let finish,visits=0;
 const pending=f.d.run(()=>new Promise(r=>{finish=r;}));await new Promise(setImmediate);
 f.d.navigate(async()=>{visits++;});window.AQARI_DATA_GATE.scope={userId:'changed',workspaceId:'test-workspace'};
 finish();await pending;assert.equal(visits,0);
 }finally{f.cleanup();}
});

test('readback can enable an existing action and validation can disable it',async()=>{
 const f=fixture();try{
  await f.d.run(async()=>{f.disabled.disabled=false;});
  assert.equal(f.disabled.disabled,false,'a verified record must unlock its existing action');
  await f.d.run(async()=>{f.enabled.disabled=true;});
  assert.equal(f.enabled.disabled,true,'invalid or revoked actions must stay disabled after loading');
 }finally{f.cleanup();}
});
