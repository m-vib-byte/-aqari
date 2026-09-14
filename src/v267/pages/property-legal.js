import {createDialog,node,field} from '../components/dialog.js';

const text=v=>String(v??'').trim();
const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
function button(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
function select(rows,value=''){const x=node('select');for(const [v,label] of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
function section(title){const s=node('section');s.className='aq267-property-master-section';s.append(node('h3',title));return s;}
const categories=[['notice','إنذار/إخطار'],['case','قضية'],['claim','مطالبة'],['eviction','إخلاء'],['collection','تحصيل قانوني'],['other','أخرى']];
const statuses=[['draft','مسودة'],['open','مفتوح'],['hearing','جلسات'],['judgment','حكم/قرار'],['closed','مغلق'],['cancelled','ملغى']];
const eventKinds=[['notice','إخطار'],['hearing','جلسة'],['action','إجراء'],['judgment','حكم/قرار'],['cost','تكلفة'],['closure','إغلاق'],['cancellation','إلغاء'],['document','مستند']];
const label=(rows,value)=>rows.find(x=>x[0]===value)?.[1]||value||'—';

export function openPropertyLegalFile(propertyId){
 const d=createDialog('الملف القانوني للعقار');if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 let ctx;
 async function read(){
  ctx=await rpc('aqari_property_legal_file',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'context',p_data:{}});d.session.check();
  if(ctx?.workspace_id!==d.session.bound.workspace||ctx?.propertyId!==propertyId||ctx?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق الملف القانوني.');return ctx;
 }
 async function editCase(existing=null){
  await read();if(!ctx.canWrite)throw Error('تعديل الملف القانوني غير متاح لصلاحية حسابك.');
  d.body.replaceChildren(node('h3',existing?'تعديل الملف القانوني':'إضافة ملف قانوني'),button('رجوع',()=>d.run(render)));
  const f=node('form'),caseNo=input('text',existing?.caseNo||''),title=input('text',existing?.title||''),category=select(categories,existing?.category||'case'),status=select(statuses,existing?.status||'draft'),lawyer=input('text',existing?.lawyerName||''),phone=input('tel',existing?.lawyerPhone||''),court=input('text',existing?.court||''),filed=input('date',existing?.filedOn||''),hearing=input('date',existing?.nextHearingOn||''),judgment=input('date',existing?.judgmentOn||''),amount=input('text',existing?.amount??''),notes=node('textarea'),reason=node('textarea');
  notes.value=existing?.notes||'';reason.value=existing?'تحديث الملف القانوني':'إنشاء الملف القانوني';reason.required=true;reason.minLength=3;title.required=true;amount.inputMode='decimal';
  const contractRows=[['','بدون عقد محدد'],...(ctx.contracts||[]).map(x=>[x.id,`${x.contractNo||x.id} · ${x.status||'—'}`])],tenantRows=[['','بدون مستأجر محدد'],...(ctx.tenants||[]).map(x=>[x.id,x.name||x.id])];
  const lease=select(contractRows,existing?.leaseId||''),tenant=select(tenantRows,existing?.tenantId||'');
  for(const [name,control] of [['رقم/مرجع القضية أو الإنذار',caseNo],['العنوان',title],['التصنيف',category],['الحالة',status],['العقد المرتبط',lease],['المستأجر المرتبط',tenant],['المحامي',lawyer],['هاتف المحامي',phone],['المحكمة/الجهة',court],['تاريخ القيد',filed],['الجلسة القادمة',hearing],['تاريخ الحكم/القرار',judgment],['المبلغ المرتبط',amount],['ملاحظات',notes],['سبب الحفظ/التعديل',reason]])f.append(field(name,control));
  const save=node('button','حفظ وإعادة القراءة');save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_property_legal_file',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'save_case',p_data:{id:existing?.id||null,revision:Number(existing?.revision||0),caseNo:text(caseNo.value),title:text(title.value),category:category.value,status:status.value,leaseId:lease.value||null,tenantId:tenant.value||null,lawyerName:text(lawyer.value),lawyerPhone:text(phone.value),court:text(court.value),filedOn:filed.value||null,nextHearingOn:hearing.value||null,judgmentOn:judgment.value||null,amount:text(amount.value)||null,notes:text(notes.value),reason:text(reason.value)}});d.session.check();if(response?.record?.id!==(existing?.id||response?.record?.id)||response?.propertyId!==propertyId)throw Error('لم تتأكد إعادة قراءة الملف القانوني.');await render();d.status.textContent='تم حفظ الملف القانوني وإعادة قراءته.';});};
 }
 async function addEvent(item){
  await read();if(!ctx.canWrite)throw Error('إضافة إجراء قانوني غير متاحة لصلاحية حسابك.');
  const current=(ctx.cases||[]).find(x=>x.id===item.id);if(!current)throw Error('الملف القانوني لم يعد متاحًا.');
  d.body.replaceChildren(node('h3','إضافة إجراء · '+current.title),button('رجوع',()=>d.run(render)));
  const f=node('form'),kind=select(eventKinds,'action'),date=input('date',new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),title=input('text',''),details=node('textarea'),amount=input('text',''),documentId=input('text',''),reason=node('textarea');title.required=true;amount.inputMode='decimal';reason.required=true;reason.minLength=3;reason.value='إضافة إجراء إلى الملف القانوني';
  for(const [name,control]of [['نوع الإجراء',kind],['التاريخ',date],['العنوان',title],['التفاصيل',details],['التكلفة/المبلغ',amount],['معرّف مستند مؤرشف اختياري',documentId],['سبب الإضافة',reason]])f.append(field(name,control));
  const save=node('button','إضافة الإجراء وإعادة القراءة');save.type='submit';f.append(save);d.body.append(f);
  f.onsubmit=e=>{e.preventDefault();d.run(async()=>{const response=await rpc('aqari_property_legal_file',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:'add_event',p_data:{caseId:current.id,kind:kind.value,happenedOn:date.value,title:text(title.value),details:text(details.value),amount:text(amount.value)||null,documentId:text(documentId.value)||null,reason:text(reason.value)}});d.session.check();if(response?.ok!==true||response?.caseId!==current.id||response?.propertyId!==propertyId)throw Error('لم تتأكد إضافة الإجراء القانوني.');await render();d.status.textContent='تمت إضافة الإجراء إلى السجل غير القابل للحذف.';});};
 }
 async function render(){
  await read();d.body.replaceChildren();const head=section('القضايا والإنذارات والإجراءات');head.append(node('p','يرتبط السجل بالعقار ويمكن ربطه بالعقد والمستأجر. لا يوجد حذف فعلي بعد الحفظ.'));if(ctx.canWrite)head.append(button('+ ملف قانوني',()=>d.run(()=>editCase(null))));d.body.append(head);
  const cases=Array.isArray(ctx.cases)?ctx.cases:[],events=Array.isArray(ctx.events)?ctx.events:[];
  if(!cases.length)d.body.append(node('p','لا توجد ملفات قانونية مرتبطة بهذا العقار.'));
  for(const item of cases){
   const card=section(`${item.caseNo||'بدون رقم'} · ${item.title}`);card.append(node('p',`${label(categories,item.category)} · ${label(statuses,item.status)} · المحكمة/الجهة: ${item.court||'—'}`),node('p',`المحامي: ${item.lawyerName||'—'} · الهاتف: ${item.lawyerPhone||'—'}`),node('p',`تاريخ القيد: ${item.filedOn||'—'} · الجلسة القادمة: ${item.nextHearingOn||'—'} · الحكم/القرار: ${item.judgmentOn||'—'}`),node('p',`المبلغ: ${item.amount==null?'—':Number(item.amount).toFixed(3)+' د.ك'} · الملاحظات: ${item.notes||'—'}`));
   if(item.leaseId)card.append(node('p','العقد المرتبط: '+item.leaseId));if(item.tenantId)card.append(node('p','المستأجر المرتبط: '+item.tenantId));
   if(ctx.canWrite)card.append(button('تعديل',()=>d.run(()=>editCase(item))),button('+ إجراء/جلسة/حكم',()=>d.run(()=>addEvent(item))));
   const history=section('السجل التاريخي');const rows=events.filter(x=>x.caseId===item.id);if(!rows.length)history.append(node('p','لا توجد إجراءات مسجلة.'));for(const e of rows){history.append(node('p',`${e.happenedOn||'—'} · ${label(eventKinds,e.kind)} · ${e.title||'—'}${e.amount==null?'':' · '+Number(e.amount).toFixed(3)+' د.ك'} · ${e.actor||'—'}`));if(e.details)history.append(node('p',e.details));if(e.documentId)history.append(node('p','مستند مؤرشف: '+e.documentId));}card.append(history);d.body.append(card);
  }
  d.status.textContent='الملف القانوني يقرأ البيانات من RPC خادمي بصلاحيات العقار والعقود؛ الأحداث التاريخية غير قابلة للتعديل أو الحذف.';
 }
 d.run(render);return true;
}
