import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountUnitMeterReadings,mountAvailableUnitMeterReadings} from '../src/v267/components/unit-meter-readings.js';
import {createUnitMeterPhoto} from '../src/v267/components/unit-meter-photo.js';
async function fixture({incomplete=false,rejectOnce=false,canWrite=true,discovery}={}){
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
 const data={leases:[{id:'l1',unit_id:'u1',unit_no:'1',property_id:'p1',property_name:'عقار الاختبار',property_ref:'P-1',start_date:'2026-01-01',can_write:canWrite},{id:'l2',unit_id:'u2',unit_no:'2',property_id:'p1',property_name:'عقار الاختبار',can_write:canWrite}],meters:[{id:'m1',property_id:'p1',unit_no:'1',kind:'electricity',serial_no:'S1'},{id:'m2',property_id:'p1',unit_no:'2',kind:'water',serial_no:'S2'}],readings:[]};
 const client={rpc(name,args){if(name==='aqari_workspace_access')return {abortSignal:async()=>({data:discovery})};assert.equal(name,'aqari_unit_meter_register');calls.push(structuredClone(args));return {abortSignal:async()=>{
  if(args.p_action==='record'){
   if(rejectOnce){rejectOnce=false;return {error:{code:'23514',message:'INVALID_METER_READING'}};}
   const p=structuredClone(args.p_data);if(!data.readings.some(x=>x.id===p.id))data.readings.push(incomplete?{id:p.id}:{...p,reading:Number(p.reading).toFixed(3),reading_unit:'kWh',superseded:false});
  }
  return {data:structuredClone(data)};
 }};}};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('اختبار القراءات');if(discovery!==undefined)await d.run(()=>mountAvailableUnitMeterReadings(d));else mountUnitMeterReadings(d);const elements=()=>d.el.querySelectorAll();
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 const load=elements().find(x=>x.textContent==='تحميل قراءات دخول وإخلاء الوحدات');if(load)await load.onclick();
 return {data,calls,control,elements,submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),status:()=>d.status.textContent,fill(){control('قيمة قراءة العداد').value='١٠٠٫١٢٥';control('تاريخ المعاينة').value='2026-01-01';control('مرجع محضر القراءة').value='محضر دخول';control('سبب التسجيل أو التصحيح').value='قراءة دخول موثقة';},cleanup(){d.el.children[0].onclick();Object.assign(globalThis,original);}};
}
test('actual unit meter form filters meters, saves Arabic decimals and verifies stored values',async()=>{
 const f=await fixture();try{assert.deepEqual(f.control('عداد الوحدة').children.map(x=>x.value),['m1']);f.fill();await f.submit();const p=f.calls.find(x=>x.p_action==='record').p_data;assert.equal(p.reading,'100.125');assert.equal(p.phase,'entry');assert.equal(p.lease_id,'l1');assert.match(f.status(),/تم حفظ قراءة الوحدة/);}finally{f.cleanup();}
});
test('incomplete readback never confirms success and retry retains its payload and identity',async()=>{
 const f=await fixture({incomplete:true});try{f.fill();await f.submit();assert.match(f.status(),/لم تتأكد مطابقة/);f.control('قيمة قراءة العداد').value='999';await f.submit();const writes=f.calls.filter(x=>x.p_action==='record');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.doesNotMatch(f.status(),/تم حفظ/);}finally{f.cleanup();}
});
test('a known database rejection permits correcting the form without replaying the rejected values',async()=>{
 const f=await fixture({rejectOnce:true});try{f.fill();await f.submit();f.control('قيمة قراءة العداد').value='101.125';await f.submit();const writes=f.calls.filter(x=>x.p_action==='record');assert.notEqual(writes[0].p_data.id,writes[1].p_data.id);assert.equal(writes[1].p_data.reading,'101.125');assert.match(f.status(),/تم حفظ/);}finally{f.cleanup();}
});
test('read-only role cannot submit and a forged meter selection is rejected before upload or write',async()=>{
 let f=await fixture({canWrite:false});try{f.fill();await f.submit();assert.equal(f.calls.filter(x=>x.p_action==='record').length,0);}finally{f.cleanup();}
 f=await fixture();try{f.fill();f.control('عداد الوحدة').value='m2';await f.submit();assert.equal(f.calls.filter(x=>x.p_action==='record').length,0);}finally{f.cleanup();}
});
test('oversized meter image is rejected before reading file bytes or reserving any object',async()=>{
 const save=createUnitMeterPhoto({check(){throw Error('must not connect');}});
 await assert.rejects(save({size:26*1024*1024,arrayBuffer(){throw Error('must not read');}},{}),/٢٥ ميجابايت/);
});
test('older backends and denied or mismatched access never mount or call the new unit meter service',async()=>{
 const access={workspace_id:'w',user_id:'u',role:'general_manager',permissions:{maintenance:{read:true}}};
 for(const discovery of [access,{...access,features:{unit_meter_readings:false}},{...access,features:{unit_meter_readings:true},permissions:{maintenance:{read:false}}},{...access,features:{unit_meter_readings:true},workspace_id:'another-workspace'},null]){
  const f=await fixture({discovery});try{assert.equal(f.calls.length,0);assert.equal(f.elements().some(x=>x.textContent==='تحميل قراءات دخول وإخلاء الوحدات'),false);}finally{f.cleanup();}
 }
});
test('a matching capability and permission mounts the actual unit meter form and saves with readback',async()=>{
 const f=await fixture({discovery:{workspace_id:'w',user_id:'u',role:'general_manager',permissions:{maintenance:{read:true}},features:{unit_meter_readings:true}}});
 try{f.fill();await f.submit();assert.match(f.status(),/تم حفظ قراءة الوحدة/);assert.equal(f.calls.filter(x=>x.p_action==='record').length,1);}finally{f.cleanup();}
});
