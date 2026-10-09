import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMonthlyDetails} from '../src/v267/pages/maintenance-monthly-details.js';
import {mountMonthlySchedule} from '../src/v267/pages/maintenance-monthly-schedule.js';

const rejection=(message='MFA_REQUIRED',extra={})=>Object.assign(Error(message),{status:403,code:'42501',...extra});

async function fixture(kind){
 const previous=globalThis.document,calls=[],cleanups=[];
 let row=null,schedule={enabled:false,revision:0},writeFailure=null,readFailure=null,scopeValid=true,onSaved=0,loseResponse=false;
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.value='';this.checked=false;this.disabled=false;this.hidden=false;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(){}remove(){this.removed=true;}}
 globalThis.document={createElement:tag=>new Element(tag)};
 const context=()=>({version:1,workspace_id:'w',propertyId:'p',user_id:'u',canWrite:true,canVerify:true,details:row?[{...row}]:[],documents:[],responsibles:[]});
 const check=()=>{if(!scopeValid)throw Error('SESSION_CHANGED');};
 const d={body:new Element('div'),onDispose:fn=>cleanups.push(fn),run:async fn=>{check();return fn();},session:{bound:{workspace:'w',user:'u'},check,request:p=>p,client:{async rpc(name,args){
  calls.push({name,args});
  if(args.p_action==='context'){
   if(readFailure)throw readFailure;
   return kind==='schedule'?{...context(),schedule:{...schedule},reports:[],schedulerReady:true}:context();
  }
  assert.equal(args.p_action,kind==='schedule'?'save_schedule':'save');
  if(writeFailure)throw writeFailure;
  const revision=kind==='schedule'?schedule.revision:row?.revision||0;
  if(args.p_data.revision!==revision)throw Error('REVISION_CONFLICT');
  if(kind==='schedule')schedule={enabled:args.p_data.enabled,revision:revision+1};
  else row={...args.p_data,revision:revision+1,recorded_by:'u',verified_by:args.p_data.verify_result?'u':null};
  if(loseResponse)throw Error('NETWORK_LOST');
  return kind==='schedule'?{...context(),schedule:{...schedule},reports:[],schedulerReady:true}:{record:{...row}};
 }}}};
 let api;
 if(kind==='schedule'){api=mountMonthlySchedule(d,d.body,{propertyId:'p',month:'2026-10',onSnapshot:()=>{}});await api.initialize();}
 else{api=mountMonthlyDetails(d,{task:{id:'task',revision:2,property_id:'p',task_no:'MT1',status:'completed'},context:context(),onSaved:async()=>{onSaved++;}});api.controls.technician_name.value='فني الاختبار';api.reason.value='سبب الاختبار';}
 const submit=()=>kind==='schedule'?api.toggle.onclick():api.form.onsubmit({preventDefault(){}});
 return {api,calls,submit,get locked(){return (kind==='schedule'?api.toggle:api.save).disabled;},get writes(){return calls.filter(x=>['save','save_schedule'].includes(x.args.p_action));},get revision(){return kind==='schedule'?schedule.revision:row?.revision||0;},get saved(){return onSaved;},failWrite(error){writeFailure=error;},failRead(error){readFailure=error;},changeScope(){scopeValid=false;},loseResponse(){loseResponse=true;},concurrentSave(){if(kind==='schedule')schedule={enabled:true,revision:1};else row={task_id:'task',revision:1,recorded_by:'other'};},cleanup(){for(const fn of cleanups)fn();globalThis.document=previous;}};
}

for(const kind of ['details','schedule']){
 for(const message of ['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'])test(`${kind}: explicit ${message} preserves values and permits a deliberate retry`,async()=>{
  const f=await fixture(kind);try{
   f.failWrite(rejection(message));await assert.rejects(f.submit(),new RegExp(message));
   assert.equal(f.locked,false);assert.equal(f.revision,0);assert.equal(f.writes.length,1);
   assert.match(f.api.status.textContent,/التحقق الثنائي/);
   if(kind==='details'){assert.equal(f.api.controls.technician_name.value,'فني الاختبار');assert.equal(f.api.reason.value,'سبب الاختبار');assert.equal(f.api.retry.hidden,true);}
   f.failWrite(null);assert.equal(f.writes.length,1,'no automatic retry after step-up');await f.submit();
   assert.equal(f.revision,1);assert.equal(f.writes.length,2);assert.equal(f.writes[1].args.p_data.revision,0);
   if(kind==='details')assert.equal(f.saved,1);else assert.match(f.api.status.textContent,/الجدولة محفوظة/);
  }finally{f.cleanup();}
 });
 for(const error of [Error('MFA_REQUIRED'),rejection('MFA_REQUIRED',{status:500}),rejection('MFA_REQUIRED',{code:'OTHER'}),rejection('ACCESS_DENIED'),Error('NETWORK_LOST')])test(`${kind}: ambiguous or unrelated rejection remains locked (${error.message}/${error.status}/${error.code})`,async()=>{
  const f=await fixture(kind);try{f.failWrite(error);await assert.rejects(f.submit());assert.equal(f.locked,true);await assert.rejects(f.submit());assert.equal(f.writes.length,1);}finally{f.cleanup();}
 });
 test(`${kind}: MFA during readback cannot authorize resending an acknowledged save`,async()=>{
  const f=await fixture(kind);try{f.failRead(rejection());await assert.rejects(f.submit(),/MFA_REQUIRED/);assert.equal(f.revision,1);assert.equal(f.locked,true);await assert.rejects(f.submit());assert.equal(f.writes.length,1);}finally{f.cleanup();}
 });
 test(`${kind}: lost response is reconciled without a second write`,async()=>{
  const f=await fixture(kind);try{f.loseResponse();await assert.rejects(f.submit(),/NETWORK_LOST/);assert.equal(f.locked,true);await (kind==='schedule'?f.api.refresh:f.api.retry).onclick();assert.equal(f.writes.length,1);assert.equal(f.revision,1);if(kind==='schedule')assert.match(f.api.toggle.textContent,/إيقاف/);else assert.equal(f.saved,1);}finally{f.cleanup();}
 });
 test(`${kind}: retry preserves original revision and rejects a concurrent save`,async()=>{
  const f=await fixture(kind);try{f.failWrite(rejection());await assert.rejects(f.submit());f.failWrite(null);f.concurrentSave();await assert.rejects(f.submit(),/REVISION_CONFLICT/);assert.equal(f.revision,1);assert.equal(f.writes[1].args.p_data.revision,0);assert.equal(f.locked,true);}finally{f.cleanup();}
 });
 test(`${kind}: changed session cannot submit after step-up rejection`,async()=>{
  const f=await fixture(kind);try{f.failWrite(rejection());await assert.rejects(f.submit());f.failWrite(null);f.changeScope();await assert.rejects(f.submit(),/SESSION_CHANGED/);assert.equal(f.writes.length,1);}finally{f.cleanup();}
 });
}
