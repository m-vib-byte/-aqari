import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
const kinds={get elevator(){return translateStatic('مصعد');},get air_conditioning(){return translateStatic('تكييف');},get fire_system(){return translateStatic('أنظمة إطفاء');},get water_tank(){return translateStatic('خزان مياه');},get generator(){return translateStatic('مولد');},get plumbing(){return translateStatic('تمديدات صحية');},get electrical(){return translateStatic('كهرباء');},get other(){return translateStatic('أخرى');}};
const states={get scheduled(){return translateStatic('بانتظار التكليف');},get assigned(){return translateStatic('تم التكليف');},get in_progress(){return translateStatic('قيد التنفيذ');},get completed(){return translateStatic('مكتملة');},get cancelled(){return translateStatic('ملغاة');}};
const errors={REVISION_CONFLICT:'تغير السجل لدى مستخدم آخر. حدّث السجل قبل التعديل.',PLAN_PROPERTY_IMMUTABLE:'لا يمكن نقل خطة محفوظة إلى عقار آخر.',OPEN_TASK_SCHEDULE_LOCKED:'أكمل المهمة المفتوحة أو ألغها قبل تغيير موعد الخطة أو عقد المورد.',VENDOR_CONTRACT_NOT_VALID_FOR_PLAN:'اختر عقد مورد معتمدًا يغطي العقار وموعد الصيانة.',VENDOR_CONTRACT_MISMATCH:'الجهة المنفذة لا تطابق عقد المورد المرتبط بالخطة.',ACTIVE_VENDOR_REQUIRED:'اختر موردًا فعالًا.',TASK_ASSIGNMENT_REQUIRED:'كلّف موردًا فعالًا قبل بدء المهمة.',TASK_EXECUTION_REQUIRED:'ابدأ التنفيذ قبل اعتماد إكمال المهمة.',DUPLICATE_DUE_TASK:'توجد مهمة محفوظة لهذا الموعد؛ راجع المهام أسفل الصفحة.'};
const text=(tag,value)=>node(tag,String(value??''));const opt=(value,label)=>{const o=node('option',label);o.value=value;return o;};
function select(items,placeholder,required=true){const s=node('select');s.append(opt('',placeholder));for(const item of items)s.append(opt(item.id,item.name||item.title));s.required=required;return s;}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function button(label,action){const b=node('button',label);b.type='button';b.onclick=action;return b;}
export function openMaintenancePlans(){
 const d=createDialog(translateStatic('الصيانة الدورية والتنبيهات'));if(!d)return;
 let data=null,pending=false,uncertain=false,editing=null;
 const toolbar=node('div'),reload=node('button',translateStatic('تحديث السجل')),prepare=node('button',translateStatic('تجهيز تنبيهات اليوم')),summary=node('section'),editor=node('section'),plans=node('section'),tasks=node('section'),alerts=node('section');
 reload.type=prepare.type='button';toolbar.append(reload,prepare);d.body.append(text('p',translateStatic('اختر خطة، كلّف الجهة المنفذة، ثم وثّق الإنجاز. تُجهز التنبيهات في سجل داخلي فقط؛ لا تُعرض كرسائل مُرسلة حتى يؤكد المزود التسليم.')),toolbar,summary,editor,plans,tasks,alerts);
 const rpc=(action,payload={})=>d.session.request(d.session.client.rpc('aqari_maintenance_plans',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:payload}));
 async function load(proof){const fresh=await rpc('list');if(!Array.isArray(fresh?.plans)||!Array.isArray(fresh.tasks)||!Array.isArray(fresh.alerts)||!Array.isArray(fresh.properties)||!Array.isArray(fresh.documents)||(fresh.workflow_version===2&&(!Array.isArray(fresh.vendors)||!Array.isArray(fresh.contracts))))throw Error('تعذر استرجاع سجل الصيانة الدورية.');data=fresh;if(proof&&!proof(fresh))throw Error('تعذر مطابقة العملية بعد إعادة القراءة؛ لا تكررها قبل المراجعة.');render();}
 async function write(action,payload,proof){
  if(pending||uncertain)throw Error('حدّث السجل وتحقق من العملية السابقة أولًا.');pending=true;
  try{await rpc(action,payload);await load(proof);editing=null;d.status.textContent=translateStatic('تم الحفظ والتحقق بإعادة القراءة.');}
  catch(error){uncertain=true;if(error?.code==='42501'||[401,403].includes(error?.status))throw error;throw Error(errors[error?.message]||'لم يتأكد الحفظ. حدّث السجل وراجع العملية قبل إعادة المحاولة.');}
  // d.run already locks the current form. Keep its entered values if a write
  // fails; rebuilding it from data here would discard the unconfirmed draft.
  finally{pending=false;if(uncertain){reload.disabled=false;prepare.disabled=true;for(const section of [editor,plans,tasks])for(const control of section.querySelectorAll('button,input,select'))control.disabled=true;}else render();}
 }
 const proofTask=(task,state,extra=()=>true)=>x=>x.tasks.some(t=>t.id===task.id&&t.revision===task.revision+1&&t.status===state&&extra(t));
 function renderEditor(){
  editor.replaceChildren();if(!data.can_write)return;
  if(data.workflow_version!==2){editor.append(text('p',translateStatic('سجل الصيانة متاح للقراءة؛ إدارة الخطط غير متاحة في هذه النسخة بعد.')));return;}
  editor.append(text('h2',editing?translateStatic('تعديل خطة الصيانة'):translateStatic('خطة صيانة جديدة')));
  const saved=editing&&data.plans.find(p=>p.id===editing);if(editing&&!saved)editing=null;
  const f=node('form'),property=select(data.properties,translateStatic('اختر العقار')),kind=node('select'),title=node('input'),frequency=node('input'),next=node('input'),contract=select([],translateStatic('بدون عقد مورد مرتبط'),false),active=node('input');
  for(const [value,label]of Object.entries(kinds))kind.append(opt(value,label));
  frequency.type='number';frequency.min='1';frequency.max='730';frequency.step='1';next.type='date';title.required=frequency.required=next.required=true;title.minLength=3;title.maxLength=200;
  property.value=saved?.property_id||'';property.disabled=!!saved;kind.value=saved?.asset_kind||'elevator';title.value=saved?.title||'';frequency.value=saved?.frequency_days||'30';next.value=saved?.next_due_on||'';active.type='checkbox';active.checked=saved?.is_active??true;
  function contractOptions(){const previous=contract.value||saved?.vendor_contract_id||'';contract.replaceChildren(opt('',translateStatic('بدون عقد مورد مرتبط')));for(const c of data.contracts||[])if(!c.property_id||c.property_id===property.value){const vendor=data.vendors?.find(v=>v.id===c.vendor_id);contract.append(opt(c.id,visibleMessage("{value0} — {value1} • حتى {value2}",{value0:(c.contract_no),value1:(vendor?.name||translateStatic('مورد')),value2:(c.ends_on)})));}contract.value=previous;}
  property.onchange=contractOptions;contractOptions();
  if(saved?.vendor_contract_id&&!(data.contracts||[]).some(c=>c.id===saved.vendor_contract_id))editor.append(text('p',translateStatic('عقد المورد السابق لم يعد متاحًا. راجع العقد قبل حفظ التعديل.')));
  f.append(field(translateStatic('العقار'),property),field(translateStatic('نوع الأصل'),kind),field(translateStatic('عنوان الخطة'),title),field(translateStatic('التكرار بالأيام'),frequency),field(translateStatic('موعد الصيانة القادمة'),next),field(translateStatic('عقد المورد المرتبط'),contract),field(translateStatic('الخطة فعالة'),active),Object.assign(node('button',saved?translateStatic('حفظ التعديلات'):translateStatic('حفظ الخطة')),{type:'submit'}));
  f.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
   if(!validDate(next.value)||!Number.isInteger(Number(frequency.value))||Number(frequency.value)<1||Number(frequency.value)>730||title.value.trim().length<3||!property.value)throw Error('راجع العقار والعنوان والتكرار وموعد الصيانة.');
   const id=saved?.id||crypto.randomUUID(),payload={id,revision:saved?.revision||0,property_id:property.value,asset_kind:kind.value,title:title.value.trim(),frequency_days:Number(frequency.value),next_due_on:next.value,vendor_contract_id:contract.value||null,warning_days:saved?.warning_days||[90,60,30],is_active:active.checked};
   await write('save',payload,x=>x.plans.some(p=>p.id===id&&p.revision===payload.revision+1&&Object.entries(payload).every(([k,v])=>['id','revision'].includes(k)||JSON.stringify(p[k])===JSON.stringify(v))));
  });};editor.append(f);if(saved)editor.append(button(translateStatic('إلغاء التعديل'),()=>{editing=null;render();}));
 }
 function render(){
  if(!data||d.closed)return;reload.disabled=pending;prepare.hidden=!data.manager;prepare.disabled=pending||uncertain||!data.can_write;
  const writable=data.can_write&&data.workflow_version===2;
  summary.replaceChildren(text('h2',translateStatic('ملخص')),text('p',visibleMessage("الخطط الفعالة: {value0} • المهام المفتوحة: {value1} • التنبيهات المسجلة: {value2}",{value0:(data.plans.filter(p=>p.is_active).length),value1:(data.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).length),value2:(data.alerts.length)})));
  if(uncertain)summary.append(text('p',translateStatic('لم يتأكد الحفظ. استخدم «تحديث السجل» وراجع البيانات المحفوظة قبل إجراء جديد.')));
  renderEditor();plans.replaceChildren(text('h2',translateStatic('الخطط المحفوظة')));
  if(!data.plans.length)plans.append(text('p',translateStatic('أضف أول خطة صيانة للعقار.')));
  for(const plan of data.plans){const card=node('article'),property=data.properties.find(p=>p.id===plan.property_id),linked=(data.contracts||[]).find(c=>c.id===plan.vendor_contract_id);
   card.append(text('h3',plan.title),text('p',`${property?.name||''} • ${kinds[plan.asset_kind]||plan.asset_kind} • ${plan.is_active?translateStatic('فعالة'):translateStatic('متوقفة')}`),text('p',visibleMessage("الموعد {value0} • كل {value1} يوماً",{value0:(plan.next_due_on),value1:(plan.frequency_days)})));if(linked)card.append(text('p',visibleMessage("عقد المورد: {value0}",{value0:(linked.contract_no)})));
   if(writable){card.append(button(translateStatic('تعديل الخطة'),()=>{editing=plan.id;render();}));
    const exists=data.tasks.some(t=>t.plan_id===plan.id&&t.due_on===plan.next_due_on);
    if(plan.is_active&&!exists)card.append(button(translateStatic('إنشاء مهمة من الموعد'),()=>d.run(()=>{const taskId=crypto.randomUUID(),taskNo='MT-'+plan.next_due_on.replaceAll('-','')+'-'+taskId.slice(0,8).toUpperCase();return write('generate_task',{id:plan.id,task_id:taskId,task_no:taskNo,description:plan.title},x=>x.tasks.some(t=>t.id===taskId&&t.plan_id===plan.id&&t.property_id===plan.property_id&&t.due_on===plan.next_due_on));})));
    if(exists)card.append(text('p',translateStatic('مهمة هذا الموعد محفوظة أدناه.')));
   }plans.append(card);
  }
  tasks.replaceChildren(text('h2',translateStatic('مهام الصيانة')));if(!data.tasks.length)tasks.append(text('p',translateStatic('أنشئ مهمة من إحدى الخطط المحفوظة.')));
  for(const task of data.tasks){const card=node('article'),vendor=data.vendors?.find(v=>v.id===task.assigned_vendor_id),property=data.properties.find(p=>p.id===task.property_id);
   card.append(text('h3',task.task_no),text('p',visibleMessage("{value0} • {value1} • الاستحقاق {value2}",{value0:(property?.name||''),value1:(states[task.status]||task.status),value2:(task.due_on)})),text('p',visibleMessage("الجهة المنفذة: {value0} • التكلفة {value1} د.ك",{value0:(vendor?.name||translateStatic('لم تُكلّف بعد')),value1:(Number(task.cost).toFixed(3))})));
   if(task.assigned_at)card.append(text('p',visibleMessage("تاريخ التكليف: {value0}",{value0:(String(task.assigned_at).slice(0,10))})));
   if(task.status==='cancelled')card.append(text('p',visibleMessage("سبب الإلغاء: {value0}",{value0:(task.cancellation_reason||'—')})));
   if(writable&&!['completed','cancelled'].includes(task.status)){
    if(['scheduled','assigned'].includes(task.status)){
     const assignment=node('form'),plan=data.plans.find(p=>p.id===task.plan_id),contract=(data.contracts||[]).find(c=>c.id===plan?.vendor_contract_id),vendors=select((data.vendors||[]).filter(v=>!contract||contract.vendor_id===v.id),translateStatic('اختر الجهة المنفذة')),reason=node('input');vendors.value=task.assigned_vendor_id||'';reason.required=true;reason.minLength=3;
     assignment.append(field(translateStatic('الجهة المنفذة'),vendors),field(translateStatic('بيان التكليف'),reason),Object.assign(node('button',translateStatic('حفظ التكليف')),{type:'submit'}));
     assignment.onsubmit=e=>{e.preventDefault();const vendorId=vendors.value;return d.run(()=>write('assign_task',{id:task.id,revision:task.revision,vendor_id:vendorId,reason:reason.value.trim()},proofTask(task,'assigned',t=>t.assigned_vendor_id===vendorId&&!!t.assigned_at&&!!t.assigned_by)));};card.append(assignment);
    }
    if(task.status==='assigned')card.append(button(translateStatic('بدء التنفيذ'),()=>d.run(()=>write('start_task',{id:task.id,revision:task.revision,reason:'بدء تنفيذ مهمة الصيانة'},proofTask(task,'in_progress',t=>!!t.started_at)))));
    if(task.status==='in_progress'&&!data.can_complete)card.append(text('p',translateStatic('اعتماد الإنجاز وإثباته متاح للإدارة المخولة بالمستندات.')));
    if(task.status==='in_progress'&&data.can_complete){const f=node('form'),doc=select(data.documents.filter(x=>x.property_id===task.property_id).map(x=>({...x,name:(x.document_no?x.document_no+' — ':'')+x.title})),translateStatic('اختر مستند وصور الإنجاز')),photo=select(data.documents.filter(x=>x.property_id===task.property_id&&['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(x.mime_type)).map(x=>({...x,name:x.title})),translateStatic('اختر صورة إنجاز محفوظة')),cost=node('input'),reason=node('input');cost.inputMode='decimal';cost.required=reason.required=true;reason.minLength=3;
    f.append(field(translateStatic('مستند الإنجاز المحفوظ'),doc),field(translateStatic('صورة الإنجاز المحفوظة'),photo),field(translateStatic('التكلفة د.ك'),cost),field(translateStatic('بيان الإنجاز'),reason),Object.assign(node('button',translateStatic('اعتماد إكمال المهمة')),{type:'submit'}));
    f.onsubmit=e=>{e.preventDefault();return d.run(()=>{const amount=cost.value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.');if(!/^\d{1,12}(\.\d{1,3})?$/.test(amount))throw Error('أدخل تكلفة صحيحة بدقة ثلاثة منازل.');return write('complete_task',{id:task.id,revision:task.revision,completion_document_id:doc.value,photo_document_ids:[photo.value],cost:amount,reason:reason.value.trim()},proofTask(task,'completed',t=>t.completion_document_id===doc.value&&Number(t.cost)===Number(amount)));});};card.append(f);}
    const cancel=node('details'),cancelForm=node('form'),cancelReason=node('input');cancelReason.required=true;cancelReason.minLength=3;cancel.append(text('summary',translateStatic('إلغاء المهمة مع حفظ السبب')));cancelForm.append(field(translateStatic('سبب إلغاء المهمة'),cancelReason),Object.assign(node('button',translateStatic('تأكيد إلغاء المهمة')),{type:'submit'}));cancelForm.onsubmit=e=>{e.preventDefault();const reason=cancelReason.value.trim();return d.run(()=>write('cancel_task',{id:task.id,revision:task.revision,reason},proofTask(task,'cancelled',t=>t.cancellation_reason===reason)));};cancel.append(cancelForm);card.append(cancel);
   }tasks.append(card);
  }
  alerts.replaceChildren(text('h2',translateStatic('سجل التنبيهات')));if(!data.alerts.length)alerts.append(text('p',translateStatic('لا توجد تنبيهات مجهزة.')));const alertKinds={maintenance_due:translateStatic('موعد صيانة'),lease_expiry:translateStatic('انتهاء عقد إيجار'),vendor_contract_expiry:translateStatic('انتهاء عقد مورد')},alertStates={awaiting_configuration:translateStatic('بانتظار إعداد الإرسال'),queued:translateStatic('بانتظار الإرسال'),sending:translateStatic('جارٍ الإرسال'),sent:translateStatic('تم الإرسال'),failed:translateStatic('تعذر الإرسال'),delivered:translateStatic('تم التسليم'),cancelled:translateStatic('ملغى')};
  for(const alert of data.alerts)alerts.append(text('p',`${alertKinds[alert.kind]||translateStatic('تنبيه')} • ${String(alert.scheduled_for).slice(0,10)} • ${alertStates[alert.status]||translateStatic('راجع سجل الإرسال')}`));
  if(pending||uncertain)for(const section of [editor,plans,tasks])for(const control of section.querySelectorAll('button,input,select'))control.disabled=true;
 }
 reload.onclick=()=>d.run(async()=>{await load();uncertain=false;editing=null;render();d.status.textContent=translateStatic('تم استرجاع الخطط والمهام والتنبيهات. راجع العملية السابقة إن انقطع الاتصال.');});
 prepare.onclick=()=>d.run(()=>write('prepare_alerts',{},x=>Array.isArray(x.runs)&&x.runs.some(r=>r.as_of===new Date(Date.now()+10800000).toISOString().slice(0,10))));
 d.onDispose(()=>{data=null;editing=null;pending=false;uncertain=false;for(const x of [summary,editor,plans,tasks,alerts])x.replaceChildren();});
 d.run(load);
}
