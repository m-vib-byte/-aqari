import {node,field} from '../components/dialog.js';
import {t} from '../components/locale.js';

// A report may have several open task editors; every draft must guard departure.
const detailDrafts=new WeakMap();
function registerDraft(d,entry){
 let group=detailDrafts.get(d);
 if(!group){
  const entries=new Set();
  const canDiscard=(items=entries)=>{
   if([...items].some(x=>x.pending())){d.status.textContent=t('انتظر اكتمال التحقق من الحفظ قبل إغلاق تفاصيل الصيانة.');return false;}
   return ![...items].some(x=>x.dirty())||window.confirm(t('توجد تفاصيل صيانة غير محفوظة أو لم يتأكد حفظها. هل تريد تركها والمتابعة؟'));
  };
  const releaseClose=d.setBeforeClose?.(()=>canDiscard());
  d.setBeforeUnload?.(()=>[...entries].some(x=>x.pending()||x.dirty()));
  group={entries,canDiscard,releaseClose};detailDrafts.set(d,group);
 }
 group.entries.add(entry);
 return {canDiscard:()=>group.canDiscard([entry]),remove(){
  group.entries.delete(entry);
  if(!group.entries.size&&detailDrafts.get(d)===group){group.releaseClose?.();d.setBeforeUnload?.(null);detailDrafts.delete(d);}
 }};
}

