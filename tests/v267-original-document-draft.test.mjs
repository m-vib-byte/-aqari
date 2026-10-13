import test from 'node:test';
import assert from 'node:assert/strict';
import {openOriginalDocuments} from '../src/v267/pages/original-documents.js';

async function fixture({failReadback=false,pauseFinalize}={}){
 const original={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 const listeners=new Map(),confirmations=[],calls=[];let discard=false,row,stored;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this._value='';this.files=[];this.style={};}
  get value(){return this._value;}set value(v){this._value=v;if(this.type==='file'&&v==='')this.files=[];}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;if(this.tagName==='select'&&this.children.length===1)this.value=n.value;}}
  replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const client={rpc(name,args){return {abortSignal:async()=>{
  calls.push({name,args:structuredClone(args)});
  if(name==='aqari_document_entities')return {data:[{entity_ref:'record-1',title:'السجل الأول'},{entity_ref:'record-2',title:'السجل الثاني'}]};
  if(name==='aqari_document_listing')return {data:[]};
  if(name==='aqari_reserve_document'){
   row={id:'doc-1',entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,document_type:args.p_document_type,metadata:args.p_metadata,created_by:'u'};
   return {data:{document_id:'doc-1',storage_bucket:'aqari-documents',storage_path:'w/doc-1.pdf'}};
  }
  if(name==='aqari_finalize_document'){await pauseFinalize?.();row.status='uploaded';row.checksum_sha256=args.p_checksum;return {data:'doc-1'};}
  throw Error('Unexpected RPC '+name);
 }};},from(){const q={select(){return q;},eq(){return q;},single(){return q;},async abortSignal(){if(failReadback){failReadback=false;return {error:{message:'READBACK_FAILED'}};}return {data:structuredClone(row)};}};return q;}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co',supabasePublishableKey:'synthetic'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,getSession:async()=>({user:{id:'u'},access_token:'synthetic-test-token'}),context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},confirm(message){confirmations.push(message);return discard;},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
 globalThis.fetch=async(_url,options)=>{if(options.method==='POST'){stored=options.body;calls.push({name:'storage-post'});return {ok:true,json:async()=>({})};}return {ok:true,blob:async()=>stored};};
 await openOriginalDocuments();
 const dialog=body.children[0],elements=()=>dialog.querySelectorAll();
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 const button=label=>{const b=elements().find(x=>x.tagName==='button'&&x.textContent===label);assert.ok(b,label);return b;};
 const record=control('السجل المرتبط');record.value='record-1';await record.onchange();
 return {calls,confirmations,control,button,closed:()=>!body.children.includes(dialog),status:()=>elements().find(x=>x.attributes.role==='status').textContent,
  fill(){control('عنوان المستند').value='مستند اصطناعي';control('الملف الأصلي — صورة أو PDF').files=[new File(['%PDF-1.7\nfixture'],'original.pdf')];},
  allowDiscard(){discard=true;},close:()=>button('إغلاق').onclick(),submit:()=>button('رفع الملف الأصلي والتحقق منه').onclick(),
  unload(){let prevented=false;listeners.get('beforeunload')?.({preventDefault(){prevented=true;}});return prevented;},
  revoke(){window.AQARI_DATA_GATE.scope={};listeners.get('aqari:auth-boundary')?.();},
  cleanup(){window.AQARI_DATA_GATE.scope={};listeners.get('aqari:auth-boundary')?.();Object.assign(globalThis,original);}};
}

test('original document title/file draft survives cancelled close and warns before browser departure',async()=>{
 const f=await fixture();try{f.fill();assert.equal(f.unload(),true);await f.close();assert.equal(f.closed(),false);assert.equal(f.control('الملف الأصلي — صورة أو PDF').files.length,1);assert.match(f.confirmations[0],/غير محفوظ/);f.allowDiscard();await f.close();assert.equal(f.closed(),true);assert.equal(f.unload(),false);}finally{f.cleanup();}
});
test('cancelled record/type/search changes keep the original draft and binding without requesting new records',async()=>{
 for(const action of ['type','record','search']){
  const f=await fixture();try{f.fill();const before=f.calls.length;
   if(action==='search')await f.button('بحث السجلات').onclick();else{const c=f.control(action==='type'?'نوع السجل':'السجل المرتبط');c.value=action==='type'?'tenant':'record-2';await c.onchange();}
   assert.equal(f.control('نوع السجل').value,'property',action);assert.equal(f.control('السجل المرتبط').value,'record-1',action);assert.equal(f.calls.length,before,action);assert.equal(f.control('عنوان المستند').value,'مستند اصطناعي',action);assert.equal(f.control('الملف الأصلي — صورة أو PDF').files.length,1,action);
  }finally{f.cleanup();}
 }
});
test('explicitly discarding a draft before switching records clears its file and title without uploading',async()=>{
 const f=await fixture();try{f.fill();f.allowDiscard();const c=f.control('السجل المرتبط');c.value='record-2';await c.onchange();assert.equal(c.value,'record-2');assert.equal(f.control('عنوان المستند').value,'');assert.equal(f.control('الملف الأصلي — صورة أو PDF').files.length,0);assert.equal(f.unload(),false);assert.equal(f.calls.filter(x=>x.name==='aqari_reserve_document').length,0);}finally{f.cleanup();}
});
test('closing is blocked while an original upload is being verified',async()=>{
 let release,entered;const wait=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});const f=await fixture({pauseFinalize:()=>{entered();return wait;}});let task;
 try{f.fill();task=f.submit();await started;await f.close();assert.equal(f.closed(),false);assert.equal(f.confirmations.length,0);assert.match(f.status(),/انتظر/);assert.equal(f.unload(),true);}finally{release();await task;f.cleanup();}
});
test('failed readback retains the file and upload identity; a deliberate retry confirms without another reservation or upload',async()=>{
 const f=await fixture({failReadback:true});try{f.fill();await f.submit();assert.equal(f.unload(),true);await f.close();assert.equal(f.closed(),false);assert.match(f.confirmations[0],/لم يتأكد/);assert.equal(f.control('الملف الأصلي — صورة أو PDF').files.length,1);await f.submit();assert.match(f.status(),/تم حفظ الأصل/);assert.equal(f.calls.filter(x=>x.name==='aqari_reserve_document').length,1);assert.equal(f.calls.filter(x=>x.name==='storage-post').length,1);assert.equal(f.unload(),false);await f.close();assert.equal(f.closed(),true);assert.equal(f.confirmations.length,1);}finally{f.cleanup();}
});
test('verified save permits departure and a fresh file starts a new protected draft',async()=>{
 const f=await fixture();try{f.fill();await f.submit();assert.match(f.status(),/تم حفظ الأصل/);assert.equal(f.unload(),false);f.control('الملف الأصلي — صورة أو PDF').files=[new File(['%PDF-1.7\nnew'],'next.pdf')];assert.equal(f.unload(),true);await f.close();assert.equal(f.closed(),false);}finally{f.cleanup();}
});
test('auth revocation clears a dirty document form without prompting or writing',async()=>{
 const f=await fixture();try{f.fill();f.revoke();assert.equal(f.closed(),true);assert.equal(f.control('الملف الأصلي — صورة أو PDF').files.length,0);assert.equal(f.confirmations.length,0);assert.equal(f.unload(),false);assert.equal(f.calls.filter(x=>x.name==='aqari_reserve_document').length,0);}finally{f.cleanup();}
});
