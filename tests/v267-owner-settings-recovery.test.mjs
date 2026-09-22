import test from 'node:test';
import assert from 'node:assert/strict';
import {openOwnerExperienceSettings} from '../src/v267/pages/owner-experience-settings.js';

const tick=()=>new Promise(setImmediate);
async function fixture(initialFailure=null){
 const original={window:globalThis.window,document:globalThis.document},calls=[],events=[];
 let fail=initialFailure;
 const settings={workspace_id:'w',revision:0,guest_enabled:false,assistant_enabled:true,report_enabled:false},targets={workspace_id:'w',revision:0,targets:[],owners:[],properties:[]};
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.style={};this.textContent=String(text??'');this.classList={add(){},remove(){}};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  get options(){return this.children;}
  append(...nodes){for(const n of nodes){n.remove?.();this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.textContent='';this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return !selector?all:all.filter(n=>selector.startsWith('.')?n.className===selector.slice(1):selector.split(',').includes(n.tagName));}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 }
 const client={rpc(name,args){return {abortSignal:async()=>{
  calls.push({name,...structuredClone(args)});const target=name==='aqari_owner_report_targets',state=target?targets:settings;
  if(fail&&fail.name===name&&fail.action===args.p_action){const current=fail;fail=null;if(current.commit){Object.assign(state,args.p_data);delete state.expected_revision;state.revision++;}return current.malformed?{data:{workspace_id:'w',revision:state.revision}}:{error:{message:'تعذر الاتصال أثناء الحفظ.'}};}
  if(args.p_action==='save'){if(args.p_data.expected_revision!==state.revision)return {error:{message:'REVISION_CONFLICT'}};Object.assign(state,args.p_data);delete state.expected_revision;state.revision++;}
  return {data:structuredClone(state)};
 }}}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){},dispatchEvent:e=>events.push(e)};
 openOwnerExperienceSettings();await tick();
 const dialog=body.children.find(x=>x.tagName==='dialog'),elements=()=>dialog.querySelectorAll();
 const button=label=>elements().find(x=>x.tagName==='button'&&x.textContent===label),control=label=>elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label)?.children[1];
 return {calls,settings,targets,events,button,control,status:()=>dialog.children[2].textContent,failNext(value){fail=value;},save:()=>button('حفظ الإعدادات').onclick(),reload:()=>button('إعادة قراءة الإعدادات المحفوظة').onclick(),cleanup(){if(dialog.isConnected)dialog.children[0].onclick();Object.assign(globalThis,original);}};
}

test('partial settings save cannot repeat writes until the saved revisions are reread',async()=>{
 const f=await fixture();
 try{
  f.control('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية').checked=true;
  f.failNext({name:'aqari_owner_report_targets',action:'save'});await f.save();
  assert.equal(f.settings.revision,1);assert.equal(f.targets.revision,0);assert.equal(f.events.length,0);assert.match(f.status(),/جزء منها قد حُفظ/);assert.equal(f.button('حفظ الإعدادات').disabled,true);
  const count=f.calls.length;await f.save();assert.equal(f.calls.length,count,'even a captured submit handler cannot repeat the partial write');
  await f.reload();assert.equal(f.button('حفظ الإعدادات').disabled,false);assert.equal(f.control('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية').checked,true);
  await f.save();assert.equal(f.settings.revision,2);assert.equal(f.targets.revision,1);assert.equal(f.events.length,1);
  assert.deepEqual(f.calls.filter(x=>x.p_action==='save').slice(-2).map(x=>x.p_data.expected_revision),[1,0]);
 }finally{f.cleanup();}
});

test('a lost settings response recovers by explicit reads without automatically resending anything',async()=>{
 const f=await fixture();
 try{f.failNext({name:'aqari_owner_experience_settings',action:'save',commit:true});await f.save();assert.equal(f.settings.revision,1);assert.equal(f.targets.revision,0);const before=f.calls.filter(x=>x.p_action==='save').length;await f.reload();assert.equal(f.calls.filter(x=>x.p_action==='save').length,before);assert.equal(f.button('حفظ الإعدادات').disabled,false);assert.equal(f.events.length,0);}
 finally{f.cleanup();}
});

test('failed readback leaves an uncertain save locked and preserves the visible draft',async()=>{
 const f=await fixture();
 try{const guest=f.control('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية');guest.checked=true;f.failNext({name:'aqari_owner_report_targets',action:'save'});await f.save();f.failNext({name:'aqari_owner_report_targets',action:'read'});await f.reload();assert.equal(f.button('حفظ الإعدادات').disabled,true);assert.equal(guest.checked,true);const before=f.calls.length;await f.save();assert.equal(f.calls.length,before);}
 finally{f.cleanup();}
});

test('malformed settings reads never replace the current fields with invented defaults',async()=>{
 const f=await fixture();
 try{const guest=f.control('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية');guest.checked=true;f.failNext({name:'aqari_owner_experience_settings',action:'read',malformed:true});await f.reload();assert.equal(guest.checked,true);assert.match(f.status(),/تعذر التحقق/);assert.equal(f.events.length,0);}
 finally{f.cleanup();}
});

test('settings cannot be saved before the initial authoritative read succeeds',async()=>{
 const f=await fixture({name:'aqari_owner_report_targets',action:'read'});
 try{assert.equal(f.button('حفظ الإعدادات').disabled,true);const before=f.calls.length;await f.save();assert.equal(f.calls.length,before);assert.equal(f.settings.revision,0);assert.equal(f.targets.revision,0);await f.reload();assert.equal(f.button('حفظ الإعدادات').disabled,false);}
 finally{f.cleanup();}
});

test('malformed save acknowledgments cannot replace the draft with default values',async()=>{
 const f=await fixture();
 try{const guest=f.control('وضع الضيف الاختياري — مغلق افتراضيًا وبدون بيانات حقيقية');guest.checked=true;f.failNext({name:'aqari_owner_experience_settings',action:'save',commit:true,malformed:true});await f.save();assert.equal(guest.checked,true);assert.equal(f.button('حفظ الإعدادات').disabled,true);assert.equal(f.events.length,0);assert.match(f.status(),/لم يتأكد حفظ الإعدادات كاملًا/);}
 finally{f.cleanup();}
});
