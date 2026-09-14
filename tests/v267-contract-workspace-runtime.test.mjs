import {installContractRoutes} from '../src/v267/components/contract-routing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountRentalContracts} from '../src/v267/pages/rental-contracts.js';

async function fixture({count=45,initial={},propertyRows=[]}={}){
 const original={window:globalThis.window,document:globalThis.document};let failed=false;const prints=[],tenantSaves=[];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.style={};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.textContent='';this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 }
 const records=Array.from({length:count},(_,i)=>({id:i+1,contract_no:'AQ-'+(401+i),tenant:i===0?'أَحمد':'مستأجر '+i,property:i%2?'برج مرزوق':'برج شيخة',unit:String(401+i),start_date:'2026-09-01',end_date:'2027-08-31',status:i%2?'signed':'approved',source:'v267-cloud',tenantProfile:{nameEn:i===0?'Ahmed':'Tenant '+i}}));
 class Query{constructor(table){this.table=table;}select(){return this;}eq(){return this;}order(){return this;}async abortSignal(){return {data:this.table==='aqari_properties'?propertyRows:[]};}}
 const client={from:table=>new Query(table),rpc(name){return {abortSignal:async()=>failed?{error:{message:'تعذر تحميل العقود'}}:{data:name==='aqari_read_state_v267'?{payload:{contractsV202:structuredClone(records)}}:[]}};}};
 const body=new Element('body');body.connected=true;globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_RENTAL_RECORDS:{primary:p=>p,kuwaitDate:()=> '2026-09-14',defaultClauses:()=>[],saveTenantProfile:async p=>{tenantSaves.push(structuredClone(p));return structuredClone(p);},contractMarkup:()=>'<p>synthetic review draft</p>',prepareContractPrint:async(...args)=>{prints.push(args);return {html:'<p>synthetic approved sets</p>'};},saveLease(){throw Error('read-only test must never write');}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',role:'general_manager',is_active:true}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('العقود'),view=mountRentalContracts(d,initial);await d.run(view.start);
 const elements=()=>d.el.querySelectorAll(),control=label=>elements().find(x=>x.children[0]?.tagName==='label'&&x.children[0].textContent===label).children[1];
 return {d,records,prints,tenantSaves,elements,control,cards:()=>elements().filter(x=>x.className==='aq267-contract-card'),button:text=>elements().find(x=>x.tagName==='button'&&x.textContent===text),text:()=>elements().map(x=>x.textContent||'').join('\n'),fail(value=true){failed=value;},cleanup(){d.close();Object.assign(globalThis,original);}};
}
test('actual page exposes all 45 contracts through pages and resets the page when filtering',async()=>{
 const f=await fixture();try{assert.equal(f.cards().length,20);f.button('التالي').onclick();assert.equal(f.cards().length,20);f.button('التالي').onclick();assert.equal(f.cards().length,5);assert.equal(f.button('التالي').hidden,true);
 f.control('البحث في العقود').value='احمد ٤٠١';f.control('البحث في العقود').oninput();assert.equal(f.cards().length,1);assert.match(f.text(),/AQ-401/);
 f.control('مرحلة العقد').value='signed';f.control('مرحلة العقد').onchange();assert.equal(f.cards().length,0);assert.match(f.text(),/لا توجد عقود مطابقة/);
 }finally{f.cleanup();}
});
test('card opens the saved contract and the primary official print action requests two sets',async()=>{
 const f=await fixture({count:1});try{await f.button('فتح ملف العقد').onclick();assert.match(f.text(),/خطوات العقد/);assert.match(f.text(),/الأصل الموقّع لم يُرفع/);assert.ok(f.button('مسح أو رفع العقد ومرفقاته'));
 await f.button('تجهيز نسختين معتمدتين مع الملاحق / Prepare two approved sets').onclick();assert.deepEqual(f.prints,[[1,2,'official']]);
 await f.button('العودة للعقود / Back').onclick();assert.equal(f.cards().length,1);
 }finally{f.cleanup();}
});
test('a failed refresh clears private rows and totals and offers a working retry',async()=>{
 const f=await fixture();try{f.fail();await f.button('تحديث العقود / Refresh').onclick();assert.equal(f.cards().length,0);assert.doesNotMatch(f.text(),/أَحمد|عرض ٤٥|قيد التجهيز/);assert.match(f.d.status.textContent,/تعذر تحميل/);f.fail(false);await f.button('تحديث العقود / Refresh').onclick();assert.equal(f.cards().length,20);}finally{f.cleanup();}
});
test('closing clears rendered contracts and a stale search handler cannot repopulate them',async()=>{
 const f=await fixture();try{const search=f.control('البحث في العقود');f.d.close();search.value='احمد';search.oninput();assert.equal(f.cards().length,0);assert.doesNotMatch(f.text(),/أَحمد/);}finally{f.cleanup();}
});
test('empty state is distinct from a query without matches and record markup stays literal text',async()=>{
 let f=await fixture({count:0});try{assert.match(f.text(),/لا توجد عقود محفوظة/);}finally{f.cleanup();}
 f=await fixture({count:1});try{f.records[0].tenant='<img src=x onerror=alert(1)>';await f.button('تحديث العقود / Refresh').onclick();assert.ok(f.elements().some(x=>x.textContent==='<img src=x onerror=alert(1)>'));assert.equal(f.elements().some(x=>x.tagName==='img'),false);}finally{f.cleanup();}
});

