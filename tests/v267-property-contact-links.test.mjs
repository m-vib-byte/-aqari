import test from 'node:test';
import assert from 'node:assert/strict';
import {propertyContactUrl,confirmPropertyChannel} from '../src/v267/domain/property-contact-links.js';
import {openPropertyChannels} from '../src/v267/pages/property-channels.js';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';

test('contact links reject executable, relative and credential-bearing URLs',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,test','//evil.test','http://example.com','https://user:pass@example.com','https://exa\nmple.com'])assert.throws(()=>propertyContactUrl(value));
 assert.equal(propertyContactUrl('https://maps.google.com/?q=Kuwait'),'https://maps.google.com/?q=Kuwait');
 assert.equal(propertyContactUrl('+96555555555','whatsapp'),'https://wa.me/96555555555');
 assert.equal(propertyContactUrl('owner@example.com','email'),'mailto:owner@example.com');
 assert.throws(()=>propertyContactUrl('owner@example.com?bcc=other@example.com','email'));
 assert.equal(propertyContactUrl('+96555555555','phone'),'tel:+96555555555');
});
test('channel response must match user workspace and property',()=>{
 const scope={workspace:'w',user:'u',propertyId:'p'},data={workspace_id:'w',user_id:'u',propertyId:'p',items:[]};
 assert.equal(confirmPropertyChannel(data,scope),data);
 for(const key of ['workspace_id','user_id','propertyId'])assert.throws(()=>confirmPropertyChannel({...data,[key]:'other'},scope));
});
async function fixture({manager=true,corrupt=false,missing=false,saveError=null,pauseSave=null,failAfterConfirmed=false,readbackError=null}={}){
 const original={window:globalThis.window,document:globalThis.document},calls=[],listeners=new Map(),confirmations=[];let items=[],allowDiscard=true,savedReads=0;
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.textContent=String(text??'');this.children=[];this.attributes={};this.dataset={};this.style={};this.value='';this.classList={add(){},remove(){}};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children.forEach(n=>n.parent=null);this.children=[];this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...(n.querySelectorAll?.()||[])]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 }
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 const execute=async(name,args)=>{calls.push({name,args});if(missing)return {error:{code:'PGRST202',message:'aqari_property_channel_settings not found'}};if(args.p_action==='save'){if(pauseSave)await pauseSave;if(saveError)return {error:saveError};const d=args.p_data;items=[{...d,id:'c',revision:d.revision+1,...(corrupt?{url:'https://wrong.example/'}:{})}];return {data:{record:{id:'c'}}};}if(readbackError&&items.length)return {error:readbackError};if(failAfterConfirmed&&items.length&&++savedReads===2)return {error:{message:'list refresh unavailable'}};return {data:{workspace_id:'w',user_id:'u',propertyId:'p',manager,items}};};const client={rpc:(name,args)=>({abortSignal:()=>execute(name,args)})};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:manager?'general_manager':'staff'}}},confirm:message=>{confirmations.push(message);return allowDiscard;},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
 openPropertyChannels('p');await new Promise(setImmediate);const dialog=body.children.find(n=>n.tagName==='dialog'),all=()=>dialog.querySelectorAll(),button=label=>all().find(n=>n.tagName==='button'&&n.textContent===label);
 return {calls,all,button,confirmations,setSaveError(error){saveError=error;},chooseDiscard(value){allowDiscard=value;},close:()=>dialog.children[0].onclick(),connected:()=>dialog.isConnected,unload(){let prevented=false;const event={preventDefault(){prevented=true;}};listeners.get('beforeunload')?.(event);return prevented;},revoke(){window.AQARI_DATA_GATE.scope.userId='other';listeners.get('aqari:auth-boundary')?.();},status:()=>dialog.children[2].textContent,cleanup(){window.AQARI_DATA_GATE.scope.userId='other';listeners.get('aqari:auth-boundary')?.();Object.assign(globalThis,original);}};
}
test('channel save re-reads the exact property and verifies saved URL',async()=>{
 const f=await fixture();try{await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form'),inputs=form.querySelectorAll('input');inputs[0].value='حساب العقار';inputs[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});assert.match(f.status(),/تم حفظ/);const writes=f.calls.filter(x=>x.args.p_action==='save');assert.equal(writes.length,1);assert.equal(writes[0].args.p_data.propertyId,'p');assert.equal(writes[0].args.p_data.tenantVisible,false);assert.ok(f.calls.slice(f.calls.indexOf(writes[0])+1).some(x=>x.args.p_action==='context'));}finally{f.cleanup();}
});
test('readback mismatch never displays saved success',async()=>{
 const f=await fixture({corrupt:true});try{await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});assert.doesNotMatch(f.status(),/تم حفظ القناة/);await form.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);await f.button('رجوع').onclick();assert.ok(f.button('إضافة قناة تواصل'));}finally{f.cleanup();}
});
test('read-only role has no channel mutation controls',async()=>{const f=await fixture({manager:false});try{assert.equal(f.button('إضافة قناة تواصل'),undefined);assert.equal(f.calls.some(x=>x.args.p_action==='save'),false);}finally{f.cleanup();}});
test('missing hosted function is shown as unavailable, never as an empty successful list',async()=>{const f=await fixture({missing:true});try{assert.ok(f.all().some(n=>n.textContent.includes('غير مفعّلة')));assert.equal(f.button('إضافة قناة تواصل'),undefined);}finally{f.cleanup();}});

