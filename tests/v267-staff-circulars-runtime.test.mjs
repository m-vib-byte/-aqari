import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialog} from '../src/v267/components/dialog.js';
import {mountStaffCirculars,mountAvailableStaffCirculars} from '../src/v267/pages/staff-circulars.js';

async function fixture({manager=true,incomplete=false,discovery}={}){
 const original={window:globalThis.window,document:globalThis.document};const calls=[],versions=[],faults={failRead:false,loseResponse:false,wrongReason:false};let rejectList=false;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.value='';this.checked=false;this.disabled=false;this.style={};}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}showModal(){}close(){}focus(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const data={manager,staff:manager?[{user_id:'employee',name:'موظف الاختبار'}]:[],notices:manager?[]:[{id:'published',title:'تعليمات',body:'نص محفوظ <script>unsafe()</script>',revision:2,status:'published',published_at:'2026-09-12T09:00:00Z',can_ack:true,acknowledged_at:null}]};
 const client={rpc(name,args){
  if(name==='aqari_workspace_access')return {abortSignal:async()=>({data:discovery})};
  assert.equal(name,'aqari_staff_circulars');calls.push(structuredClone(args));
  return {abortSignal:async()=>{
   const {p_action:a,p_data:p}=args;
   if(a==='list'){
    if(rejectList)return {error:{code:'42501',message:'ACCESS_DENIED'}};
    if(faults.failRead){faults.failRead=false;throw Error('temporary read failure');}
    const out=structuredClone(data);if(incomplete&&out.notices.length)out.notices[0].body='قراءة غير مطابقة';return {data:out};
   }
   if(a==='save'){
    const row=data.notices.find(x=>x.id===p.id);
    if(!row)data.notices.push({...structuredClone(p),revision:p.revision+1,status:'draft',can_ack:false,ack_count:0});
    else if(row.revision===p.revision)Object.assign(row,structuredClone(p),{revision:p.revision+1});
    else assert.equal(row.revision,p.revision+1,'retry uses the original expected revision');
    if(faults.loseResponse){faults.loseResponse=false;throw Error('commit response lost');}
    return {data:structuredClone(data.notices.find(x=>x.id===p.id))};
   }
   if(a==='publish'){const r=data.notices.find(x=>x.id===p.id);if(r.status==='draft')Object.assign(r,{revision:p.revision+1,status:'published',published_revision:p.revision+1,published_at:'2026-09-12T09:00:00Z'});return {data:structuredClone(r)};}
   if(a==='ack'){const r=data.notices.find(x=>x.id===p.id);r.acknowledged_at||='2026-09-12T10:00:00Z';return {data:{acknowledged_at:r.acknowledged_at}};}
   if(a==='archive'){const r=data.notices.find(x=>x.id===p.id);Object.assign(r,{revision:p.revision+1,status:'archived'});versions.push({circular_id:r.id,revision:r.revision,action:a,reason:p.reason,after_snapshot:structuredClone(r)});return {data:structuredClone(r)};}
   if(a==='history'){const history=structuredClone(versions);if(faults.wrongReason)history.forEach(v=>v.reason='سبب مختلف');return {data:{versions:history,recipients:[]}};}
   throw Error('Unexpected RPC action '+a);
  }};
 }};
 const body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:t=>new Element(t),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 const role=manager?'general_manager':'accountant';
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role}}},addEventListener(){},removeEventListener(){}};
 const d=createDialog('تعاميم الاختبار');
 if(discovery!==undefined)await d.run(()=>mountAvailableStaffCirculars(d));else{const view=mountStaffCirculars(d);await d.run(view.load);}
 const elements=()=>d.el.querySelectorAll();
 const button=label=>{const el=elements().find(x=>x.tagName==='button'&&x.textContent===label);assert.ok(el,label);return el;};
 const control=label=>{const group=elements().find(x=>x.children?.[0]?.tagName==='label'&&x.children[0].textContent===label);assert.ok(group,label);return group.children[1];};
 return {d,calls,data,faults,elements,control,click:label=>button(label).onclick(),status:()=>d.status.textContent,
  async draft(){await button('إعداد تعميم جديد').onclick();control('عنوان التعميم').value='تعميم تجريبي';control('نص التعميم').value='تعليمات الاختبار المحفوظة';control('موظف الاختبار').checked=true;},
  submit:()=>elements().find(x=>x.tagName==='form').onsubmit({preventDefault(){}}),deny(){rejectList=true;},
  cleanup(){if(!d.closed)d.el.children[0].onclick();Object.assign(globalThis,original);}};
}
test('the actual manager form saves selected recipients and confirms independent readback without publishing',async()=>{
 const f=await fixture();try{await f.draft();await f.submit();const write=f.calls.find(x=>x.p_action==='save');assert.deepEqual(write.p_data.recipient_ids,['employee']);assert.equal(write.p_data.revision,0);assert.match(f.status(),/تم حفظ المسودة/);assert.equal(f.calls.filter(x=>x.p_action==='publish').length,0);assert.equal(f.calls.at(-1).p_action,'list');}finally{f.cleanup();}
});
test('publishing is a separate explicit action tied to the saved revision and content',async()=>{
 const f=await fixture();try{await f.draft();await f.submit();await f.click('نشر للموظفين المحددين');assert.match(f.status(),/تم نشر النسخة/);const p=f.calls.find(x=>x.p_action==='publish');assert.equal(p.p_data.revision,1);assert.equal(f.data.notices[0].body,'تعليمات الاختبار المحفوظة');assert.equal(f.calls.filter(x=>x.p_action==='ack').length,0);}finally{f.cleanup();}
});
test('employee reading does not acknowledge automatically; explicit acknowledgement is re-read',async()=>{
 const f=await fixture({manager:false});try{assert.equal(f.calls.length,1);assert.equal(f.calls[0].p_action,'list');assert.ok(f.elements().some(x=>x.textContent==='نص محفوظ <script>unsafe()</script>'));assert.equal(f.elements().filter(x=>x.tagName==='script').length,0);await f.click('أقر بأنني اطلعت على هذا التعميم');assert.match(f.status(),/تم تسجيل إقرار اطلاعك/);assert.deepEqual(f.calls.find(x=>x.p_action==='ack').p_data,{id:'published',revision:2});assert.equal(f.calls.at(-1).p_action,'list');}finally{f.cleanup();}
});
test('uncertain save retries retain the original request and never claim mismatched readback as success',async()=>{
 const f=await fixture({incomplete:true});try{await f.draft();await f.submit();assert.match(f.status(),/لم تتأكد مطابقة/);f.control('نص التعميم').value='تغيير بعد انقطاع النتيجة';await f.submit();const writes=f.calls.filter(x=>x.p_action==='save');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(f.data.notices.length,1);assert.doesNotMatch(f.status(),/تم حفظ المسودة/);}finally{f.cleanup();}
});
test('empty or forged recipient selection sends no write',async()=>{
 for(const invalid of ['empty','foreign']){const f=await fixture();try{await f.draft();if(invalid==='empty')f.control('موظف الاختبار').checked=false;else f.control('موظف الاختبار').value='foreign';await f.submit();assert.equal(f.calls.filter(x=>x.p_action==='save').length,0);}finally{f.cleanup();}}
});
test('server permission revocation closes the dialog and clears cached circular text',async()=>{
 const f=await fixture({manager:false});try{f.deny();await f.click('تحديث التعاميم');assert.equal(f.d.closed,true);assert.equal(f.elements().some(x=>x.textContent==='نص محفوظ <script>unsafe()</script>'),false);}finally{f.cleanup();}
});
test('a missing or foreign feature never calls the circular RPC',async()=>{
 for(const discovery of [{user_id:'u',workspace_id:'w',role:'general_manager',features:{}},{user_id:'foreign',workspace_id:'w',role:'general_manager',features:{staff_circulars:true}}]){const f=await fixture({discovery});try{assert.equal(f.calls.length,0);assert.ok(f.elements().some(x=>x.textContent==='تعاميم الموظفين غير متاحة لهذا الحساب أو النسخة الحالية.'));}finally{f.cleanup();}}
});
test('opening another circular and publishing cannot erase unsaved text or selected recipients',async()=>{
 const f=await fixture();try{await f.draft();await f.submit();await f.draft();const before=f.control('نص التعميم').value;
  for(const action of ['إعداد تعميم جديد','تعديل المسودة','نشر للموظفين المحددين']){await f.click(action);assert.equal(f.control('نص التعميم').value,before);assert.equal(f.control('موظف الاختبار').checked,true);}
  assert.equal(f.calls.filter(x=>x.p_action==='publish').length,0);
 }finally{f.cleanup();}
});
test('recovering an interrupted save preserves later edits and advances the next explicit save revision',async()=>{
 for(const [recovery,fault] of [['refresh','loseResponse'],['retry','loseResponse'],['refresh','failRead']]){const f=await fixture();try{await f.draft();f.faults[fault]=true;await f.submit();f.control('نص التعميم').value='تعديل جديد بعد الانقطاع';
  if(recovery==='refresh')await f.click('تحديث التعاميم');else await f.submit();
  assert.equal(f.control('نص التعميم').value,'تعديل جديد بعد الانقطاع');assert.equal(f.elements().find(x=>x.tagName==='form').hidden,false);
  await f.submit();const writes=f.calls.filter(x=>x.p_action==='save');assert.equal(writes.at(-1).p_data.revision,1);assert.equal(f.data.notices.length,1);assert.equal(f.data.notices[0].body,'تعديل جديد بعد الانقطاع');assert.match(f.status(),/تم حفظ المسودة/);
 }finally{f.cleanup();}}
});
test('archive success requires the exact reason in its immutable version',async()=>{
 const f=await fixture();try{await f.draft();await f.submit();f.control('سبب الأرشفة').value='انتهى الغرض من التعميم';f.faults.wrongReason=true;
  const archive=f.elements().find(x=>x.tagName==='button'&&x.textContent==='أرشفة التعميم');await archive.parent.onsubmit({preventDefault(){}});
  assert.doesNotMatch(f.status(),/تمت الأرشفة/);assert.match(f.status(),/لم تتأكد/);
  f.faults.wrongReason=false;await f.click('تحديث التعاميم');assert.match(f.status(),/تمت الأرشفة/);assert.equal(f.calls.filter(x=>x.p_action==='archive').length,1);
 }finally{f.cleanup();}
});
test('refreshing staff choices retains removed recipients visibly and blocks a silent partial save',async()=>{
 const f=await fixture();try{await f.draft();f.data.staff=[{user_id:'new-employee',name:'موظف جديد'}];await f.click('تحديث التعاميم');
  const removed=f.elements().find(x=>x.tagName==='input'&&x.value==='employee');assert.ok(removed.checked);assert.ok(removed.disabled);assert.ok(f.control('موظف جديد'));
  await f.submit();assert.equal(f.calls.filter(x=>x.p_action==='save').length,0);assert.equal(f.control('نص التعميم').value,'تعليمات الاختبار المحفوظة');
  await f.click('إزالة الموظف غير المتاح');f.control('موظف جديد').checked=true;await f.submit();assert.deepEqual(f.calls.find(x=>x.p_action==='save').p_data.recipient_ids,['new-employee']);
 }finally{f.cleanup();}
});
