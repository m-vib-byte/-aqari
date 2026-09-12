import {createDialog,node,field} from '../components/dialog.js';

const states={draft:'مسودة',published:'منشور',archived:'مؤرشف'};
const when=v=>v?new Date(v).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'}):'لم يسجل بعد';
const sameTargets=(a,b)=>JSON.stringify([...(a||[])].sort())===JSON.stringify([...(b||[])].sort());
const sameContent=(a,b)=>a.title===b.title&&a.body===b.body&&sameTargets(a.recipient_ids,b.recipient_ids)&&(!a.expires_at&&!b.expires_at||new Date(a.expires_at).getTime()===new Date(b.expires_at).getTime());
const errors={INVALID_CIRCULAR_RECIPIENTS:'راجع الموظفين المحددين؛ يجب أن تكون حساباتهم فعالة في مساحة العمل.',REVISION_CONFLICT:'تغيرت النسخة. حدّث السجلات وافتح المسودة الأحدث.',PUBLISHED_CIRCULAR_IMMUTABLE:'النسخة المنشورة محفوظة. أنشئ مسودة جديدة للتعديل.',CIRCULAR_EXPIRED:'انتهى تاريخ العرض؛ عدّل المسودة قبل النشر.',ARCHIVE_REASON_REQUIRED:'أدخل سبب الأرشفة.',MFA_REQUIRED:'أكمل التحقق الثنائي قبل إجراء هذه العملية.'};

