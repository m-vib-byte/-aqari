import {dateLocale as visibleDateLocale} from '../components/locale.js';
import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const text=value=>String(value??'').trim();
function button(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
function section(title){const s=node('section');s.className='aq267-property-master-section';s.append(node('h3',title));return s;}
function select(rows,value=''){const x=node('select');for(const [v,label] of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
function numberInput(value,min,max){const x=node('input');x.type='number';x.min=String(min);x.max=String(max);x.step='1';x.required=true;x.value=String(value);return x;}
const statusLabel=value=>({scheduled:translateStatic('مجدولة'),assigned:translateStatic('مسندة'),in_progress:translateStatic('قيد التنفيذ'),completed:translateStatic('مكتملة'),cancelled:translateStatic('ملغاة')}[value]||value||'—');
const minutes=value=>value==null?'—':visibleMessage("{value0} دقيقة",{value0:(Number(value).toLocaleString(visibleDateLocale()))});
const evidenceLabel=value=>value==='before'?translateStatic('قبل التنفيذ'):translateStatic('بعد التنفيذ');
const stageLabel=value=>value==='response'?translateStatic('تأخر الاستجابة'):translateStatic('تأخر الإنجاز');

export function openMaintenanceEvidence(propertyId){
 const d=createDialog(translateStatic('أدلة الصيانة قبل وبعد'));if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 let ctx,slaCtx;
 async function read(){
  ctx=await rpc('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'context',p_data:{}});d.session.check();
  if(ctx?.workspace_id!==d.session.bound.workspace||ctx?.propertyId!==propertyId||ctx?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق أدلة الصيانة.');
  slaCtx=await rpc('aqari_maintenance_sla',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'context',p_data:{}});d.session.check();
  if(slaCtx?.workspace_id!==d.session.bound.workspace||slaCtx?.propertyId!==propertyId||slaCtx?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق سياسة SLA للصيانة.');
  return ctx;
 }
 async function addEvidence(task,stage){
  await read();if(!ctx.canWrite)throw Error('إضافة أدلة الصيانة غير متاحة لصلاحية حسابك.');
  const current=(ctx.tasks||[]).find(x=>x.id===task.id);if(!current)throw Error('مهمة الصيانة لم تعد متاحة.');
  if(stage==='before'&&!['scheduled','assigned'].includes(current.status))throw Error('صورة قبل التنفيذ يجب حفظها قبل بدء المهمة.');
  if(stage==='after'&&current.status!=='in_progress')throw Error('صورة بعد التنفيذ تُحفظ أثناء التنفيذ وقبل إقفال المهمة.');
  const docs=(ctx.imageDocuments||[]).map(x=>[x.id,`${x.documentNo||translateStatic('بدون رقم')} · ${x.title||x.id}`]);if(!docs.length)throw Error('لا توجد صورة مؤرشفة ومطابقة لهذا العقار. ارفع الصورة إلى مستندات العقار أولاً.');
  d.body.replaceChildren(node('h3',`${evidenceLabel(stage)} · ${current.taskNo}`),button(translateStatic('رجوع'),()=>d.run(render)));
  const f=node('form'),documentId=select(docs),reason=node('textarea');reason.required=true;reason.minLength=3;reason.value=stage==='before'?translateStatic('توثيق حالة الموقع قبل تنفيذ الصيانة'):translateStatic('توثيق نتيجة الصيانة بعد التنفيذ');
  f.append(field(translateStatic('الصورة المؤرشفة'),documentId),field(translateStatic('ملاحظة/سبب التوثيق'),reason));const save=node('button',translateStatic('حفظ الدليل وإعادة القراءة'));save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'add',p_data:{taskId:current.id,documentId:documentId.value,stage,reason:text(reason.value)}});d.session.check();if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user||response?.record?.task_id!==current.id)throw Error('لم تتأكد إعادة قراءة دليل الصيانة.');await render();d.status.textContent=visibleMessage("تم حفظ صورة {value0} كسجل غير قابل للتعديل أو الحذف.",{value0:(evidenceLabel(stage))});});};
 }
 async function configureSla(){
  await read();if(!slaCtx.canWrite)throw Error('إعداد SLA للصيانة محصور بالمدير العام المخوّل.');
  const policy=slaCtx.policy||{},responseMinutes=numberInput(policy.responseMinutes??60,5,10080),resolutionMinutes=numberInput(policy.resolutionMinutes??1440,5,43200),channel=select([['push',translateStatic('تنبيه داخل المنصة / Push')],['email',translateStatic('بريد إلكتروني')]],policy.channel||'push'),active=node('input'),reason=node('textarea');
  active.type='checkbox';active.checked=policy.active!==false;reason.required=true;reason.minLength=3;reason.value=translateStatic('تحديث سياسة زمن الاستجابة والإنجاز للصيانة');
  d.body.replaceChildren(node('h3',translateStatic('سياسة SLA للصيانة')),button(translateStatic('رجوع'),()=>d.run(render)));
  const f=node('form');f.append(field(translateStatic('حد الاستجابة بالدقائق'),responseMinutes),field(translateStatic('حد الإنجاز بالدقائق'),resolutionMinutes),field(translateStatic('قناة التصعيد'),channel),field(translateStatic('تفعيل التصعيد الآلي'),active),field(translateStatic('سبب التعديل'),reason));const save=node('button',translateStatic('حفظ السياسة وإعادة القراءة'));save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_maintenance_sla',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'save',p_data:{responseMinutes:Number(responseMinutes.value),resolutionMinutes:Number(resolutionMinutes.value),channel:channel.value,active:active.checked,revision:Number(policy.revision||0),reason:text(reason.value)}});d.session.check();if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user)throw Error('لم تتأكد إعادة قراءة سياسة SLA.');await render();d.status.textContent=translateStatic('تم حفظ سياسة SLA مع سجل تدقيق، وسيقوم الفحص الآلي بتصعيد التجاوزات.');});};
 }
 async function prepareEscalations(){
  await read();if(!slaCtx.canWrite)throw Error('فحص التصعيد محصور بالمدير العام المخوّل.');
  const response=await rpc('aqari_maintenance_sla',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'prepare',p_data:{}});d.session.check();
  if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user)throw Error('لم تتأكد نتيجة فحص SLA.');
  await render();d.status.textContent=visibleMessage("اكتمل فحص التصعيد: {value0} تصعيد جديد. الفحص الآلي يستمر كل 15 دقيقة.",{value0:(Number(response?.run?.inserted||0).toLocaleString(visibleDateLocale()))});
 }
 async function render(){
  await read();d.body.replaceChildren();
  const sla=section(translateStatic('سياسة زمن الاستجابة والتصعيد'));const policy=slaCtx.policy;
  if(policy&&policy.active!==false)sla.append(node('p',visibleMessage("حد الاستجابة: {value0} · حد الإنجاز: {value1} · قناة التصعيد: {value2} · الفحص الآلي: كل 15 دقيقة.",{value0:(minutes(policy.responseMinutes)),value1:(minutes(policy.resolutionMinutes)),value2:(policy.channel==='email'?translateStatic('البريد الإلكتروني'):'Push')})));
  else sla.append(node('p',policy?translateStatic('سياسة SLA محفوظة لكنها معطلة لهذا العقار.'):translateStatic('لم تُضبط بعد سياسة SLA لهذا العقار؛ لا يتم افتراض حد زمني من النظام.')));
  if(slaCtx.canWrite){sla.append(button(translateStatic('إعداد سياسة SLA'),()=>d.run(configureSla)));if(policy?.active!==false&&policy)sla.append(button(translateStatic('فحص التصعيد الآن'),()=>d.run(prepareEscalations)));}
  const escalations=Array.isArray(slaCtx.escalations)?slaCtx.escalations:[];if(escalations.length)sla.append(node('p',visibleMessage("التصعيدات المحفوظة: {value0} — سجلات غير قابلة للتعديل أو الحذف.",{value0:(escalations.length.toLocaleString(visibleDateLocale()))})));
  d.body.append(sla);
  const head=section(translateStatic('التوثيق التشغيلي'));head.append(node('p',translateStatic('المهام الجديدة تتطلب صورة قبل بدء التنفيذ وصورة بعد التنفيذ قبل الإقفال. السجلات لا تُحذف ولا تُعدّل.')));d.body.append(head);
  const evidence=Array.isArray(ctx.evidence)?ctx.evidence:[],documents=new Map((ctx.imageDocuments||[]).map(x=>[x.id,x])),slaTasks=new Map((slaCtx.tasks||[]).map(x=>[x.id,x]));const tasks=Array.isArray(ctx.tasks)?ctx.tasks:[];
  if(!tasks.length)d.body.append(node('p',translateStatic('لا توجد مهام صيانة مرتبطة بهذا العقار.')));
  for(const task of tasks){
   const card=section(`${task.taskNo||translateStatic('بدون رقم')} · ${statusLabel(task.status)}`),slaTask=slaTasks.get(task.id);const overdue=Number(task.overdueDays||0);
   card.append(node('p',task.description||translateStatic('بدون وصف')),node('p',visibleMessage("الاستحقاق: {value0} · التأخير: {value1} يوم{value2}",{value0:(task.dueOn||'—'),value1:(overdue),value2:(task.needsEscalation?translateStatic(' · متأخرة عن الاستحقاق'):'')})),node('p',visibleMessage("زمن الاستجابة: {value0} · زمن التنفيذ: {value1}",{value0:(minutes(task.responseMinutes)),value1:(minutes(task.resolutionMinutes))})));
   if(policy?.active!==false&&policy&&slaTask?.responseBreached)card.append(node('p',visibleMessage("⚠ {value0}: تجاوز حد {value1} وتم إدخاله في مسار التصعيد الآلي.",{value0:(stageLabel('response')),value1:(minutes(policy.responseMinutes))})));
   if(policy?.active!==false&&policy&&slaTask?.resolutionBreached)card.append(node('p',visibleMessage("⚠ {value0}: تجاوز حد {value1} وتم إدخاله في مسار التصعيد الآلي.",{value0:(stageLabel('resolution')),value1:(minutes(policy.resolutionMinutes))})));
   const taskEscalations=escalations.filter(x=>x.taskId===task.id);for(const item of taskEscalations)card.append(node('p',visibleMessage("{value0} · الحد {value1} · التجاوز {value2} · التصعيد {value3}",{value0:(stageLabel(item.stage)),value1:(minutes(item.thresholdMinutes)),value2:(item.breachedAt||'—'),value3:(item.preparedAt||'—')})));
   if(Number(task.policyVersion||0)===0)card.append(node('p',translateStatic('مهمة قديمة: سياسة صورة «قبل» لم تكن إلزامية عند إنشائها، لكن صورة «بعد» مطلوبة عند الإقفال.')));
   const rows=evidence.filter(x=>x.taskId===task.id);if(!rows.length)card.append(node('p',translateStatic('لا توجد أدلة صور محفوظة لهذه المهمة.')));
   for(const item of rows){const doc=documents.get(item.documentId);card.append(node('p',`${evidenceLabel(item.stage)} · ${doc?.title||item.documentId} · ${item.capturedAt||'—'} · ${item.capturedBy||'—'}${item.note?' · '+item.note:''}`));}
   if(ctx.canWrite&&['scheduled','assigned'].includes(task.status))card.append(button(translateStatic('إضافة صورة قبل التنفيذ'),()=>d.run(()=>addEvidence(task,'before'))));
   if(ctx.canWrite&&task.status==='in_progress')card.append(button(translateStatic('إضافة صورة بعد التنفيذ'),()=>d.run(()=>addEvidence(task,'after'))));
   d.body.append(card);
  }
  d.status.textContent=policy?translateStatic('المؤشرات تقارن القياس الفعلي بسياسة SLA المحفوظة لهذا العقار.'):translateStatic('المؤشرات المعروضة قياسات زمنية فعلية؛ لا تُفترض أهداف SLA قبل ضبطها من المدير العام.');
 }
 d.run(render);return true;
}

