import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const text=value=>String(value??'').trim();
function button(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
function section(title){const s=node('section');s.className='aq267-property-master-section';s.append(node('h3',title));return s;}
function select(rows,value=''){const x=node('select');for(const [v,label] of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
function numberInput(value,min,max){const x=node('input');x.type='number';x.min=String(min);x.max=String(max);x.step='1';x.required=true;x.value=String(value);return x;}
const statusLabel=value=>({scheduled:'مجدولة',assigned:'مسندة',in_progress:'قيد التنفيذ',completed:'مكتملة',cancelled:'ملغاة'}[value]||value||'—');
const minutes=value=>value==null?'—':`${Number(value).toLocaleString('ar-KW')} دقيقة`;
const evidenceLabel=value=>value==='before'?'قبل التنفيذ':'بعد التنفيذ';
const stageLabel=value=>value==='response'?'تأخر الاستجابة':'تأخر الإنجاز';

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
  const docs=(ctx.imageDocuments||[]).map(x=>[x.id,`${x.documentNo||'بدون رقم'} · ${x.title||x.id}`]);if(!docs.length)throw Error('لا توجد صورة مؤرشفة ومطابقة لهذا العقار. ارفع الصورة إلى مستندات العقار أولاً.');
  d.body.replaceChildren(node('h3',`${evidenceLabel(stage)} · ${current.taskNo}`),button('رجوع',()=>d.run(render)));
  const f=node('form'),documentId=select(docs),reason=node('textarea');reason.required=true;reason.minLength=3;reason.value=stage==='before'?'توثيق حالة الموقع قبل تنفيذ الصيانة':'توثيق نتيجة الصيانة بعد التنفيذ';
  f.append(field(translateStatic('الصورة المؤرشفة'),documentId),field(translateStatic('ملاحظة/سبب التوثيق'),reason));const save=node('button',translateStatic('حفظ الدليل وإعادة القراءة'));save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'add',p_data:{taskId:current.id,documentId:documentId.value,stage,reason:text(reason.value)}});d.session.check();if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user||response?.record?.task_id!==current.id)throw Error('لم تتأكد إعادة قراءة دليل الصيانة.');await render();d.status.textContent=`تم حفظ صورة ${evidenceLabel(stage)} كسجل غير قابل للتعديل أو الحذف.`;});};
 }
 async function configureSla(){
  await read();if(!slaCtx.canWrite)throw Error('إعداد SLA للصيانة محصور بالمدير العام المخوّل.');
  const policy=slaCtx.policy||{},responseMinutes=numberInput(policy.responseMinutes??60,5,10080),resolutionMinutes=numberInput(policy.resolutionMinutes??1440,5,43200),channel=select([['push','تنبيه داخل المنصة / Push'],['email','بريد إلكتروني']],policy.channel||'push'),active=node('input'),reason=node('textarea');
  active.type='checkbox';active.checked=policy.active!==false;reason.required=true;reason.minLength=3;reason.value='تحديث سياسة زمن الاستجابة والإنجاز للصيانة';
  d.body.replaceChildren(node('h3',translateStatic('سياسة SLA للصيانة')),button('رجوع',()=>d.run(render)));
  const f=node('form');f.append(field(translateStatic('حد الاستجابة بالدقائق'),responseMinutes),field(translateStatic('حد الإنجاز بالدقائق'),resolutionMinutes),field(translateStatic('قناة التصعيد'),channel),field(translateStatic('تفعيل التصعيد الآلي'),active),field(translateStatic('سبب التعديل'),reason));const save=node('button',translateStatic('حفظ السياسة وإعادة القراءة'));save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_maintenance_sla',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'save',p_data:{responseMinutes:Number(responseMinutes.value),resolutionMinutes:Number(resolutionMinutes.value),channel:channel.value,active:active.checked,revision:Number(policy.revision||0),reason:text(reason.value)}});d.session.check();if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user)throw Error('لم تتأكد إعادة قراءة سياسة SLA.');await render();d.status.textContent=translateStatic('تم حفظ سياسة SLA مع سجل تدقيق، وسيقوم الفحص الآلي بتصعيد التجاوزات.');});};
 }
 async function prepareEscalations(){
  await read();if(!slaCtx.canWrite)throw Error('فحص التصعيد محصور بالمدير العام المخوّل.');
  const response=await rpc('aqari_maintenance_sla',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'prepare',p_data:{}});d.session.check();
  if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user)throw Error('لم تتأكد نتيجة فحص SLA.');
  await render();d.status.textContent=`اكتمل فحص التصعيد: ${Number(response?.run?.inserted||0).toLocaleString('ar-KW')} تصعيد جديد. الفحص الآلي يستمر كل 15 دقيقة.`;
 }
 async function render(){
  await read();d.body.replaceChildren();
  const sla=section('سياسة زمن الاستجابة والتصعيد');const policy=slaCtx.policy;
  if(policy&&policy.active!==false)sla.append(node('p',`حد الاستجابة: ${minutes(policy.responseMinutes)} · حد الإنجاز: ${minutes(policy.resolutionMinutes)} · قناة التصعيد: ${policy.channel==='email'?'البريد الإلكتروني':'Push'} · الفحص الآلي: كل 15 دقيقة.`));
  else sla.append(node('p',policy?'سياسة SLA محفوظة لكنها معطلة لهذا العقار.':'لم تُضبط بعد سياسة SLA لهذا العقار؛ لا يتم افتراض حد زمني من النظام.'));
  if(slaCtx.canWrite){sla.append(button('إعداد سياسة SLA',()=>d.run(configureSla)));if(policy?.active!==false&&policy)sla.append(button('فحص التصعيد الآن',()=>d.run(prepareEscalations)));}
  const escalations=Array.isArray(slaCtx.escalations)?slaCtx.escalations:[];if(escalations.length)sla.append(node('p',`التصعيدات المحفوظة: ${escalations.length.toLocaleString('ar-KW')} — سجلات غير قابلة للتعديل أو الحذف.`));
  d.body.append(sla);
  const head=section('التوثيق التشغيلي');head.append(node('p',translateStatic('المهام الجديدة تتطلب صورة قبل بدء التنفيذ وصورة بعد التنفيذ قبل الإقفال. السجلات لا تُحذف ولا تُعدّل.')));d.body.append(head);
  const evidence=Array.isArray(ctx.evidence)?ctx.evidence:[],documents=new Map((ctx.imageDocuments||[]).map(x=>[x.id,x])),slaTasks=new Map((slaCtx.tasks||[]).map(x=>[x.id,x]));const tasks=Array.isArray(ctx.tasks)?ctx.tasks:[];
  if(!tasks.length)d.body.append(node('p',translateStatic('لا توجد مهام صيانة مرتبطة بهذا العقار.')));
  for(const task of tasks){
   const card=section(`${task.taskNo||'بدون رقم'} · ${statusLabel(task.status)}`),slaTask=slaTasks.get(task.id);const overdue=Number(task.overdueDays||0);
   card.append(node('p',task.description||'بدون وصف'),node('p',`الاستحقاق: ${task.dueOn||'—'} · التأخير: ${overdue} يوم${task.needsEscalation?' · متأخرة عن الاستحقاق':''}`),node('p',`زمن الاستجابة: ${minutes(task.responseMinutes)} · زمن التنفيذ: ${minutes(task.resolutionMinutes)}`));
   if(policy?.active!==false&&policy&&slaTask?.responseBreached)card.append(node('p',`⚠ ${stageLabel('response')}: تجاوز حد ${minutes(policy.responseMinutes)} وتم إدخاله في مسار التصعيد الآلي.`));
   if(policy?.active!==false&&policy&&slaTask?.resolutionBreached)card.append(node('p',`⚠ ${stageLabel('resolution')}: تجاوز حد ${minutes(policy.resolutionMinutes)} وتم إدخاله في مسار التصعيد الآلي.`));
   const taskEscalations=escalations.filter(x=>x.taskId===task.id);for(const item of taskEscalations)card.append(node('p',`${stageLabel(item.stage)} · الحد ${minutes(item.thresholdMinutes)} · التجاوز ${item.breachedAt||'—'} · التصعيد ${item.preparedAt||'—'}`));
   if(Number(task.policyVersion||0)===0)card.append(node('p',translateStatic('مهمة قديمة: سياسة صورة «قبل» لم تكن إلزامية عند إنشائها، لكن صورة «بعد» مطلوبة عند الإقفال.')));
   const rows=evidence.filter(x=>x.taskId===task.id);if(!rows.length)card.append(node('p',translateStatic('لا توجد أدلة صور محفوظة لهذه المهمة.')));
   for(const item of rows){const doc=documents.get(item.documentId);card.append(node('p',`${evidenceLabel(item.stage)} · ${doc?.title||item.documentId} · ${item.capturedAt||'—'} · ${item.capturedBy||'—'}${item.note?' · '+item.note:''}`));}
   if(ctx.canWrite&&['scheduled','assigned'].includes(task.status))card.append(button('إضافة صورة قبل التنفيذ',()=>d.run(()=>addEvidence(task,'before'))));
   if(ctx.canWrite&&task.status==='in_progress')card.append(button('إضافة صورة بعد التنفيذ',()=>d.run(()=>addEvidence(task,'after'))));
   d.body.append(card);
  }
  d.status.textContent=policy?'المؤشرات تقارن القياس الفعلي بسياسة SLA المحفوظة لهذا العقار.':'المؤشرات المعروضة قياسات زمنية فعلية؛ لا تُفترض أهداف SLA قبل ضبطها من المدير العام.';
 }
 d.run(render);return true;
}