test('channel drafts survive cancelled back and close; refresh warns until confirmed save',async()=>{
 const f=await fixture();try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form'),inputs=form.querySelectorAll('input');
  assert.equal(f.unload(),false);inputs[1].value='https://instagram.com/property';assert.equal(f.unload(),true);
  f.chooseDiscard(false);const count=f.calls.length;await f.button('رجوع').onclick();assert.equal(f.calls.length,count);assert.ok(f.all().includes(form));
  await f.close();assert.equal(f.connected(),true);assert.equal(inputs[1].value,'https://instagram.com/property');
  await form.onsubmit({preventDefault(){}});assert.match(f.status(),/تم حفظ/);assert.equal(f.unload(),false);await f.close();assert.equal(f.connected(),false);
 }finally{f.cleanup();}
});
test('confirmed discard clears the channel draft guard and unchanged values do not prompt',async()=>{
 const f=await fixture();try{
  await f.button('إضافة قناة تواصل').onclick();const input=f.all().find(n=>n.tagName==='input');const original=input.value;input.value='changed';assert.equal(f.unload(),true);input.value=original;assert.equal(f.unload(),false);
  await f.button('رجوع').onclick();assert.equal(f.confirmations.length,0);
  await f.button('إضافة قناة تواصل').onclick();f.all().find(n=>n.tagName==='input').value='discard me';await f.button('رجوع').onclick();assert.equal(f.confirmations.length,1);assert.equal(f.unload(),false);assert.ok(f.button('إضافة قناة تواصل'));
 }finally{f.cleanup();}
});
test('unconfirmed channel save retains warnings without repeating a write',async()=>{
 for(const options of [{corrupt:true},{saveError:{message:'network unavailable'}}]){
  const f=await fixture(options);try{
   await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});
   assert.equal(f.unload(),true);f.chooseDiscard(false);await f.close();assert.equal(f.connected(),true);assert.match(f.confirmations.at(-1),/لم يتأكد/);
   await form.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);
   f.revoke();assert.equal(f.connected(),false);assert.equal(f.unload(),false);
  }finally{f.cleanup();}
 }
});
test('closing during a channel save cannot discard the in-flight operation',async()=>{
 let finish;const pauseSave=new Promise(r=>{finish=r;});const f=await fixture({pauseSave});try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';const pending=form.onsubmit({preventDefault(){}});await new Promise(setImmediate);
  await f.close();assert.equal(f.connected(),true);assert.equal(f.confirmations.length,0);assert.equal(f.unload(),true);finish();await pending;assert.equal(f.unload(),false);
 }finally{finish();await new Promise(setImmediate);f.cleanup();}
});

test('confirmed save remains locked if the following list refresh fails',async()=>{
 const f=await fixture({failAfterConfirmed:true});try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});
  assert.equal(f.unload(),false);assert.doesNotMatch(f.status(),/تم حفظ القناة/);await form.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);
  await f.close();assert.equal(f.connected(),false);assert.equal(f.confirmations.length,0);
 }finally{f.cleanup();}
});

for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'])test(`channel: explicit ${message} preserves draft and permits only a deliberate retry`,async()=>{
 const f=await fixture({saveError:{status:403,code:'42501',message}});try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form'),inputs=form.querySelectorAll('input');inputs[0].value='قناة العقار';inputs[1].value='https://instagram.com/property';inputs[3].value='سبب التعديل المحفوظ';
  await form.onsubmit({preventDefault(){}});assert.equal(f.connected(),true);assert.match(f.status(),/التحقق الثنائي/);assert.equal(f.button('حفظ القناة').disabled,false);
  assert.equal(inputs[0].value,'قناة العقار');assert.equal(inputs[3].value,'سبب التعديل المحفوظ');assert.equal(f.unload(),true);
  f.chooseDiscard(false);await f.button('رجوع').onclick();assert.ok(f.all().includes(form));assert.match(f.confirmations.at(-1),/غير محفوظة/);
  f.setSaveError(null);assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1,'no automatic write after verification');
  await form.onsubmit({preventDefault(){}});const writes=f.calls.filter(x=>x.args.p_action==='save');assert.equal(writes.length,2);assert.deepEqual(writes[1].args.p_data,writes[0].args.p_data);assert.match(f.status(),/تم حفظ القناة/);assert.equal(f.unload(),false);
 }finally{f.cleanup();}
});
for(const error of [{message:'MFA_REQUIRED'},{status:500,code:'42501',message:'MFA_REQUIRED'},{status:403,code:'OTHER',message:'MFA_REQUIRED'},{status:403,code:'42501',message:'ACCESS_DENIED'},{message:'network unavailable'}])test(`channel: ambiguous or unrelated rejection never unlocks a second write (${error.status}/${error.code}/${error.message})`,async()=>{
 const f=await fixture({saveError:error});try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});
  f.setSaveError(null);await form.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);assert.doesNotMatch(f.status(),/تم حفظ القناة/);
 }finally{f.cleanup();}
});
test('channel: MFA during readback never unlocks an acknowledged save',async()=>{
 const f=await fixture({readbackError:{status:403,code:'42501',message:'MFA_REQUIRED'}});try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});
  assert.equal(f.button('حفظ القناة').disabled,true);assert.equal(f.unload(),true);await form.onsubmit({preventDefault(){}});assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);
 }finally{f.cleanup();}
});
test('channel: session revocation after MFA rejection cannot retry the saved draft',async()=>{
 const f=await fixture({saveError:{status:403,code:'42501',message:'MFA_REQUIRED'}});try{
  await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});f.revoke();f.setSaveError(null);
  await form.onsubmit({preventDefault(){}});assert.equal(f.connected(),false);assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);
 }finally{f.cleanup();}
});