export const inspectionKinds={fire_system:'الحريق',elevator:'المصاعد',air_conditioning:'التكييف',water_tank:'خزانات المياه',sprinklers:'الرشاشات',other:'أخرى'};
export const detailKeys=['inspection_kind','technician_name','inspected_on','invoice_number','invoice_document_id','result_details','responsible_user_id','planned_close_on','urgent'];
export function detailMatches(row,values){return !!row&&detailKeys.every(k=>(row[k]??null)===(values[k]??null))&&Boolean(row.verified_by)===values.verify_result;}
export function checkDetailsScope(value,session,propertyId){
 if(value?.version!==1||value.workspace_id!==session.bound.workspace||value.propertyId!==propertyId||value.user_id!==session.bound.user||!Array.isArray(value.details)||!Array.isArray(value.documents)||!Array.isArray(value.responsibles))throw Error('تعذر تأكيد نطاق تفاصيل تقرير الصيانة.');
 return value;
}
export function mountMonthlyDetails(d,{task,context,onSaved}){
 const section=node('section'),form=node('form'),controls={},saved=context.details.find(x=>x.task_id===task.id),revision=saved?.revision||0;
 const option=(value,label)=>{const o=node('option',t(label));o.value=value;return o;};
 const select=rows=>{const x=node('select');x.append(option('','غير موثّق'));for(const [v,label] of rows)x.append(option(v,label));return x;};
 controls.inspection_kind=select(Object.entries(inspectionKinds));
 controls.technician_name=node('input');controls.technician_name.maxLength=200;
 controls.inspected_on=node('input');controls.inspected_on.type='date';
 controls.invoice_number=node('input');controls.invoice_number.maxLength=100;
 controls.invoice_document_id=select(context.documents.map(x=>[x.id,[x.number,x.title].filter(Boolean).join(' — ')]));
 controls.result_details=node('textarea');controls.result_details.maxLength=4000;controls.result_details.rows=4;
 controls.responsible_user_id=select(context.responsibles.map(x=>[x.id,x.name]));
 controls.planned_close_on=node('input');controls.planned_close_on.type='date';
 controls.urgent=node('input');controls.urgent.type='checkbox';
 const labels={inspection_kind:'بند الصيانة',technician_name:'اسم الفني',inspected_on:'تاريخ الفحص',invoice_number:'رقم الفاتورة كما في المرفق',invoice_document_id:'مرفق الفاتورة',result_details:'نتيجة الإصلاح وما تم التحقق منه',responsible_user_id:'المسؤول عن المتابعة',planned_close_on:'موعد الإقفال المخطط',urgent:'حالة عاجلة'};
 for(const key of detailKeys){const input=controls[key];if(input.type==='checkbox')input.checked=Boolean(saved?.[key]);else input.value=saved?.[key]||'';form.append(field(t(labels[key]),input));}
 const verify=node('input');verify.type='checkbox';verify.checked=false;verify.disabled=!context.canVerify||task.status!=='completed';
 form.append(field(t('أؤكد مراجعة نتيجة الإصلاح والأدلة واعتمادها'),verify));
 if(saved?.verified_at)form.append(node('p',t('أي تعديل جديد يحتاج اعتمادًا جديدًا؛ الاعتماد السابق محفوظ في التاريخ.')));
 const reason=node('input');reason.required=true;reason.minLength=3;reason.maxLength=1000;form.append(field(t('سبب التسجيل أو التعديل'),reason));
 const save=node('button',t('حفظ التفاصيل والتحقق')),retry=node('button',t('التحقق من آخر حفظ')),cancel=node('button',t('إغلاق التفاصيل')),status=node('p');
 save.type='submit';retry.type=cancel.type='button';retry.hidden=true;form.append(save,retry,cancel,status);
 section.append(node('h3',task.task_no||t('تفاصيل الصيانة')),node('p',t('المعلومة غير المسجلة تبقى غير موثّقة. إرفاق فاتورة هنا لا ينشئ مصروفًا أو دفعة مالية.')),form);d.body.append(section);section.scrollIntoView?.({block:'nearest'});
 let uncertain=false,pendingValues=null,inFlight=false,disposed=false;
 const snapshot=()=>JSON.stringify([...detailKeys.map(k=>controls[k].type==='checkbox'?Boolean(controls[k].checked):controls[k].value),Boolean(verify.checked),reason.value]);
 const baseline=snapshot(),guard=registerDraft(d,{pending:()=>inFlight,dirty:()=>uncertain||snapshot()!==baseline});
 const finish=()=>{disposed=true;guard.remove();section.remove?.();};
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_maintenance_report_details',{p_workspace_id:d.session.bound.workspace,p_property_id:task.property_id,p_action:action,p_data:data}));
 const reread=async()=>{const fresh=await rpc('context');d.session.check();return checkDetailsScope(fresh,d.session,task.property_id);};
 const confirm=async values=>{const fresh=await reread(),row=fresh.details.find(x=>x.task_id===task.id);if(row?.revision!==revision+1||row.recorded_by!==d.session.bound.user||!detailMatches(row,values))throw Error('لم تتأكد مطابقة التفاصيل المحفوظة. تحقق من آخر حفظ قبل أي محاولة جديدة.');await onSaved();finish();return row;};
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  if(disposed)return;
  if(uncertain)throw Error('تحقق من آخر حفظ أولًا.');
  const values=Object.fromEntries(detailKeys.map(k=>[k,k==='urgent'?Boolean(controls[k].checked):controls[k].value.trim()||(['technician_name','invoice_number','result_details'].includes(k)?'':null)]));
  values.verify_result=Boolean(verify.checked);values.reason=reason.value.trim();if(values.reason.length<3)throw Error('أدخل سبب التسجيل أو التعديل.');
  pendingValues=values;uncertain=true;save.disabled=true;retry.hidden=false;
  let acknowledged=false;inFlight=true;
  try{await rpc('save',{...values,task_id:task.id,task_revision:task.revision,revision});acknowledged=true;d.session.check();await confirm(values);status.textContent=t('تم الحفظ والتحقق من التفاصيل.');}
  catch(error){
   // Only the write's explicit step-up rejection proves that nothing committed.
   // Preserve the original revision; readback failures still require reconciliation.
   if(!acknowledged&&error?.status===403&&error?.code==='42501'&&['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'].includes(error?.message)){
    d.session.check();uncertain=false;pendingValues=null;save.disabled=false;retry.hidden=true;
    status.textContent=t('لم تُحفظ التفاصيل. أكمل التحقق الثنائي ثم أعد الحفظ؛ بقيت البيانات المدخلة هنا.');
   }else status.textContent=t('لم يتأكد الحفظ. البيانات المدخلة محفوظة في هذه الشاشة؛ استخدم التحقق من آخر حفظ.');
   throw error;
  }finally{inFlight=false;}
 });};
 retry.onclick=()=>d.run(async()=>{if(disposed||!pendingValues)return;inFlight=true;try{const fresh=await reread(),row=fresh.details.find(x=>x.task_id===task.id);if(row?.revision===revision+1&&row.recorded_by===d.session.bound.user&&detailMatches(row,pendingValues)){await onSaved();finish();return;}if((row?.revision||0)!==revision)throw Error('تغيرت التفاصيل المحفوظة. أعد فتح التقرير لمراجعتها.');uncertain=false;save.disabled=false;retry.hidden=true;status.textContent=t('لم يظهر حفظ جديد. يمكنك إعادة المحاولة؛ يمنع رقم النسخة تسجيل حفظ مكرر.');}finally{inFlight=false;}});
 cancel.onclick=()=>{if(!disposed&&guard.canDiscard())finish();};
 d.onDispose(()=>{disposed=true;guard.remove();pendingValues=null;for(const control of Object.values(controls))control.value='';reason.value='';section.replaceChildren();});
 return {form,controls,verify,reason,save,retry,status};
}
