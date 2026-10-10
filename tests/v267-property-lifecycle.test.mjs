import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmPropertyLifecycle,openPropertyLifecycle} from '../src/v267/pages/property-lifecycle.js';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {PROPERTY_LIFECYCLE_MESSAGES} from '../src/v267/components/property-lifecycle-translations.js';
import {t,message} from '../src/v267/components/locale.js';

test('archive labels and errors support every platform language without translating record names',()=>{
 for(const [source,translations] of Object.entries(PROPERTY_LIFECYCLE_MESSAGES))for(const locale of ['en','hi','ur','ml']){
  assert.ok(translations[locale]?.trim());assert.equal(t(source,locale),translations[locale]);
  assert.deepEqual([...translations[locale].matchAll(/\{\w+\}/g)].map(x=>x[0]).sort(),[...source.matchAll(/\{\w+\}/g)].map(x=>x[0]).sort());
 }
 assert.ok(message('أرشفة العقار «{name}»؟ ستبقى جميع الملفات مرتبطة به.',{name:'العقار مؤرشف {units}'},'en').includes('العقار مؤرشف {units}'));
});

test('lifecycle readback is bound to the exact account, property and revision',()=>{
 const scope={workspace:'w',user:'u',propertyId:'p'},value={workspace_id:'w',user_id:'u',propertyId:'p',lifecycle:{state:'active',revision:0}};
 assert.equal(confirmPropertyLifecycle(value,scope),value);
 for(const key of ['workspace_id','user_id','propertyId'])assert.throws(()=>confirmPropertyLifecycle({...value,[key]:'other'},scope));
 for(const lifecycle of [{state:'deleted',revision:1},{state:'active',revision:-1},{state:'active',revision:'1'},{state:'archived',revision:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>confirmPropertyLifecycle({...value,lifecycle},scope));
});

async function fixture(options={}){
 const original={window:globalThis.window,document:globalThis.document},calls=[],listeners=new Map(),confirmations=[];
 let allow=true,fail=options.error,life={state:options.archived?'archived':'active',revision:options.archived?1:0},changed=false;
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
 const execute=async(name,args)=>{
  calls.push({name,args});assert.equal(name,'aqari_property_lifecycle');
  if(options.missing)return {error:{code:'PGRST202',message:'aqari_property_lifecycle not found'}};
  if(options.denied)return {error:{code:'42501',message:'PROPERTY_LIFECYCLE_MANAGER_ONLY'},status:403};
  if(args.p_action!=='context'){
   if(options.pause)await options.pause;if(fail)return {error:fail,status:fail.code==='42501'?403:500};
   life={state:args.p_action==='archive'?'archived':'active',revision:life.revision+1,operationId:args.p_operation_id};changed=true;
  }
  const lifecycle={...life};
  if(options.corrupt&&changed&&(options.corrupt!=='read'||args.p_action==='context'))lifecycle.operationId='wrong';
  return {data:{workspace_id:'w',user_id:'u',propertyId:options.wrongScope?'other':'p',name:'عقار الاختبار',units:1,contracts:1,documents:11,lifecycle}};
 };
 const client={rpc:(name,args)=>({abortSignal:()=>execute(name,args)})};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},confirm:message=>{confirmations.push(message);return allow;},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
 openPropertyLifecycle('p');await new Promise(setImmediate);const dialog=body.children.find(n=>n.tagName==='dialog'),all=()=>dialog?.querySelectorAll()??[],form=()=>all().find(n=>n.tagName==='form');
 return {calls,all,confirmations,form,button:label=>all().find(n=>n.tagName==='button'&&n.textContent===label),writes:()=>calls.filter(x=>x.args.p_action!=='context'),reason(value){form().querySelectorAll('textarea')[0].value=value;},submit:()=>form().onsubmit({preventDefault(){}}),choose(value){allow=value;},clearError(){fail=null;},close:()=>dialog.children[0].onclick(),connected:()=>dialog.isConnected,status:()=>dialog.children[2].textContent,unload(){let prevented=false;listeners.get('beforeunload')?.({preventDefault(){prevented=true;}});return prevented;},revoke(){window.AQARI_DATA_GATE.scope.userId='other';listeners.get('aqari:auth-boundary')?.();},cleanup(){window.AQARI_DATA_GATE.scope.userId='other';listeners.get('aqari:auth-boundary')?.();Object.assign(globalThis,original);}};
}

test('archive and restore verify server state before announcing success',async()=>{
 for(const archived of [false,true]){const f=await fixture({archived});try{
  assert.equal(f.unload(),false);f.reason('سبب موثق للاختبار');assert.equal(f.unload(),true);await f.submit();
  const [write]=f.writes();assert.equal(f.writes().length,1);assert.equal(write.args.p_action,archived?'restore':'archive');assert.equal(write.args.p_expected_revision,archived?1:0);assert.equal(write.args.p_property_id,'p');
  assert.equal(f.calls.at(-1).args.p_action,'context');assert.match(f.status(),archived?/تمت إعادة تفعيل/:/تمت أرشفة/);assert.equal(f.unload(),false);
  assert.ok(f.button(archived?'أرشفة العقار':'إعادة تفعيل العقار'));
 }finally{f.cleanup();}}
});
test('uncertain writes remain guarded and cannot be resubmitted automatically',async()=>{
 for(const options of [{corrupt:true},{corrupt:'read'},{error:{message:'network unavailable'}}]){const f=await fixture(options);try{
  f.reason('سبب موثق للاختبار');await f.submit();assert.doesNotMatch(f.status(),/تمت أرشفة/);assert.equal(f.unload(),true);await f.submit();assert.equal(f.writes().length,1);
  f.choose(false);await f.close();assert.equal(f.connected(),true);f.revoke();assert.equal(f.connected(),false);assert.equal(f.unload(),false);
 }finally{f.cleanup();}}
});
test('rejected recent-MFA step preserves reason and allows deliberate retry',async()=>{
 const f=await fixture({error:{code:'42501',message:'MFA_RECENT_REAUTH_REQUIRED'}});try{
  f.reason('سبب موثق للاختبار');await f.submit();assert.equal(f.connected(),true);assert.match(f.status(),/يلزم تأكيد حديث/);assert.equal(f.form().querySelectorAll('textarea')[0].value,'سبب موثق للاختبار');
  f.clearError();await f.submit();assert.equal(f.writes().length,2);assert.match(f.status(),/تمت أرشفة/);
 }finally{f.cleanup();}
});
test('missing, denied and wrong-scope contexts expose no mutation form',async()=>{
 for(const options of [{missing:true},{denied:true},{wrongScope:true}]){const f=await fixture(options);try{assert.equal(f.form(),undefined);assert.equal(f.writes().length,0);if(options.missing)assert.ok(f.all().some(n=>n.textContent.includes('غير مفعّلة')));}finally{f.cleanup();}}
});
test('cancelled confirmation, invalid reason and cancelled refresh send no mutation',async()=>{
 const f=await fixture();try{
  f.reason('x');await f.submit();assert.equal(f.writes().length,0);f.reason('سبب موثق');f.choose(false);await f.submit();assert.equal(f.writes().length,0);
  const count=f.calls.length;await f.button('تحديث الحالة من الخادم').onclick();assert.equal(f.calls.length,count);await f.close();assert.equal(f.connected(),true);
 }finally{f.cleanup();}
});
test('in-flight archive cannot be double-submitted or closed',async()=>{
 let finish;const pause=new Promise(r=>{finish=r;}),f=await fixture({pause});try{
  f.reason('سبب موثق');const pending=f.submit();await new Promise(setImmediate);await f.submit();await f.close();assert.equal(f.connected(),true);assert.equal(f.writes().length,1);assert.equal(f.unload(),true);
  finish();await pending;assert.equal(f.unload(),false);await f.close();assert.equal(f.connected(),false);
 }finally{finish();await new Promise(setImmediate);f.cleanup();}
});
