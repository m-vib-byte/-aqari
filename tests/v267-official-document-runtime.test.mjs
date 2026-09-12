import test from 'node:test';
import assert from 'node:assert/strict';
import {openOfficialDocumentCenter} from '../src/v267/pages/official-document-center.js';

// Execute the real page, dialog and session modules. Only DOM and network are
// fixtures; this is local acceptance, not a hosted or physical-device result.
async function fixture({wrongScope=false,badPdf=false,wrongUser=false}={}){
 const originals={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 const calls=[],downloads=[],user='fixture-user',workspace='fixture-workspace';
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.events=new Map();this.attributes={};this.value='';this.disabled=false;}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...children){for(const child of children){this.children.push(child);child.parent=this;}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,v){this.events.set(k,v);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  showModal(){}
  close(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
  click(){downloads.push(this.download);}
 }
 const body=new Element('body');body.connected=true;
 const item={id:'doc-fixture',kind:'rent_receipt',document_no:'TEST-001',current_version:2,status:'issued',version:{title:'وصل اختبار',issued_by_name:'مدير اختبار'}};
 const client={rpc(name,args){calls.push({name,args});return {abortSignal:async()=>({data:args.p_action==='list'?{items:[item]}:{series:{id:item.id,workspace_id:wrongScope?'other-workspace':workspace},versions:[{version:1},{version:2}]}})};},auth:{getSession:async()=>({data:{session:{access_token:'fixture-jwt',user:{id:wrongUser?'other-user':user}}}})}};
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:user,workspaceId:workspace}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:user},workspace:{id:workspace},membership:{user_id:user,workspace_id:workspace,is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/official-document');calls.push({url,options});return {ok:true,blob:async()=>new Blob([badPdf?'not a pdf':'%PDF-1.7 fixture'],{type:'application/pdf'})};};
 openOfficialDocumentCenter();await new Promise(setImmediate);
 const dialog=body.children[0],elements=()=>dialog.querySelectorAll(),button=text=>elements().find(x=>x.tagName==='button'&&x.textContent===text);
 return {calls,downloads,elements,button,status:()=>elements().find(x=>x.attributes.role==='status')?.textContent,cleanup(){dialog.children[0].onclick();Object.assign(globalThis,originals);}};
}

test('official archive loads, opens history and downloads the selected immutable version',async()=>{
 const f=await fixture();try{
  assert.equal(f.elements().filter(x=>x.textContent==='تنزيل PDF').length,1);
  await f.button('عرض جميع الإصدارات').onclick();
  assert.ok(f.button('تنزيل الإصدار 1'));
  await f.button('تنزيل الإصدار 1').onclick();
  const request=f.calls.find(x=>x.url);
  assert.deepEqual(JSON.parse(request.options.body),{workspaceId:'fixture-workspace',documentId:'doc-fixture',version:1});
  assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.redirect,'error');
  assert.deepEqual(f.downloads,['TEST-001-v1.pdf']);
 }finally{f.cleanup();}
});
test('cross-workspace archive response cannot expose historical download actions',async()=>{
 const f=await fixture({wrongScope:true});try{await f.button('عرض جميع الإصدارات').onclick();assert.equal(f.button('تنزيل الإصدار 1'),undefined);assert.match(f.status(),/تعذر تأكيد/);}finally{f.cleanup();}
});
test('a PDF content-type with a non-PDF body does not trigger a download',async()=>{
 const f=await fixture({badPdf:true});try{await f.button('تنزيل PDF').onclick();assert.equal(f.downloads.length,0);assert.match(f.status(),/ليس PDF/);}finally{f.cleanup();}
});
test('changed auth user is rejected before sending a document request',async()=>{
 const f=await fixture({wrongUser:true});try{await f.button('تنزيل PDF').onclick();assert.equal(f.calls.filter(x=>x.url).length,0);assert.equal(f.downloads.length,0);}finally{f.cleanup();}
});
