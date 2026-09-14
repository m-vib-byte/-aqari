import {createDialog,node,field} from '../components/dialog.js';

const text=value=>String(value??'').trim();
function button(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
function section(title){const s=node('section');s.className='aq267-property-master-section';s.append(node('h3',title));return s;}
function select(rows,value=''){const x=node('select');for(const [v,label] of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
const statusLabel=value=>({scheduled:'مجدولة',assigned:'مسندة',in_progress:'قيد التنفيذ',completed:'مكتملة',cancelled:'ملغاة'}[value]||value||'—');
const minutes=value=>value==null?'—':`${Number(value).toLocaleString('ar-KW')} دقيقة`;
const evidenceLabel=value=>value==='before'?'قبل التنفيذ':'بعد التنفيذ';

export function openMaintenanceEvidence(propertyId){
 const d=createDialog('أدلة الصيانة قبل وبعد');if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 let ctx;
 async function read(){
  ctx=await rpc('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'context',p_data:{}});d.session.check();
  if(ctx?.workspace_id!==d.session.bound.workspace||ctx?.propertyId!==propertyId||ctx?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق أدلة الصيانة.');return ctx;
 }
 async function addEvidence(task,stage){
  await read();if(!ctx.canWrite)throw Error('إضافة أدلة الصيانة غير متاحة لصلاحية حسابك.');
  const current=(ctx.tasks||[]).find(x=>x.id===task.id);if(!current)throw Error('مهمة الصيانة لم تعد متاحة.');
  if(stage==='before'&&!['scheduled','assigned'].includes(current.status))throw Error('صورة قبل التنفيذ يجب حفظها قبل بدء المهمة.');
  if(stage==='after'&&current.status!=='in_progress')throw Error('صورة بعد التنفيذ تُحفظ أثناء التنفيذ وقبل إقفال المهمة.');
  const docs=(ctx.imageDocuments||[]).map(x=>[x.id,`${x.documentNo||'بدون رقم'} · ${x.title||x.id}`]);if(!docs.length)throw Error('لا توجد صورة مؤرشفة ومطابقة لهذا العقار. ارفع الصورة إلى مستندات العقار أولاً.');
  d.body.replaceChildren(node('h3',`${evidenceLabel(stage)} · ${current.taskNo}`),button('رجوع',()=>d.run(render)));
  const f=node('form'),documentId=select(docs),reason=node('textarea');reason.required=true;reason.minLength=3;reason.value=stage==='before'?'توثيق حالة الموقع قبل تنفيذ الصيانة':'توثيق نتيجة الصيانة بعد التنفيذ';
  f.append(field('الصورة المؤرشفة',documentId),field('ملاحظة/سبب التوثيق',reason));const save=node('button','حفظ الدليل وإعادة القراءة');save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'add',p_data:{taskId:current.id,documentId:documentId.value,stage,reason:text(reason.value)}});d.session.check();if(response?.workspace_id!==d.session.bound.workspace||response?.propertyId!==propertyId||response?.user_id!==d.session.bound.user||response?.record?.task_id!==current.id)throw Error('لم تتأكد إعادة قراءة دليل الصيانة.');await render();d.status.textContent=`تم حفظ صورة ${evidenceLabel(stage)} كسجل غير قابل للتعديل أو الحذف.`;});};
 }
 async function render(){
  await read();d.body.replaceChildren();const head=section('التوثيق التشغيلي');head.append(node('p','المهام الجديدة تتطلب صورة قبل بدء التنفيذ وصورة بعد التنفيذ قبل الإقفال. السجلات لا تُحذف ولا تُعدّل.'));d.body.append(head);
  const evidence=Array.isArray(ctx.evidence)?ctx.evidence:[],documents=new Map((ctx.imageDocuments||[]).map(x=>[x.id,x]));const tasks=Array.isArray(ctx.tasks)?ctx.tasks:[];
  if(!tasks.length)d.body.append(node('p','لا توجد مهام صيانة مرتبطة بهذا العقار.'));
  for(const task of tasks){
   const card=section(`${task.taskNo||'بدون رقم'} · ${statusLabel(task.status)}`);const overdue=Number(task.overdueDays||0);
   card.append(node('p',task.description||'بدون وصف'),node('p',`الاستحقاق: ${task.dueOn||'—'} · التأخير: ${overdue} يوم${task.needsEscalation?' · يحتاج تصعيد':''}`),node('p',`زمن الاستجابة: ${minutes(task.responseMinutes)} · زمن التنفيذ: ${minutes(task.resolutionMinutes)}`));
   if(Number(task.policyVersion||0)===0)card.append(node('p','مهمة قديمة: سياسة صورة «قبل» لم تكن إلزامية عند إنشائها، لكن صورة «بعد» مطلوبة عند الإقفال.'));
   const rows=evidence.filter(x=>x.taskId===task.id);if(!rows.length)card.append(node('p','لا توجد أدلة صور محفوظة لهذه المهمة.'));
   for(const item of rows){const doc=documents.get(item.documentId);card.append(node('p',`${evidenceLabel(item.stage)} · ${doc?.title||item.documentId} · ${item.capturedAt||'—'} · ${item.capturedBy||'—'}${item.note?' · '+item.note:''}`));}
   if(ctx.canWrite&&['scheduled','assigned'].includes(task.status))card.append(button('إضافة صورة قبل التنفيذ',()=>d.run(()=>addEvidence(task,'before'))));
   if(ctx.canWrite&&task.status==='in_progress')card.append(button('إضافة صورة بعد التنفيذ',()=>d.run(()=>addEvidence(task,'after'))));
   d.body.append(card);
  }
  d.status.textContent='المؤشرات المعروضة قياسات زمنية فعلية من الاستحقاق/الإسناد/البدء/الإقفال؛ لا تُفترض أهداف SLA غير مهيأة.';
 }
 d.run(render);return true;
}
