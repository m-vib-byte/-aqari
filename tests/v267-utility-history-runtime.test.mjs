import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountUtilityMeters} from '../src/v267/pages/utility-meters.js';

async function fixture({entryCount=121,propertyCount=1,meterCount=1,undated=false}={}){
 const original={window:globalThis.window,document:globalThis.document};
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.value='';this.disabled=false;this.hidden=false;this.style={};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 }
 const id=(prefix,i)=>prefix+String(i).padStart(4,'0');
 const data={
  aqari_properties:Array.from({length:propertyCount},(_,i)=>({id:id('p',i),workspace_id:'w',name:id('عقار ',i),external_ref:id('P-',i)})),
  aqari_utility_meters:Array.from({length:meterCount},(_,i)=>({id:id('m',i),workspace_id:'w',property_id:'p0000',kind:'water',serial_no:id('S-',i)})),
  aqari_utility_entries:Array.from({length:entryCount},(_,i)=>({id:id('e',i),workspace_id:'w',property_id:'p0000',meter_id:'m0000',entry_type:'reading',reading_raw:String(i),reading_unit:'m3',observed_on:undated?null:(i===0?'2026-09-13':'2026-08-01'),recorded_at:'2026-09-13T10:00:00Z',source_ref:id('source-',i)}))
 };
 // Records outside all three boundaries must never enter the history/latest result.
 data.aqari_utility_entries.push(...['workspace_id','property_id','meter_id'].map((key,i)=>({...data.aqari_utility_entries[0],id:'foreign'+i,[key]:'other',reading_raw:'SECRET',observed_on:'2027-01-01'})));
 const calls=[];let failure=null,deferred=null;
 class Query{
  constructor(table){this.table=table;this.filters=[];this.orders=[];this.start=0;this.end=Infinity;}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  not(k,operator,v){assert.equal(operator,'is');this.filters.push(r=>r[k]!==v&&r[k]!==undefined);return this;}
  neq(k,v){this.filters.push(r=>r[k]!==v);return this;}
  order(k,{ascending=true}={}){this.orders.push({k,ascending});return this;}
  range(start,end){assert.ok(Number.isInteger(start)&&Number.isInteger(end));this.start=start;this.end=end;return this;}
  limit(count){this.end=count-1;return this;}
  async abortSignal(){
   calls.push({table:this.table,start:this.start,end:this.end,orders:this.orders});
   if(failure?.(this)){failure=null;return {error:{message:'فشل تحميل السجل'}};}
   if(deferred?.match(this)){const hold=deferred;deferred=null;await hold.wait;}
   const rows=data[this.table].filter(r=>this.filters.every(f=>f(r))).sort((a,b)=>{for(const {k,ascending} of this.orders){const cmp=String(a[k]).localeCompare(String(b[k]));if(cmp)return ascending?cmp:-cmp;}return 0;});
   return {data:structuredClone(rows.slice(this.start,this.end+1))};
  }
 }
 const client={from:table=>new Query(table),rpc(name){assert.equal(name,'aqari_workspace_access');return {abortSignal:async()=>({data:{workspace_id:'w',user_id:'u',role:'general_manager',features:{unit_meter_readings:false}}})};}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('اختبار سجل المرافق'),view=mountUtilityMeters(d);await d.run(view.init);
 const elements=()=>d.el.querySelectorAll(),button=text=>elements().find(x=>x.tagName==='button'&&x.textContent===text);
 const control=label=>elements().find(x=>x.children[0]?.tagName==='label'&&x.children[0].textContent===label).children[1];
 return {d,data,calls,elements,control,button,next:()=>button('السجلات الأقدم').onclick(),previous:()=>button('السجلات الأحدث').onclick(),reload:()=>button('تحديث العدادات والفواتير').onclick(),cards:()=>elements().filter(x=>x.tagName==='article'),text:()=>elements().map(x=>x.textContent||'').join('\n'),fail(fn){failure=fn;},hold(match){let release;const wait=new Promise(r=>release=r);deferred={match,wait};return release;},cleanup(){d.close();Object.assign(globalThis,original);}};
}

