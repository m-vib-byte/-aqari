import {createDialog,node,field} from '../components/dialog.js';
import {t,message} from '../components/locale.js';
import {maintenancePhotoDocumentation} from './maintenance-evidence.js';

const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
const fils=value=>{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const match=/^(\d{1,12})(?:\.(\d{1,3}))?$/.exec(String(value));
 return match?BigInt(match[1])*1000n+BigInt((match[2]||'').padEnd(3,'0')):null;
};
const money=value=>`${value/1000n}.${String(value%1000n).padStart(3,'0')}`;
const stateLabel={get done(){return t('تم');},get not_done(){return t('لم يتم');},get undocumented(){return t('غير موثّق');}};

// Read-only projection. It never upgrades the persisted task or fills missing
// operational details from unrelated invoices, vendors, or other properties.
export function buildMonthlyMaintenanceReport(data,context,{workspaceId,propertyId,month,today}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!validDate(month+'-01')||!validDate(today))throw Error('اختر شهرًا وتاريخًا صحيحين.');
 if(!workspaceId||!propertyId||!Array.isArray(data?.properties)||!data.properties.some(p=>p.id===propertyId)
  ||!Array.isArray(data.tasks)||!Array.isArray(data.documents)||!Array.isArray(data.vendors)
  ||context?.workspace_id!==workspaceId||context?.propertyId!==propertyId||!Array.isArray(context.evidence)||!Array.isArray(context.imageDocuments))throw Error('تعذر تأكيد نطاق التقرير الشهري للصيانة.');
 const docs=new Map(data.documents.filter(d=>d.property_id===propertyId).map(d=>[d.id,d]));
 const vendors=new Map(data.vendors.map(v=>[v.id,v.name]));
 const summary={done:0,not_done:0,undocumented:0,cancelled:0,overdue:0,unknown_cost:0};
 let total=0n;
 const rows=[];
 for(const task of data.tasks){
  if(task.workspace_id!==workspaceId||task.property_id!==propertyId)continue;
  if(!validDate(task.due_on))throw Error('توجد مهمة بلا تاريخ استحقاق صالح؛ تعذر تأكيد اكتمال التقرير.');
  if(task.due_on.slice(0,7)!==month)continue;
  const proof=maintenancePhotoDocumentation(task,context.evidence,context.imageDocuments),document=docs.get(task.completion_document_id);
  const photos=Array.isArray(task.photo_document_ids)?task.photo_document_ids:[];
  const completionPhotos=photos.length>0&&photos.every(id=>docs.has(id)&&['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(docs.get(id).mime_type));
  const missing=[];
  if(!document)missing.push('مستند الإغلاق غير متاح');
  for(const stage of proof.missing)missing.push(stage==='before'?'صورة قبل التنفيذ غير متاحة':'صورة بعد التنفيذ غير متاحة');
  if(!completionPhotos)missing.push('صور الإنجاز المرتبطة بالإغلاق غير متاحة');
  if(!task.completed_by||!timestamp(task.completed_at))missing.push('اعتماد الإغلاق غير موثّق');
  const terminal=['completed','cancelled'].includes(task.status);
  const state=task.status==='completed'?(missing.length?'undocumented':'done'):
   ['scheduled','assigned','in_progress','cancelled'].includes(task.status)?'not_done':'undocumented';
  const cost=fils(task.cost);
  if(cost===null)summary.unknown_cost++;else total+=cost;
  summary[state]++;if(task.status==='cancelled')summary.cancelled++;
  const overdue=!terminal&&task.due_on<today;if(overdue)summary.overdue++;
  rows.push({id:task.id,number:task.task_no,description:task.description,state,cancelled:task.status==='cancelled',dueOn:task.due_on,
   completedAt:task.completed_at||null,vendor:vendors.get(task.assigned_vendor_id)||null,cost:cost===null?null:money(cost),
   completionDocument:document?{id:document.id,number:document.document_no||null,title:document.title||null}:null,
   missing,overdue});
 }
 rows.sort((a,b)=>a.dueOn.localeCompare(b.dueOn)||String(a.number).localeCompare(String(b.number)));
 return {property:data.properties.find(p=>p.id===propertyId),month,rows,summary:{...summary,total_cost:money(total)}};
}

export function mountMonthlyMaintenanceReport(d){
 const property=node('select'),month=node('input'),submit=node('button',t('عرض التقرير')),form=node('form'),output=node('section');
 month.type='month';month.required=true;month.value=new Date(Date.now()+10800000).toISOString().slice(0,7);property.required=true;submit.type='submit';
 form.append(field(t('العقار'),property),field(t('الشهر'),month),submit);
 d.body.append(node('p',t('تقرير مستقل حسب شهر استحقاق المهمة. «تم» يعني وجود اعتماد الإغلاق ومستنده وصور قبل وبعد ضمن الأدلة المتاحة لحسابك.')),form,output);
 const read=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const list=()=>read('aqari_maintenance_plans',{p_workspace_id:d.session.bound.workspace,p_action:'list',p_data:{}});
 async function load(){
  output.replaceChildren();
  const selected={propertyId:property.value,month:month.value};
  if(!selected.propertyId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected.month))throw Error('اختر العقار والشهر.');
  const data=await list();d.session.check();
  if(!data?.properties?.some(p=>p.id===selected.propertyId))throw Error('العقار لم يعد متاحًا لحسابك.');
  const context=await read('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:selected.propertyId,p_action:'context',p_data:{}});d.session.check();
  if(context?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد حساب التقرير.');
  const result=buildMonthlyMaintenanceReport(data,context,{...selected,workspaceId:d.session.bound.workspace,today:new Date(Date.now()+10800000).toISOString().slice(0,10)});
  output.append(node('h2',`${result.property.name} — ${result.month}`));
  const s=result.summary;
  output.append(node('p',message('تم: {done} · لم يتم: {open} · غير موثّق: {missing} · متأخر: {late}',{done:s.done,open:s.not_done,missing:s.undocumented,late:s.overdue})),
   node('p',message('التكاليف المسجلة: {cost} د.ك · تكاليف غير متاحة: {unknown} · مهام ملغاة: {cancelled}',{cost:s.total_cost,unknown:s.unknown_cost,cancelled:s.cancelled})),
   node('p',t('اسم الفني وتاريخ الفحص ورقم الفاتورة وتفاصيل النتيجة النهائية والمسؤول وموعد الإقفال المخطط غير متاحة في هذا العرض. مستند الإغلاق لا يُفترض أنه فاتورة.')),
   node('p',t('هذا عرض عند الطلب؛ إصدار التقرير تلقائيًا صباح يوم 25 لم يُفعّل هنا.')));
  if(!result.rows.length)output.append(node('p',t('لا توجد مهام محفوظة لهذا العقار في شهر الاستحقاق المحدد. عدم وجود مهام لا يثبت إجراء الفحص.')));
  for(const row of result.rows){
   const card=node('article');card.append(node('h3',`${row.number||'—'} · ${stateLabel[row.state]}`),node('p',row.description||'—'),
    node('p',message('الاستحقاق: {due} · الشركة: {vendor} · التكلفة: {cost}',{due:row.dueOn,vendor:row.vendor||t('غير متاح'),cost:row.cost===null?t('غير متاح'):row.cost+' '+t('د.ك')})),
    node('p',message('اعتماد الإغلاق: {date} · مستند الإغلاق: {document}',{date:row.completedAt||t('غير متاح'),document:row.completionDocument?.number||row.completionDocument?.title||t('غير متاح')})));
   if(row.cancelled)card.append(node('p',t('المهمة ملغاة؛ لا تُحتسب منجزة.')));
   for(const missing of row.missing)card.append(node('p',t(missing)));
   output.append(card);
  }
  d.status.textContent=t('تم استرجاع التقرير من السجلات المحفوظة.');return result;
 }
 form.onsubmit=e=>{e.preventDefault();return d.run(load);};
 d.onDispose(()=>{output.replaceChildren();property.replaceChildren();month.value='';});
 return {async initialize(){const data=await list();d.session.check();if(!Array.isArray(data?.properties))throw Error('تعذر استرجاع العقارات.');property.replaceChildren();for(const p of data.properties){const option=node('option',p.name);option.value=p.id;property.append(option);}if(!data.properties.length)d.status.textContent=t('لا توجد عقارات متاحة لهذا الحساب.');},load};
}

export function openMonthlyMaintenanceReport(){const d=createDialog(t('التقرير الشهري للصيانة حسب العقار'));if(d)d.run(()=>mountMonthlyMaintenanceReport(d).initialize());}
