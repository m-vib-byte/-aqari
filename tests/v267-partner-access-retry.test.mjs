import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {openPartnerAccess} from '../src/v267/pages/partner-access.js';

async function fixture({writeError=null,readError=null,commitBeforeError=false,changeScope=false}={}){
 const original={window:globalThis.window,document:globalThis.document},calls=[];
 const properties=[{id:'p1',name:'عقار اختبار'}];let rows=[{email:'partner@example.test',display_name:'شريك اختبار',property_id:'p1',is_active:true,revision:4}];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.value='';this.disabled=false;this.textContent='';this.classList={add(){},remove(){}};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...items){for(const item of items){this.children.push(item);item.parent=this;}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  setAttribute(){}addEventListener(){}showModal(){}close(){}focus(){}checkValidity(){return true;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 }
 const client={from(){const query={select(){return query;},eq(){return query;},or(){return query;},order(){return query;},abortSignal:async()=>({data:structuredClone(properties)})};return query;},rpc(name,args){return {abortSignal:async()=>{
  calls.push({name,...structuredClone(args)});
  if(name==='aqari_partner_access_list'){if(readError&&calls.some(c=>c.name==='aqari_manage_partner_access'))return readError;return {data:structuredClone(rows)};}
  assert.equal(name,'aqari_manage_partner_access');
  if(changeScope)window.AQARI_DATA_GATE.scope.workspaceId='other';
  if(!writeError||commitBeforeError){assert.equal(args.p_expected_revision,rows[0].revision);rows=[{email:args.p_email,display_name:args.p_name,property_id:args.p_property_id,is_active:args.p_enabled,revision:rows[0].revision+1}];}
  return writeError||{data:structuredClone(rows[0])};
 }}}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 await openPartnerAccess();const dialog=body.children.find(n=>n.tagName==='dialog'),elements=()=>dialog.querySelectorAll();
 const button=label=>elements().find(n=>n.tagName==='button'&&n.textContent===label),control=label=>elements().find(n=>n.children?.[0]?.tagName==='label'&&n.children[0].textContent===label)?.children[1];
 control('البريد الإلكتروني').value='partner@example.test';control('اسم الشريك').value='اسم مصحح';control('العقار').value='p1';control('تفعيل الوصول').checked=false;control('سبب التعديل').value='إيقاف الوصول بطلب المالك';
 return {calls,control,button,rows:()=>rows,allowWrite(){writeError=null;},save:()=>button('حفظ الإعدادات والتحقق').onclick(),status:()=>dialog.children[2].textContent,connected:()=>dialog.isConnected,cleanup(){if(dialog.isConnected)dialog.children[0].onclick();Object.assign(globalThis,original);}};
}
for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'])test('partner access preserves reason and revision after direct MFA rejection: '+message,async()=>{
 const f=await fixture({writeError:{status:403,error:{code:'42501',message}}});
 try{await f.save();assert.equal(f.button('حفظ الإعدادات والتحقق').disabled,false);assert.equal(f.control('اسم الشريك').value,'اسم مصحح');assert.equal(f.control('سبب التعديل').value,'إيقاف الوصول بطلب المالك');assert.equal(f.control('تفعيل الوصول').checked,false);assert.equal(f.rows()[0].revision,4);assert.equal(f.calls.filter(c=>c.name==='aqari_manage_partner_access').length,1);f.allowWrite();await f.save();assert.equal(f.rows()[0].revision,5);assert.equal(f.rows()[0].is_active,false);assert.deepEqual(f.calls.filter(c=>c.name==='aqari_manage_partner_access').map(c=>c.p_expected_revision),[4,4]);assert.equal(f.control('سبب التعديل').value,'');assert.match(f.status(),/تم الحفظ/);}
 finally{f.cleanup();}
});
test('partner readback MFA after acknowledged write remains locked',async()=>{
 const f=await fixture({readError:{status:403,error:{code:'42501',message:'MFA_REQUIRED'}}});
 try{await f.save();assert.equal(f.button('حفظ الإعدادات والتحقق').disabled,true);assert.equal(f.rows()[0].revision,5);assert.doesNotMatch(f.status(),/لم تنفذ العملية/);await f.save();assert.equal(f.calls.filter(c=>c.name==='aqari_manage_partner_access').length,1);}
 finally{f.cleanup();}
});
test('partner lost response cannot repeat a committed permission change',async()=>{
 const f=await fixture({writeError:{error:{message:'network response lost'}},commitBeforeError:true});
 try{await f.save();assert.equal(f.button('حفظ الإعدادات والتحقق').disabled,true);f.allowWrite();await f.save();assert.equal(f.calls.filter(c=>c.name==='aqari_manage_partner_access').length,1);assert.equal(f.rows()[0].revision,5);await f.button('تحديث الإعدادات').onclick();assert.equal(f.button('حفظ الإعدادات والتحقق').disabled,false);}
 finally{f.cleanup();}
});
for(const response of [{status:500,error:{code:'42501',message:'MFA_REQUIRED'}},{status:403,error:{code:'other',message:'MFA_REQUIRED'}},{status:403,error:{code:'42501',message:'ACCESS_DENIED'}}])test('partner unrelated denial cannot unlock a private form '+JSON.stringify(response),async()=>{
 const f=await fixture({writeError:response});try{await f.save();assert.equal(f.connected(),false);assert.equal(f.rows()[0].revision,4);}finally{f.cleanup();}
});
test('partner scope change cannot unlock a rejected write',async()=>{
 const f=await fixture({writeError:{status:403,error:{code:'42501',message:'MFA_REQUIRED'}},changeScope:true});
 try{await f.save();assert.equal(f.button('حفظ الإعدادات والتحقق').disabled,true);assert.equal(f.rows()[0].revision,4);}finally{f.cleanup();}
});