test('all 121 records remain reachable with stable equal-timestamp ordering and scoped latest reading',async()=>{
 const f=await fixture();try{
  const seen=[];for(let page=0;page<3;page++){
   assert.equal(f.cards().length,page===2?21:50);
   assert.match(f.text(),/آخر قراءة مؤرخة: 0 m3 — 2026-09-13/);
   assert.doesNotMatch(f.text(),/SECRET/);
   seen.push(...f.cards().map(x=>x.children.find(n=>n.textContent?.startsWith('المصدر: ')).textContent));
   if(page<2){assert.equal(f.button('السجلات الأقدم').hidden,false);assert.equal(f.button('السجلات الأقدم').disabled,false);await f.next();}
  }
  assert.equal(new Set(seen).size,121);assert.equal(seen.at(-1),'المصدر: source-0000');
  assert.equal(f.button('السجلات الأقدم').hidden,true);await f.previous();assert.equal(f.cards().length,50);assert.match(f.text(),/الصفحة 2/);
 }finally{f.cleanup();}
});
test('exact page boundary hides older navigation and missing dates never invent a latest reading',async()=>{
 const f=await fixture({entryCount:50,undated:true});try{assert.equal(f.cards().length,50);assert.equal(f.button('السجلات الأقدم').hidden,true);assert.equal(f.button('السجلات الأحدث').hidden,true);assert.match(f.text(),/معلّقة لعدم وجود تاريخ مثبت/);assert.doesNotMatch(f.text(),/آخر قراءة مؤرخة:/);}finally{f.cleanup();}
});
test('property and meter selectors include records beyond their former truncation limits',async()=>{
 const f=await fixture({propertyCount:205,meterCount:205});try{
  assert.equal(f.control('العقار').children.filter(x=>x.value).length,205);assert.equal(f.control('العداد').children.length,205);
  f.control('العداد').value='m0204';await f.control('العداد').onchange();assert.match(f.text(),/S-0204/);assert.equal(f.cards().length,0);
  f.control('العقار').value='p0204';await f.control('العقار').onchange();assert.equal(f.control('العداد').children.length,0);assert.doesNotMatch(f.text(),/S-0204|source-/);
 }finally{f.cleanup();}
});
test('failed page or latest-reading lookup clears old data and refresh recovers from page one',async()=>{
 for(const failedLatest of [false,true]){
  const f=await fixture();try{
   f.fail(q=>q.table==='aqari_utility_entries'&&(failedLatest?q.end===0:q.start===50));await f.next();
   assert.equal(f.cards().length,0);assert.doesNotMatch(f.text(),/آخر قراءة مؤرخة:/);assert.equal(f.elements().find(x=>x.tagName==='nav').hidden,true);assert.match(f.d.status.textContent,/فشل تحميل/);
   await f.reload();assert.equal(f.cards().length,50);assert.match(f.text(),/الصفحة 1/);
  }finally{f.cleanup();}
 }
});
test('changing property resets pagination and a failed meter load cannot retain the previous selection',async()=>{
 const f=await fixture({propertyCount:2});try{
  await f.next();f.control('العقار').value='p0001';f.fail(q=>q.table==='aqari_utility_meters');await f.control('العقار').onchange();
  assert.equal(f.cards().length,0);assert.equal(f.control('العداد').value,'');assert.equal(f.control('العداد').children.length,0);
  f.control('العقار').value='p0000';await f.control('العقار').onchange();assert.match(f.text(),/الصفحة 1/);
 }finally{f.cleanup();}
});
test('closing during history loading settles immediately and never renders late private rows',async()=>{
 const f=await fixture();try{
  const release=f.hold(q=>q.table==='aqari_utility_entries'&&q.start===50),pending=f.next();
  await new Promise(r=>setImmediate(r));f.d.close();await pending;release();await new Promise(r=>setImmediate(r));
  assert.equal(f.cards().length,0);assert.equal(f.d.closed,true);
 }finally{f.cleanup();}
});
