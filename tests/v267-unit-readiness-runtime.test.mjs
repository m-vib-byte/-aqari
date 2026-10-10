import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountUnitReadiness,mountAvailableUnitReadiness} from '../src/v267/pages/unit-readiness.js';

async function fixture({incomplete=false,rejectOnce=false,canWrite=true,canCreate=true,discovery,listFailOnce=false,otherProperty=false}={}){
 const original={window:globalThis.window,document:globalThis.document};const calls=[];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.value='';this.disabled=false;this.style={};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const data={properties:[{id:'p1',name:'عقار الاختبار',can_write:canWrite,can_create:canCreate}],units:[{id:'u1',property_id:'p1',unit_no:'101',revision:0,state:'review_required'}],history:[]};
 if(otherProperty){data.properties.push({id:'p2',name:'عقار ثانٍ',can_write:true,can_create:true});data.units.push({id:'u2',property_id:'p2',unit_no:'202',revision:0,state:'review_required'});}
 const client={rpc(name,args){
  if(name==='aqari_workspace_access')return {abortSignal:async()=>({data:discovery})};
  assert.equal(name,'aqari_unit_readiness_register');calls.push(structuredClone(args));
  return {abortSignal:async()=>{
   if(args.p_action==='list'&&listFailOnce&&data.history.length){listFailOnce=false;return {error:{code:'NETWORK_ERROR',message:'READBACK_UNAVAILABLE'}};}
   if(args.p_action==='record'){
    if(rejectOnce){rejectOnce=false;return {error:{code:'23514',message:'INVALID_READINESS_RECORD'}};}
    const p=structuredClone(args.p_data);let unit=data.units.find(x=>x.property_id===p.property_id&&x.unit_no===p.unit_no);
    if(!unit){unit={id:'new-unit',property_id:p.property_id,unit_no:p.unit_no};data.units.push(unit);}
    if(!data.history.some(x=>x.id===p.id))data.history.push(incomplete?{id:p.id}:{id:p.id,workspace_id:'w',unit_id:unit.id,revision:Number(p.expected_revision)+1,state:p.state,inspected_on:p.inspected_on,source_ref:p.source_ref,reason:p.reason});
    Object.assign(unit,{state:p.state,revision:Number(p.expected_revision)+1});
   }
   return {data:structuredClone(data)};
  }};
 }};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('اختبار الجاهزية');
 if(discovery!==undefined)await d.run(()=>mountAvailableUnitReadiness(d));else mountUnitReadiness(d);
 const elements=()=>d.el.querySelectorAll();
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 const load=elements().find(x=>x.textContent==='تحميل جاهزية الوحدات');if(load)await load.onclick();
 return {data,calls,control,elements,reload:()=>load.onclick(),submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),status:()=>d.status.textContent,fill(){control('نتيجة المعاينة').value='ready';control('تاريخ المعاينة').value='2026-01-01';control('مرجع محضر المعاينة').value='محضر فحص اصطناعي';control('سبب اعتماد الجاهزية أو رفضها').value='اجتازت الوحدة الفحص';},cleanup(){d.el.children[0].onclick();Object.assign(globalThis,original);}};
}
test('actual readiness form records a review and confirms matching independent history readback',async()=>{
 const f=await fixture();try{f.fill();await f.submit();const p=f.calls.find(x=>x.p_action==='record').p_data;assert.equal(p.unit_no,'101');assert.equal(p.expected_revision,0);assert.equal(p.state,'ready');assert.match(f.status(),/تم حفظ المعاينة/);assert.ok(f.elements().some(x=>x.textContent==='اجتازت الوحدة الفحص'));}finally{f.cleanup();}
});
test('new unit entry normalizes Arabic digits and starts an explicit revision without assuming readiness',async()=>{
 const f=await fixture();try{f.control('الوحدة').value='new';f.control('الوحدة').onchange();assert.equal(f.control('نتيجة المعاينة').value,'review_required');f.control('رقم الوحدة الجديدة').value=' ٢٠٢ ';f.fill();await f.submit();const p=f.calls.find(x=>x.p_action==='record').p_data;assert.equal(p.unit_no,'202');assert.equal(p.expected_revision,0);assert.match(f.status(),/تم حفظ المعاينة/);}finally{f.cleanup();}
});
test('incomplete readback never confirms saving; uncertain retry retains the original identity and data',async()=>{
 const f=await fixture({incomplete:true});try{f.fill();await f.submit();assert.match(f.status(),/لم تتأكد مطابقة/);f.control('نتيجة المعاينة').value='not_ready';await f.submit();const writes=f.calls.filter(x=>x.p_action==='record');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.doesNotMatch(f.status(),/تم حفظ/);}finally{f.cleanup();}
});
test('a known rejection permits corrected input with a fresh idempotency key',async()=>{
 const f=await fixture({rejectOnce:true});try{f.fill();await f.submit();f.control('نتيجة المعاينة').value='not_ready';await f.submit();const writes=f.calls.filter(x=>x.p_action==='record');assert.notEqual(writes[0].p_data.id,writes[1].p_data.id);assert.equal(writes[1].p_data.state,'not_ready');assert.match(f.status(),/تم حفظ المعاينة/);}finally{f.cleanup();}
});
test('read-only, foreign property, forged unit and unauthorized unit creation never issue a write',async()=>{
 for(const scenario of ['readonly','property','unit','create']){
  const f=await fixture({canWrite:scenario!=='readonly',canCreate:false});try{f.fill();if(scenario==='property')f.control('العقار').value='foreign';if(scenario==='unit')f.control('الوحدة').value='foreign';if(scenario==='create'){f.control('الوحدة').value='new';f.control('رقم الوحدة الجديدة').value='202';}await f.submit();assert.equal(f.calls.filter(x=>x.p_action==='record').length,0,scenario);}finally{f.cleanup();}
 }
});
test('older, denied and mismatched backend capabilities never mount or call the readiness service',async()=>{
 const access={workspace_id:'w',user_id:'u',role:'general_manager',permissions:{properties:{read:true}}};
 for(const discovery of [access,{...access,features:{unit_readiness:false}},{...access,features:{unit_readiness:true},permissions:{properties:{read:false}}},{...access,features:{unit_readiness:true},workspace_id:'foreign'},null]){
  const f=await fixture({discovery});try{assert.equal(f.calls.length,0);assert.equal(f.elements().some(x=>x.textContent==='تحميل جاهزية الوحدات'),false);}finally{f.cleanup();}
 }
});
test('a matching feature and property permission mounts the real form and verifies saving',async()=>{
 const f=await fixture({discovery:{workspace_id:'w',user_id:'u',role:'general_manager',permissions:{properties:{read:true}},features:{unit_readiness:true}}});try{f.fill();await f.submit();assert.match(f.status(),/تم حفظ المعاينة/);}finally{f.cleanup();}
});

