import test from 'node:test';
import assert from 'node:assert/strict';
import {createPage} from '../src/v267/components/page.js';
import {createDialog,node} from '../src/v267/components/dialog.js';

function fixture(){
 const original={window:globalThis.window,document:globalThis.document},listeners=new Map();
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.events=new Map();this.textContent='';const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)};}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,fn){this.events.set(k,fn);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  showModal(){throw Error('Full page must not call native modal');}close(){throw Error('Full page must not call native dialog close');}focus(){}
 }
 const body=new Element('body'),head=new Element('head');
 globalThis.document={body,head,activeElement:null,getElementById:()=>null,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>({}),context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',role:'general_manager',is_active:true}}},addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
 const page=createPage('عقود البنايات');return {page,body,listeners,restore(){page.close();Object.assign(globalThis,original);}};
}
test('contract pages are full main views and retain the shared authenticated lifecycle',async()=>{
 const f=fixture();try{assert.equal(f.page.el.tagName,'main');assert.ok(f.body.classList.contains('aq267-page-open'));assert.equal(createDialog('duplicate'),null);await f.page.run(async()=>{f.page.body.append(node('p','property fixture'));});assert.equal(f.page.body.children.length,1);f.page.close();assert.equal(f.body.children.length,0);assert.equal(f.body.classList.contains('aq267-page-open'),false);}finally{f.restore();}
});
test('leaving waits for draft flush and a failed flush retains the editor and input',async()=>{
 const f=fixture();try{const input=node('textarea');input.value='36 original clauses fixture';f.page.body.append(input);let finish,calls=0;f.page.setBeforeClose(()=>{calls++;return new Promise(resolve=>finish=resolve);});const closing=f.page.requestClose();await f.page.requestClose();assert.equal(calls,1);assert.equal(f.page.closed,false);finish(false);await closing;assert.equal(f.page.closed,false);assert.equal(input.value,'36 original clauses fixture');f.page.setBeforeClose(async()=>{throw Error('تعذر تأكيد حفظ المسودة.');});await f.page.requestClose();assert.equal(f.page.closed,false);assert.match(f.page.status.textContent,/تعذر/);f.page.setBeforeClose(async()=>true);await f.page.requestClose();assert.equal(f.page.closed,true);}finally{f.restore();}
});
test('revoked session immediately clears the full page despite a draft leave guard',async()=>{
 const f=fixture();try{let guarded=0;f.page.setBeforeClose(()=>{guarded++;return false;});let signal;const pending=f.page.session.request({abortSignal(s){signal=s;return new Promise(()=>{});}});const rejection=assert.rejects(pending);window.AQARI_DATA_GATE.scope=null;f.listeners.get('aqari:auth-boundary')();await rejection;assert.equal(signal.aborted,true);assert.equal(f.page.closed,true);assert.equal(guarded,0);assert.equal(f.body.children.length,0);assert.equal(f.body.classList.contains('aq267-page-open'),false);}finally{f.restore();}
});
