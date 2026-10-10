import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {openMaintenancePlans} from '../src/v267/pages/maintenance-plans.js';

const tick=()=>new Promise(setImmediate);
async function fixture({rejectSave=false,commitBeforeError=false,saveError=null,readError=null,changeScope=false}={}){
 const original={window:globalThis.window,document:globalThis.document},calls=[];
 const data={workflow_version:2,can_write:true,manager:true,can_complete:true,plans:[],tasks:[],alerts:[],properties:[{id:'p1',name:'عقار تجريبي'}],documents:[],vendors:[],contracts:[]};
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.style={};this.textContent=String(text??'');this.classList={add(){},remove(){}};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){n.remove?.();this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.textContent='';this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 }
 const client={rpc(name,args){assert.equal(name,'aqari_maintenance_plans');return {abortSignal:async()=>{
  calls.push(structuredClone(args));
  if(args.p_action==='list'){if(readError&&calls.some(c=>c.p_action==='save'))return readError;return {data:structuredClone(data)};}
  if(args.p_action==='save'){
   if(saveError){if(changeScope)window.AQARI_DATA_GATE.scope.workspaceId='other';return saveError;}
   if(!rejectSave||commitBeforeError)data.plans.push({...structuredClone(args.p_data),revision:args.p_data.revision+1});
   return rejectSave?{error:{message:'تعذر تأكيد حفظ الخطة.'}}:{data:{ok:true}};
  }
  throw Error('Unexpected test action');
 }}}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 openMaintenancePlans();await tick();
 const dialog=body.children.find(x=>x.tagName==='dialog'),elements=()=>dialog.querySelectorAll();
 const button=label=>elements().find(x=>x.tagName==='button'&&x.textContent===label),control=label=>elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label)?.children[1];
 const enter=()=>{control('العقار').value='p1';control('عنوان الخطة').value='فحص المصعد مع الحفاظ على الملاحظات';control('التكرار بالأيام').value='45';control('موعد الصيانة القادمة').value='2026-10-30';};
 return {data,calls,button,control,elements,enter,allowSave(){saveError=null;},connected:()=>dialog.isConnected,status:()=>dialog.children[2].textContent,save:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),cleanup(){if(dialog.isConnected)dialog.children[0].onclick();Object.assign(globalThis,original);}};
}

test('failed maintenance-plan save preserves every entered value for review',async()=>{
 const f=await fixture({rejectSave:true});
 try{f.enter();await f.save();assert.equal(f.control('العقار').value,'p1');assert.equal(f.control('عنوان الخطة').value,'فحص المصعد مع الحفاظ على الملاحظات');assert.equal(f.control('التكرار بالأيام').value,'45');assert.equal(f.control('موعد الصيانة القادمة').value,'2026-10-30');assert.equal(f.control('عنوان الخطة').disabled,true);assert.equal(f.button('تحديث السجل').disabled,false);assert.match(f.status(),/لم يتأكد الحفظ/);assert.equal(f.data.plans.length,0);}
 finally{f.cleanup();}
});

test('uncertain maintenance save cannot duplicate a committed plan and explicit refresh reveals it',async()=>{
 const f=await fixture({rejectSave:true,commitBeforeError:true});
 try{f.enter();const original=f.elements().find(x=>x.tagName==='form');await f.save();await original.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.p_action==='save').length,1);assert.equal(f.data.plans.length,1);assert.equal(f.control('عنوان الخطة').value,'فحص المصعد مع الحفاظ على الملاحظات');await f.button('تحديث السجل').onclick();assert.ok(f.elements().some(x=>x.tagName==='h3'&&x.textContent==='فحص المصعد مع الحفاظ على الملاحظات'));assert.equal(f.control('عنوان الخطة').disabled,false);assert.equal(f.calls.filter(x=>x.p_action==='save').length,1);}
 finally{f.cleanup();}
});

test('proved maintenance save still resets the new-plan form and shows the saved card',async()=>{
 const f=await fixture();
 try{f.enter();await f.save();assert.equal(f.data.plans.length,1);assert.equal(f.control('عنوان الخطة').value,'');assert.ok(f.elements().some(x=>x.tagName==='h3'&&x.textContent==='فحص المصعد مع الحفاظ على الملاحظات'));assert.match(f.status(),/تم الحفظ والتحقق/);}
 finally{f.cleanup();}
});

for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'])test('maintenance MFA rejection retains draft and allows deliberate retry: '+message,async()=>{
 const f=await fixture({saveError:{status:403,error:{code:'42501',message}}});
 try{f.enter();const title=f.control('عنوان الخطة');await f.save();assert.equal(f.button('حفظ الخطة').disabled,false);assert.equal(f.control('عنوان الخطة'),title);assert.equal(title.value,'فحص المصعد مع الحفاظ على الملاحظات');assert.equal(f.calls.filter(x=>x.p_action==='save').length,1);assert.equal(f.data.plans.length,0);f.allowSave();await f.save();assert.equal(f.data.plans.length,1);assert.deepEqual(f.calls.filter(x=>x.p_action==='save').map(x=>x.p_data.revision),[0,0]);assert.match(f.status(),/تم الحفظ والتحقق/);}
 finally{f.cleanup();}
});
test('maintenance acknowledged write followed by MFA read failure cannot be resent',async()=>{
 const f=await fixture({readError:{status:403,error:{code:'42501',message:'MFA_REQUIRED'}}});
 try{f.enter();const form=f.elements().find(x=>x.tagName==='form');await f.save();assert.doesNotMatch(f.status(),/لم تنفذ العملية/);assert.equal(f.button('حفظ الخطة').disabled,true);await form.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.p_action==='save').length,1);assert.equal(f.data.plans.length,1);assert.doesNotMatch(f.status(),/لم تنفذ العملية/);}
 finally{f.cleanup();}
});
test('maintenance account change during MFA rejection cannot unlock the draft',async()=>{
 const f=await fixture({saveError:{status:403,error:{code:'42501',message:'MFA_REQUIRED'}},changeScope:true});
 try{f.enter();await f.save();assert.equal(f.button('حفظ الخطة').disabled,true);assert.equal(f.data.plans.length,0);}
 finally{f.cleanup();}
});
