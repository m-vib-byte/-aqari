import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog,node} from '../src/v267/components/dialog.js';
import {createPrivateUrls} from '../src/v267/components/private-urls.js';
import {readProtectedPDF} from '../src/v267/api/protected-pdf.js';

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

test('server access revocation disposes private views even while the local membership is unchanged',async()=>{
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
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{getClient:async()=>({}),context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role:'general_manager'}}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 let d;
 try{
  for(const response of [{status:401,error:{message:'session expired'}},{status:403,error:{message:'property access revoked'}},{status:400,error:{message:'permission denied for table',code:'42501'}},{status:400,error:{message:'ACCESS_DENIED'}},{status:401,pdf:true},{status:403,pdf:true}]){
   d=createDialog('Private employee record');d.body.append(node('p','private payroll and audit fixture'));
   const revoked=[],urls=createPrivateUrls(d,{createObjectURL:()=> 'blob:private-fixture',revokeObjectURL:url=>revoked.push(url)});
   const link=node('a','Downloaded private document');link.href=urls.create(new Blob(['private document']));d.body.append(link);
   let cleaned=0,signal;d.onDispose(()=>cleaned++);
   const inFlight=d.session.request({abortSignal(s){signal=s;return new Promise((resolve,reject)=>s.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}});
   const rejected=assert.rejects(inFlight);
   await d.run(()=>response.pdf?readProtectedPDF(d,{getSession:async()=>({user:{id:user},access_token:'synthetic-only'}),fetcher:async()=>({ok:false,status:response.status})}):d.session.request({abortSignal:async()=>response}));
   assert.equal(window.AQARI_SUPABASE.context.membership.is_active,true,'server scope denial can precede local auth updates');
   assert.equal(d.closed,true,'server authorization denial closes the stale private record');
   assert.equal(body.children.length,0,'private DOM disappears before native close is dispatched');
   assert.deepEqual(revoked,['blob:private-fixture'],'already generated download URLs are revoked');
   assert.equal(cleaned,1);assert.equal(signal.aborted,true);await rejected;
   queued.shift()();d=null;
  }
 }finally{if(d&&!d.closed)d.el.children[0].onclick();globalThis.window=originalWindow;globalThis.document=originalDocument;}
});

test('temporary server outages preserve the open dialog, private URLs and unsaved input',async()=>{
 const listeners=new Map(),user='fixture-user',workspace='fixture-workspace';
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.events=new Map();this.isConnected=false;this.disabled=false;}
  get isConnected(){return this.parent?this.parent.isConnected:this._connected===true;}
  set isConnected(value){this._connected=value;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;n.isConnected=this.isConnected;}}
  setAttribute(){}
  addEventListener(name,fn){this.events.set(name,fn);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>['button','input','select','textarea'].includes(n.tagName));}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const body=new Element('body');body.isConnected=true;
 const originalWindow=globalThis.window,originalDocument=globalThis.document;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{getClient:async()=>({}),context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role:'general_manager'}}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 let d;
 try{
  d=createDialog('Draft contract');const draft=node('textarea');draft.value='unsaved contract fixture';d.body.append(draft);
  const revoked=[],urls=createPrivateUrls(d,{createObjectURL:()=> 'blob:pending-fixture',revokeObjectURL:url=>revoked.push(url)});urls.create(new Blob(['pending document']));
  await d.run(()=>d.session.request({abortSignal:async()=>({status:503,error:{message:'temporarily unavailable'}})}));
  assert.equal(d.closed,false);assert.equal(body.children.length,1);assert.equal(draft.value,'unsaved contract fixture');assert.equal(draft.disabled,false);assert.deepEqual(revoked,[]);
  const getSession=async()=>({user:{id:user},access_token:'synthetic-only'});
  await d.run(()=>readProtectedPDF(d,{getSession,fetcher:async()=>({ok:false,status:503})}));
  assert.equal(d.closed,false,'PDF server outages keep the draft open');assert.equal(draft.value,'unsaved contract fixture');assert.equal(draft.disabled,false);assert.deepEqual(revoked,[]);
  let recoveredPDF;
  await d.run(async()=>{recoveredPDF=await readProtectedPDF(d,{getSession,fetcher:async()=>({ok:true,status:200,blob:async()=>new Blob(['synthetic PDF'],{type:'application/pdf'})})});});
  assert.equal(recoveredPDF.type,'application/pdf','PDF export can be retried from the same dialog');
  await d.run(()=>d.session.request({abortSignal:async()=>({status:200,data:{saved:true}})}));
  assert.equal(d.closed,false,'the same dialog remains usable after service recovery');
 }finally{if(d&&!d.closed)d.el.children[0].onclick();globalThis.window=originalWindow;globalThis.document=originalDocument;}
});
