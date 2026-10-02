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
async function fixture({manager=true,corrupt=false,missing=false}={}){
 const original={window:globalThis.window,document:globalThis.document},calls=[];let items=[];
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
 const execute=async(name,args)=>{calls.push({name,args});if(missing)return {error:{code:'PGRST202',message:'aqari_property_channel_settings not found'}};if(args.p_action==='save'){const d=args.p_data;items=[{...d,id:'c',revision:d.revision+1,...(corrupt?{url:'https://wrong.example/'}:{})}];return {data:{record:{id:'c'}}};}return {data:{workspace_id:'w',user_id:'u',propertyId:'p',manager,items}};};const client={rpc:(name,args)=>({abortSignal:()=>execute(name,args)})};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:manager?'general_manager':'staff'}}},addEventListener(){},removeEventListener(){}};
 openPropertyChannels('p');await new Promise(setImmediate);const dialog=body.children.find(n=>n.tagName==='dialog'),all=()=>dialog.querySelectorAll(),button=label=>all().find(n=>n.tagName==='button'&&n.textContent===label);
 return {calls,all,button,status:()=>dialog.children[2].textContent,cleanup(){dialog.children[0].onclick();Object.assign(globalThis,original);}};
}
test('channel save re-reads the exact property and verifies saved URL',async()=>{
 const f=await fixture();try{await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form'),inputs=form.querySelectorAll('input');inputs[0].value='حساب العقار';inputs[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});assert.match(f.status(),/تم حفظ/);const writes=f.calls.filter(x=>x.args.p_action==='save');assert.equal(writes.length,1);assert.equal(writes[0].args.p_data.propertyId,'p');assert.equal(writes[0].args.p_data.tenantVisible,false);assert.ok(f.calls.slice(f.calls.indexOf(writes[0])+1).some(x=>x.args.p_action==='context'));}finally{f.cleanup();}
});
test('readback mismatch never displays saved success',async()=>{
 const f=await fixture({corrupt:true});try{await f.button('إضافة قناة تواصل').onclick();const form=f.all().find(n=>n.tagName==='form');form.querySelectorAll('input')[1].value='https://instagram.com/property';await form.onsubmit({preventDefault(){}});assert.doesNotMatch(f.status(),/تم حفظ القناة/);}finally{f.cleanup();}
});
test('read-only role has no channel mutation controls',async()=>{const f=await fixture({manager:false});try{assert.equal(f.button('إضافة قناة تواصل'),undefined);assert.equal(f.calls.some(x=>x.args.p_action==='save'),false);}finally{f.cleanup();}});
test('missing hosted function is shown as unavailable, never as an empty successful list',async()=>{const f=await fixture({missing:true});try{assert.ok(f.all().some(n=>n.textContent.includes('غير مفعّلة')));assert.equal(f.button('إضافة قناة تواصل'),undefined);}finally{f.cleanup();}});
