import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMonthlyDetails} from '../src/v267/pages/maintenance-monthly-details.js';
import {mountMonthlySchedule} from '../src/v267/pages/maintenance-monthly-schedule.js';

async function fixture({failure=null,manager=true}={}){
 const original=globalThis.document,calls=[],dispose=[];let saved=null,schedule={enabled:false,revision:0},closed=0;
 class Element{constructor(tag){this.tagName=tag;this.value='';this.children=[];this.checked=false;this.style={};}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(){}remove(){this.removed=true;}}
 globalThis.document={createElement:tag=>new Element(tag)};
 const context=()=>({version:1,workspace_id:'w',propertyId:'p',user_id:'u',canWrite:true,canVerify:manager,details:saved?[{...saved}]:[],documents:[{id:'invoice',title:'الفاتورة'}],responsibles:[{id:'u',name:'المسؤول'}]});
 const d={body:new Element('div'),onDispose(fn){dispose.push(fn);},run:fn=>Promise.resolve().then(fn),session:{bound:{workspace:'w',user:'u'},check(){},request:p=>p,client:{async rpc(name,args){calls.push({name,args});if(name==='aqari_maintenance_monthly_archive'){
  if(args.p_action==='save_schedule')schedule={enabled:args.p_data.enabled,revision:schedule.revision+1};
  return {version:1,workspace_id:'w',propertyId:failure==='scope'?'foreign':'p',user_id:'u',schedule:{...schedule},reports:[],schedulerReady:false};
 }
 if(args.p_action==='context'){const r=context();if(failure==='readback'&&saved)r.details[0].technician_name='different';return r;}
 if(args.p_action==='save'){const {verify_result,...values}=args.p_data;saved={...values,revision:1,recorded_by:'u',verified_by:verify_result?'u':null};if(failure==='lost_response')throw Error('network');return {record:saved};}
 throw Error('unexpected action');}}}};
 const api=mountMonthlyDetails(d,{task:{id:'task',revision:1,property_id:'p',task_no:'MT1',status:'completed'},context:context(),onSaved:async()=>{closed++;}});
 const values={inspection_kind:'elevator',technician_name:'فني اختبار',inspected_on:'2026-10-01',invoice_number:'INV1',invoice_document_id:'invoice',result_details:'إصلاح موثق',responsible_user_id:'u',planned_close_on:'2026-10-02'};
 for(const [k,v]of Object.entries(values))api.controls[k].value=v;api.reason.value='تسجيل اختباري';
 return {d,api,calls,values,get closed(){return closed;},cleanup(){for(const f of dispose)f();globalThis.document=original;}};
}
test('all six operational fields are saved and confirmed by readback',async()=>{const f=await fixture();try{f.api.verify.checked=true;await f.api.form.onsubmit({preventDefault(){}});assert.equal(f.closed,1);const request=f.calls.find(x=>x.args.p_action==='save');for(const [k,v]of Object.entries(f.values))assert.equal(request.args.p_data[k],v);assert.equal(f.calls.at(-1).args.p_action,'context');}finally{f.cleanup();}});
test('mismatched readback preserves input and prevents another write',async()=>{const f=await fixture({failure:'readback'});try{await assert.rejects(f.api.form.onsubmit({preventDefault(){}}),/مطابقة/);assert.equal(f.api.controls.technician_name.value,'فني اختبار');await assert.rejects(f.api.form.onsubmit({preventDefault(){}}),/تحقق/);assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);assert.equal(f.closed,0);}finally{f.cleanup();}});
test('lost save response recovers from persisted readback without duplicate write',async()=>{const f=await fixture({failure:'lost_response'});try{await assert.rejects(f.api.form.onsubmit({preventDefault(){}}),/network/);await f.api.retry.onclick();assert.equal(f.closed,1);assert.equal(f.calls.filter(x=>x.args.p_action==='save').length,1);}finally{f.cleanup();}});
test('staff cannot select result approval and disposal clears inputs',async()=>{const f=await fixture({manager:false});assert.equal(f.api.verify.disabled,true);f.cleanup();assert.equal(f.api.controls.technician_name.value,'');});
test('schedule toggle verifies persistence and reports a missing runner honestly',async()=>{const f=await fixture();try{const api=mountMonthlySchedule(f.d,f.d.body,{propertyId:'p',month:'2026-10',onSnapshot:()=>{}});await api.initialize();assert.match(api.status.textContent,/غير مثبت/);await api.toggle.onclick();assert.equal(f.calls.filter(x=>x.args.p_action==='save_schedule').length,1);assert.match(api.status.textContent,/8 صباحًا/);assert.equal(api.open.disabled,true);}finally{f.cleanup();}});
test('archive rejects a different property response',async()=>{const f=await fixture({failure:'scope'});try{const api=mountMonthlySchedule(f.d,f.d.body,{propertyId:'p',month:'2026-10',onSnapshot:()=>{}});await assert.rejects(api.initialize(),/نطاق/);}finally{f.cleanup();}});
