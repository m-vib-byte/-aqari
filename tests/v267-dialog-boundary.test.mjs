import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog,node} from '../src/v267/components/dialog.js';

// Model the native queued close event: a closed dialog can still have DOM children.
// No browser, service, credentials or business records are used by this unit test.
test('auth boundaries remove private DOM and abort requests before the queued close event',async()=>{
 const queued=[],listeners=new Map(),user='fixture-user',workspace='fixture-workspace';
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.events=new Map();this.isConnected=false;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;n.isConnected=this.isConnected;}}
  setAttribute(){}
  addEventListener(name,fn){this.events.set(name,fn);}
  querySelectorAll(){return [];}
  showModal(){this.open=true;}
  close(){this.open=false;queued.push(()=>this.events.get('close')?.());}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const body=new Element('body');body.isConnected=true;
 const originalWindow=globalThis.window,originalDocument=globalThis.document;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role:'general_manager'}}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 try{
  for(const change of ['logout','workspace','role','escape']){
   window.AQARI_DATA_GATE.scope={userId:user,workspaceId:workspace};window.AQARI_SUPABASE.context.membership.role='general_manager';
   const d=createDialog('اختبار');d.body.append(node('p','private fixture description'));
   let cleanupCalls=0;
   d.onDispose(()=>{cleanupCalls++;});
   const unregister=d.onDispose(()=>{throw Error('unregistered cleanup executed');});unregister();
   let signal;
   const pending=d.session.request({abortSignal(s){signal=s;return new Promise((resolve,reject)=>s.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}});
   const rejected=assert.rejects(pending);
   if(change==='logout')window.AQARI_DATA_GATE.scope=null;
   if(change==='workspace')window.AQARI_DATA_GATE.scope.workspaceId='other-workspace';
   if(change==='role')window.AQARI_SUPABASE.context.membership.role='accountant';
   if(change==='escape'){let prevented=false;d.el.events.get('cancel')({preventDefault(){prevented=true;}});assert.equal(prevented,true);}
   else listeners.get('aqari:auth-boundary')();
   assert.equal(d.closed,true,'session closes during the boundary event');
   assert.equal(cleanupCalls,1,'private resources dispose before native close');
   let lateCleanup=0;d.onDispose(()=>lateCleanup++);assert.equal(lateCleanup,1,'late registration disposes immediately');
   assert.equal(signal.aborted,true,'pending query aborts immediately');
   assert.equal(body.children.length,0,'private dialog DOM is removed synchronously');
   assert.equal(queued.length,1,'native close event is still pending');
   await rejected;
   window.AQARI_DATA_GATE.scope={userId:user,workspaceId:workspace};window.AQARI_SUPABASE.context.membership.role='general_manager';
   const fresh=createDialog('نافذة جديدة');assert.ok(fresh,'new authenticated dialog may open immediately');
   queued.shift()();
   assert.equal(cleanupCalls,1,'queued close cannot repeat cleanup');
   assert.equal(createDialog('تكرار'),null,'old close event must not release a newer dialog');
   fresh.el.children[0].onclick();queued.shift()();assert.equal(body.children.length,0);
  }
 }finally{globalThis.window=originalWindow;globalThis.document=originalDocument;}
});