export function mountStaffCirculars(d){
 let records=[],staff=[],manager=false,editing=null,draftId=null,pending=null;
 const reload=node('button','تحديث التعاميم'),add=node('button','إعداد تعميم جديد'),list=node('div'),history=node('div'),editor=node('form');
 const title=node('input'),body=node('textarea'),expiry=node('input'),targets=node('fieldset'),save=node('button','حفظ المسودة والتحقق منها'),cancel=node('button','إغلاق المسودة');
 reload.type=add.type=cancel.type='button';save.type='submit';title.required=body.required=true;title.maxLength=200;body.maxLength=10000;body.rows=8;expiry.type='date';editor.hidden=add.hidden=true;
 editor.append(node('h3','مسودة تعميم للموظفين'),field('عنوان التعميم',title),field('نص التعميم',body),targets,field('انتهاء العرض — نهاية اليوم بتوقيت الكويت، اختياري',expiry),node('p','المسودة لا تظهر للموظفين. بعد النشر يبقى النص ثابتًا، ويُسجل الاطلاع فقط عندما يقر الموظف بنفسه.'),save,cancel);
 d.body.append(node('p','تعاميم داخل المنصة للموظفين المحددين. إقرار الاطلاع مرتبط بالحساب ونسخة التعميم؛ لا يعني توقيعًا إلكترونيًا أو تسليم رسالة خارجية. يعرض القسم أحدث ١٠٠ سجل متاح لك.'),reload,add,editor,list,history);
 const rpc=async(action,data={})=>{
  try{return await d.session.request(d.session.client.rpc('aqari_staff_circulars',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));}
  catch(e){if(errors[e?.message]){const translated=new Error(errors[e.message],{cause:e});translated.code=e.code;translated.status=e.status;throw translated;}throw e;}
 };
 function locked(){if(pending)throw Error('هناك عملية لم تتأكد نتيجتها. حدّث التعاميم أو أعد العملية نفسها أولًا.');}
 function targetChoices(selected=[]){targets.replaceChildren(node('legend','الموظفون المقصودون بالتعميم'));for(const p of staff){const box=node('input');box.type='checkbox';box.value=p.user_id;box.checked=selected.includes(p.user_id);targets.append(field(p.name||'موظف',box));}}
 function closeEditor(){editing=null;draftId=null;title.value=body.value=expiry.value='';targetChoices();editor.hidden=true;}
 function openEditor(record=null,copy=false){
  locked();if(!manager)throw Error('إعداد التعاميم متاح للإدارة المخولة.');editing=copy?null:record;draftId=editing?.id||crypto.randomUUID();
  title.value=record?.title||'';body.value=record?.body||'';expiry.value=record?.expires_at?new Date(new Date(record.expires_at).getTime()+10800000).toISOString().slice(0,10):'';
  targetChoices(record?.recipient_ids||[]);editor.hidden=false;history.replaceChildren();title.focus?.();
 }
 function verified(op){
  const r=records.find(x=>x.id===op.data.id);if(!r)return false;
  if(op.action==='ack')return r.revision===op.data.revision&&!!r.acknowledged_at;
  if(r.revision!==op.data.revision+1||r.status!==({save:'draft',publish:'published',archive:'archived'}[op.action]))return false;
  return sameContent(r,op.content);
 }
 function confirmPending(){
  if(!pending)return;
  if(!verified(pending))throw Error('لم تتأكد مطابقة العملية المحفوظة. حدّث التعاميم أو أعد العملية نفسها؛ لن تُنشأ عملية بديلة.');
  const action=pending.action;pending=null;if(action!=='ack')closeEditor();
  d.status.textContent=({save:'تم حفظ المسودة والتحقق منها بإعادة القراءة.',publish:'تم نشر النسخة المحفوظة للموظفين المحددين والتحقق منها.',archive:'تمت الأرشفة مع بقاء النص وسجل الاطلاع.',ack:'تم تسجيل إقرار اطلاعك والتحقق منه بإعادة القراءة.'})[action];
 }
 async function mutate(action,data,content){
  if(pending&&(pending.action!==action||pending.data.id!==data.id))locked();
  pending||={action,data:structuredClone(data),content:content?structuredClone(content):null};
  try{await rpc(pending.action,pending.data);}catch(e){if(['23514','22023','22P02','40001','23505'].includes(e?.code))pending=null;throw e;}
  await load();confirmPending();
 }
 function render(){
  list.replaceChildren();if(!records.length)list.append(node('p','لا توجد تعاميم متاحة لك.'));
  for(const r of records){
   const card=node('article'),message=node('p',r.body);message.style.whiteSpace='pre-wrap';
   card.append(node('h3',r.title),node('p',(states[r.status]||'تعميم')+' • النسخة '+r.revision+' • النشر: '+when(r.published_at)),message);
   if(r.expires_at)card.append(node('p','ينتهي العرض: '+when(r.expires_at)));
   if(r.acknowledged_at)card.append(node('p','سُجل اطلاعك: '+when(r.acknowledged_at)));
   else if(r.can_ack){const ack=node('button','أقر بأنني اطلعت على هذا التعميم');ack.type='button';ack.onclick=()=>d.run(()=>mutate('ack',{id:r.id,revision:r.revision}));card.append(ack);}
   if(manager){
    card.append(node('p','إقرارات الاطلاع: '+Number(r.ack_count||0)));
    const edit=node('button',r.status==='draft'?'تعديل المسودة':'نسخة جديدة من هذا التعميم');edit.type='button';edit.onclick=()=>d.run(async()=>openEditor(r,r.status!=='draft'));card.append(edit);
    if(r.status==='draft'){const publish=node('button','نشر للموظفين المحددين');publish.type='button';publish.onclick=()=>d.run(()=>mutate('publish',{id:r.id,revision:r.revision},r));card.append(publish);}
    if(r.status!=='archived'){
     const form=node('form'),reason=node('input'),archive=node('button','أرشفة التعميم');reason.required=true;reason.minLength=3;reason.maxLength=500;archive.type='submit';form.append(field('سبب الأرشفة',reason),archive);
     form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{const why=reason.value.trim();if(why.length<3||why.length>500)throw Error('أدخل سبب الأرشفة من ٣ إلى ٥٠٠ حرف.');await mutate('archive',{id:r.id,revision:r.revision,reason:why},r);});};card.append(form);
    }
    const audit=node('button','النسخ وسجل اطلاع الموظفين');audit.type='button';audit.onclick=()=>d.run(async()=>{
     const result=await rpc('history',{id:r.id});if(!Array.isArray(result?.versions)||!Array.isArray(result?.recipients))throw Error('تعذر قراءة سجل التعميم.');
     history.replaceChildren(node('h3','سجل: '+r.title));
     for(const v of result.versions){const section=node('details'),snapshot=v.after_snapshot||{};section.append(node('summary','النسخة '+v.revision+' • '+when(v.recorded_at)),node('p','بواسطة: '+v.actor_name),node('p',v.reason||''),node('h4',snapshot.title));const original=node('p',snapshot.body);original.style.whiteSpace='pre-wrap';section.append(original);history.append(section);}
     history.append(node('h4','الموظفون المقصودون وإقراراتهم'));if(!result.recipients.length)history.append(node('p','لم ينشر هذا التعميم بعد.'));
     for(const a of result.recipients)history.append(node('p',a.user_name+' • النسخة '+a.notice_revision+' • '+(a.acknowledged_at?'اطلع في '+when(a.acknowledged_at):'لم يسجل إقرار الاطلاع')));
     d.status.textContent='تم استرجاع النسخ وسجل الاطلاع المحفوظ.';
    });card.append(audit);
   }
   list.append(card);
  }
 }
 async function load(){
  const result=await rpc('list');if(!Array.isArray(result?.notices)||!Array.isArray(result?.staff)||typeof result.manager!=='boolean')throw Error('تعذر قراءة التعاميم المحفوظة.');
  records=result.notices;staff=result.staff;manager=result.manager;add.hidden=!manager;if(!manager)closeEditor();render();d.status.textContent='تم استرجاع التعاميم المحفوظة.';
 }
 reload.onclick=()=>d.run(async()=>{await load();confirmPending();});add.onclick=()=>d.run(async()=>openEditor());cancel.onclick=()=>d.run(async()=>{locked();closeEditor();});
 editor.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  if(!manager)throw Error('إعداد التعاميم متاح للإدارة المخولة.');
  if(pending){if(pending.action!=='save')locked();await mutate('save',pending.data,pending.content);return;}
  const ids=[...targets.querySelectorAll('input')].filter(x=>x.checked).map(x=>x.value);
  if(!draftId||!title.value.trim()||!body.value.trim()||ids.length===0||ids.some(id=>!staff.some(x=>x.user_id===id)))throw Error('أكمل العنوان والنص وحدد الموظفين المقصودين.');
  const data={id:draftId,revision:editing?.revision||0,title:title.value.trim(),body:body.value.trim(),recipient_ids:ids,expires_at:expiry.value?new Date(expiry.value+'T23:59:59+03:00').toISOString():null};
  await mutate('save',data,data);
 });};
 d.onDispose(()=>{records=[];staff=[];editing=null;pending=null;draftId=null;title.value=body.value=expiry.value='';targets.replaceChildren();list.replaceChildren();history.replaceChildren();});
 return {load};
}

export async function mountAvailableStaffCirculars(d){
 const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
 if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access?.features?.staff_circulars!==true){d.body.append(node('p','تعاميم الموظفين غير متاحة لهذا الحساب أو النسخة الحالية.'));return;}
 const view=mountStaffCirculars(d);await view.load();
}
export function openStaffCirculars(){const d=createDialog('تعاميم الموظفين وإثبات الاطلاع');if(d)d.run(()=>mountAvailableStaffCirculars(d));}
