import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountRentalContracts} from '../src/v267/pages/rental-contracts.js';

async function fixture({count=45,initial={}}={}){
 const original={window:globalThis.window,document:globalThis.document};let failed=false;const prints=[];
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
 class Query{constructor(table){this.table=table;}select(){return this;}eq(){return this;}order(){return this;}async abortSignal(){return {data:[]};}}
 const client={from:table=>new Query(table),rpc(name){return {abortSignal:async()=>failed?{error:{message:'تعذر تحميل العقود'}}:{data:name==='aqari_read_state_v267'?{payload:{contractsV202:structuredClone(records)}}:[]}};}};
 const body=new Element('body');body.connected=true;globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_RENTAL_RECORDS:{primary:p=>p,contractMarkup:()=>'<p>synthetic review draft</p>',prepareContractPrint:async(...args)=>{prints.push(args);return {html:'<p>synthetic approved sets</p>'};},saveLease(){throw Error('read-only test must never write');}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',role:'general_manager',is_active:true}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('العقود'),view=mountRentalContracts(d,initial);await d.run(view.start);
 const elements=()=>d.el.querySelectorAll(),control=label=>elements().find(x=>x.children[0]?.tagName==='label'&&x.children[0].textContent===label).children[1];
 return {d,records,prints,elements,control,cards:()=>elements().filter(x=>x.className==='aq267-contract-card'),button:text=>elements().find(x=>x.tagName==='button'&&x.textContent===text),text:()=>elements().map(x=>x.textContent||'').join('\n'),fail(value=true){failed=value;},cleanup(){d.close();Object.assign(globalThis,original);}};
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