test('a mismatched readback preserves the full inspection instead of rendering unconfirmed history',async()=>{
 const f=await fixture({incomplete:true});try{f.fill();await f.submit();
  assert.match(f.status(),/لم تتأكد مطابقة/);
  assert.equal(f.control('تاريخ المعاينة').value,'2026-01-01');
  assert.equal(f.control('مرجع محضر المعاينة').value,'محضر فحص اصطناعي');
  assert.equal(f.control('سبب اعتماد الجاهزية أو رفضها').value,'اجتازت الوحدة الفحص');
  assert.ok(f.elements().some(x=>x.textContent==='الحالة الحالية: تحتاج معاينة — رقم المراجعة: 0'));
 }finally{f.cleanup();}
});
test('uncertain save cannot switch the displayed property or unit and reload keeps entered evidence',async()=>{
 const f=await fixture({incomplete:true,otherProperty:true});try{f.fill();await f.submit();
  f.control('العقار').value='p2';f.control('العقار').onchange();assert.equal(f.control('العقار').value,'p1');
  f.control('الوحدة').value='new';f.control('الوحدة').onchange();assert.equal(f.control('الوحدة').value,'u1');
  await f.reload();assert.equal(f.control('تاريخ المعاينة').value,'2026-01-01');assert.equal(f.control('العقار').value,'p1');
  await f.submit();const writes=f.calls.filter(x=>x.p_action==='record');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
 }finally{f.cleanup();}
});
test('failed confirmation read keeps the inspection and confirms one saved history entry on deliberate retry',async()=>{
 const f=await fixture({listFailOnce:true});try{f.fill();await f.submit();assert.doesNotMatch(f.status(),/تم حفظ/);assert.equal(f.control('تاريخ المعاينة').value,'2026-01-01');await f.submit();assert.match(f.status(),/تم حفظ/);assert.equal(f.data.history.length,1);const writes=f.calls.filter(x=>x.p_action==='record');assert.deepEqual(writes[0],writes[1]);}finally{f.cleanup();}
});
test('new-unit confirmation retry preserves its property and entered number without creating a second unit',async()=>{
 const f=await fixture({listFailOnce:true,otherProperty:true});try{
  f.control('العقار').value='p2';f.control('العقار').onchange();f.control('الوحدة').value='new';f.control('الوحدة').onchange();f.control('رقم الوحدة الجديدة').value='٣٠٣';f.fill();await f.submit();
  assert.equal(f.control('الوحدة').value,'new');assert.equal(f.control('رقم الوحدة الجديدة').value,'٣٠٣');
  const before=f.calls.length;await f.reload();assert.equal(f.calls.length,before,'refresh must not replace an unresolved inspection');
  await f.submit();assert.match(f.status(),/تم حفظ/);assert.equal(f.control('العقار').value,'p2');assert.equal(f.control('الوحدة').value,'new-unit');assert.equal(f.data.units.length,3);assert.equal(f.data.history.length,1);
  const writes=f.calls.filter(x=>x.p_action==='record');assert.deepEqual(writes[0],writes[1]);assert.equal(writes[1].p_data.property_id,'p2');assert.equal(writes[1].p_data.unit_no,'303');
 }finally{f.cleanup();}
});