test('new contract saves inline tenant details without clearing contract draft and blocks unsaved profile changes',async()=>{
 const f=await fixture({count:0});try{
  await f.button('إبرام عقد جديد / New rental contract').onclick();assert.ok(f.control('الجنسية بالإنجليزي'));assert.doesNotMatch(f.text(),/العنوان — اختياري/);
  f.control('رقم العقد / Contract number').value='DRAFT-KEEP';f.control('الاسم الكامل بالعربي').value='مستأجر جديد';f.control('الاسم الكامل بالإنجليزي').value='New Tenant';
  await f.button('حفظ بيانات المستأجر واختياره للعقد').onclick();assert.equal(f.tenantSaves.length,1);assert.equal(f.control('رقم العقد / Contract number').value,'DRAFT-KEEP');assert.equal(f.control('المستأجر — سحب البيانات من ملفه / Tenant').value,f.tenantSaves[0].id);
  f.control('الاسم الكامل بالعربي').value='تعديل غير محفوظ';const chosen=f.control('المستأجر — سحب البيانات من ملفه / Tenant');chosen.value='';chosen.onchange();assert.equal(chosen.value,f.tenantSaves[0].id);assert.equal(f.control('الاسم الكامل بالعربي').value,'تعديل غير محفوظ');
  const form=f.elements().find(e=>e.tagName==='form');form.onsubmit({preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,0));assert.match(f.d.status.textContent,/احفظ بيانات المستأجر أولاً/);
 }finally{f.cleanup();}
});

test('legacy go and property shortcuts route to the same contract entry without changing unrelated navigation',async()=>{
 const opened=[],legacy=[];const target={go:function(...args){legacy.push([this,...args]);return 'legacy';}};installContractRoutes(target,async initial=>{opened.push(initial||{});return 'modern';});
 assert.equal(await target.go('smartContractsPage'),'modern');assert.equal(await target.go('leases'),'modern');await target.AQARI_V267_OPEN_CONTRACTS({create:true,property:'برج مرزوق'});
 assert.deepEqual(opened,[{create:true},{},{create:true,property:'برج مرزوق'}]);assert.equal(legacy.length,0);assert.equal(target.go('home','x'),'legacy');assert.equal(legacy[0][0],target);assert.deepEqual(legacy[0].slice(1),['home','x']);
});
test('legacy create entry opens the inline tenant form directly after loading authoritative directory',async()=>{
 const f=await fixture({count:0,initial:{create:true,property:'غير موجود'}});try{assert.ok(f.control('الجنسية بالإنجليزي'));assert.ok(f.button('حفظ بيانات المستأجر واختياره للعقد'));assert.equal(f.control('العقار / Property').value,'');assert.doesNotMatch(f.text(),/مصنع العقود الذكي/);}finally{f.cleanup();}
});

test('property shortcut preselects only an available property in the new contract form',async()=>{
 const f=await fixture({count:0,initial:{create:true,property:'برج مرزوق'},propertyRows:[{id:'p',name:'برج مرزوق'}]});try{assert.equal(f.control('العقار / Property').value,'برج مرزوق');assert.ok(f.control('الاسم الكامل بالعربي'));}finally{f.cleanup();}
});
