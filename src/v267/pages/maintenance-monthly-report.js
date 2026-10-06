import {createDialog,node,field} from '../components/dialog.js';
import {t,message} from '../components/locale.js';
import {maintenancePhotoDocumentation} from './maintenance-evidence.js';
import {mountMonthlyDetails,checkDetailsScope,inspectionKinds} from './maintenance-monthly-details.js';
import {mountMonthlySchedule} from './maintenance-monthly-schedule.js';

const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const timestamp=value=>typeof value==='string'&&validDate(value.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)&&Number.isFinite(Date.parse(value));
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
 const detailsContext=context.reportDetails;
 if(detailsContext?.version!==1||detailsContext.workspace_id!==workspaceId||detailsContext.propertyId!==propertyId||!Array.isArray(detailsContext.details)||!Array.isArray(detailsContext.documents)||!Array.isArray(detailsContext.responsibles))throw Error('تعذر تأكيد تفاصيل التقرير المحفوظة.');
 const detailMap=new Map(detailsContext.details.map(x=>[x.task_id,x])),detailDocs=new Map(detailsContext.documents.map(x=>[x.id,x]));
 const people=new Set(detailsContext.responsibles.map(x=>x.id)),plans=new Map((data.plans||[]).map(x=>[x.id,x])),contracts=new Map((data.contracts||[]).map(x=>[x.id,x]));
 const docs=new Map(data.documents.filter(d=>d.property_id===propertyId).map(d=>[d.id,d]));
 const vendors=new Map(data.vendors.map(v=>[v.id,v.name]));
 const summary={done:0,not_done:0,undocumented:0,cancelled:0,overdue:0,unknown_cost:0,urgent:0,missing_invoice:0,missing_contract:0,prior_overdue:0};
 let total=0n;
 const rows=[];
 for(const task of data.tasks){
  if(task.workspace_id!==workspaceId||task.property_id!==propertyId)continue;
  if(!validDate(task.due_on))throw Error('توجد مهمة بلا تاريخ استحقاق صالح؛ تعذر تأكيد اكتمال التقرير.');
  if(task.due_on.slice(0,7)!==month){if(task.due_on<month+'-01'&&!['completed','cancelled'].includes(task.status))summary.prior_overdue++;continue;}
  const proof=maintenancePhotoDocumentation(task,context.evidence,context.imageDocuments),document=docs.get(task.completion_document_id);
  const photos=Array.isArray(task.photo_document_ids)?task.photo_document_ids:[];
  const completionPhotos=photos.length>0&&photos.every(id=>docs.has(id)&&['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(docs.get(id).mime_type));
  const afterLinked=context.evidence.some(e=>e.taskId===task.id&&e.stage==='after'&&photos.includes(e.documentId));
  const missing=[];
  if(!vendors.get(task.assigned_vendor_id))missing.push('شركة الصيانة غير متاحة');
  if(!document)missing.push('مستند الإغلاق غير متاح');
  for(const stage of proof.missing)missing.push(stage==='before'?'صورة قبل التنفيذ غير متاحة':'صورة بعد التنفيذ غير متاحة');
  if(!completionPhotos)missing.push('صور الإنجاز المرتبطة بالإغلاق غير متاحة');
  if(!afterLinked)missing.push('صورة بعد التنفيذ غير مرتبطة باعتماد الإغلاق');
  if(!task.completed_by||!timestamp(task.completed_at))missing.push('اعتماد الإغلاق غير موثّق');
  if(!timestamp(task.assigned_at)||!timestamp(task.started_at)||!timestamp(task.completed_at)
   ||Date.parse(task.started_at)<Date.parse(task.assigned_at)||Date.parse(task.completed_at)<Date.parse(task.started_at))missing.push('تسلسل التكليف والتنفيذ والإغلاق غير موثّق');
  const details=detailMap.get(task.id),invoice=detailDocs.get(details?.invoice_document_id),plan=plans.get(task.plan_id),contract=contracts.get(plan?.vendor_contract_id);
  const kind=details?.inspection_kind||plan?.asset_kind||'other';
  if(!details?.technician_name?.trim())missing.push('اسم الفني غير موثّق');
  if(!validDate(details?.inspected_on)||details.inspected_on>today)missing.push('تاريخ الفحص غير موثّق');
  if(!invoice||!details?.invoice_number?.trim()){missing.push('الفاتورة ورقمها غير موثّقين');summary.missing_invoice++;}
  if(!details?.result_details?.trim()||!details.verified_by||!timestamp(details.verified_at)||details.verified_at.slice(0,10)>today||details.task_revision!==task.revision||Date.parse(details.verified_at)<Date.parse(task.completed_at))missing.push('نتيجة الإصلاح واعتمادها غير موثّقين');
  if(!people.has(details?.responsible_user_id))missing.push('المسؤول عن المتابعة غير متاح');
  if(!validDate(details?.planned_close_on))missing.push('موعد الإقفال المخطط غير موثّق');
  if(!contract){missing.push('عقد شركة الصيانة غير متاح');summary.missing_contract++;}
  if(details?.urgent===true)summary.urgent++;
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
   missing,overdue,details:details||null,invoice:invoice||null,contract:contract||null,inspectionKind:kind,task,
   evidence:context.evidence.filter(e=>e.taskId===task.id).map(e=>({...e,document:detailDocs.get(e.documentId)||null})),document:detailDocs.get(task.completion_document_id)||null});
 }
 rows.sort((a,b)=>a.dueOn.localeCompare(b.dueOn)||String(a.number).localeCompare(String(b.number)));
 const coverage=Object.keys(inspectionKinds).filter(k=>k!=='other').map(kind=>({kind,hasTask:rows.some(r=>r.inspectionKind===kind),documented:rows.some(r=>r.inspectionKind===kind)&&rows.filter(r=>r.inspectionKind===kind).every(r=>r.state==='done')}));
 return {coverage,property:data.properties.find(p=>p.id===propertyId),month,rows,summary:{...summary,total_cost:money(total)}};
}

export function mountMonthlyMaintenanceReport(d){
 const property=node('select'),month=node('input'),submit=node('button',t('عرض التقرير')),form=node('form'),output=node('section');
 month.type='month';month.required=true;month.value=new Date(Date.now()+10800000).toISOString().slice(0,7);property.required=true;submit.type='submit';
 form.append(field(t('العقار'),property),field(t('الشهر'),month),submit);
 d.body.append(node('p',t('تقرير مستقل حسب شهر استحقاق المهمة. «تم» يعني وجود اعتماد الإغلاق ومستنده وصور قبل وبعد ضمن الأدلة المتاحة لحسابك.')),form,output);
 const urls=new Set();d.onDispose(()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();});
 async function openDocument(document,target){
  const {readStoredOriginal,originalDocumentExtension}=await import('../components/stored-original.js');d.session.check();
  const {blob,note}=await readStoredOriginal(d.session,{id:document.id,storagePath:document.storagePath,entityType:'property',entityRef:document.entityRef});d.session.check();
  const url=URL.createObjectURL(blob);urls.add(url);const link=node('a',t('فتح الملف الأصلي المتحقق منه'));link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.download=(document.number||'maintenance')+originalDocumentExtension(document.mimeType);target.append(link);d.status.textContent=t(note);
 }
 const documentButton=(label,document,target)=>{if(!document)return;const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(()=>openDocument(document,target));target.append(b);};
 const read=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const list=()=>read('aqari_maintenance_plans',{p_workspace_id:d.session.bound.workspace,p_action:'list',p_data:{}});
 async function load(snapshot=null){
  output.replaceChildren();for(const url of urls)URL.revokeObjectURL(url);urls.clear();
  const selected={propertyId:property.value,month:month.value};
  if(!selected.propertyId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected.month))throw Error('اختر العقار والشهر.');
  const data=snapshot?snapshot.payload.data:await list();d.session.check();
  if(!data?.properties?.some(p=>p.id===selected.propertyId))throw Error('العقار لم يعد متاحًا لحسابك.');
  const context=snapshot?{...snapshot.payload.context,user_id:d.session.bound.user}:await read('aqari_maintenance_evidence',{p_workspace_id:d.session.bound.workspace,p_property_id:selected.propertyId,p_action:'context',p_data:{}});d.session.check();
  if(context?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد حساب التقرير.');
  if(!snapshot)context.reportDetails=checkDetailsScope(await read('aqari_maintenance_report_details',{p_workspace_id:d.session.bound.workspace,p_property_id:selected.propertyId,p_action:'context',p_data:{}}),d.session,selected.propertyId);d.session.check();
  const result=buildMonthlyMaintenanceReport(data,context,{...selected,workspaceId:d.session.bound.workspace,today:new Date((snapshot?Date.parse(snapshot.issuedAt):Date.now())+10800000).toISOString().slice(0,10)});
  output.append(node('h2',`${result.property.name} — ${result.month}`));
  const s=result.summary;
  output.append(node('p',message('تم: {done} · لم يتم: {open} · غير موثّق: {missing} · متأخر: {late}',{done:s.done,open:s.not_done,missing:s.undocumented,late:s.overdue})),
   node('p',message('التكاليف المسجلة: {cost} د.ك · تكاليف غير متاحة: {unknown} · مهام ملغاة: {cancelled}',{cost:s.total_cost,unknown:s.unknown_cost,cancelled:s.cancelled})),
   node('p',message('عاجل: {urgent} · فواتير ناقصة: {invoices} · عقود صيانة ناقصة: {contracts} · متأخرات من أشهر سابقة: {prior}',{urgent:s.urgent,invoices:s.missing_invoice,contracts:s.missing_contract,prior:s.prior_overdue})),
   node('p',t('التكاليف هي المسجلة لمهام شهر الاستحقاق، وتشمل الملغى؛ ليست مجموع المدفوعات. مستند الإغلاق لا يُفترض أنه فاتورة.')),
   node('p',snapshot?t('نسخة يوم 25 المحفوظة بتاريخ: ')+snapshot.issuedAt:t('عرض حي للبيانات الحالية؛ التقرير الصادر يوم 25 محفوظ مستقلًا.')));
  if(!snapshot&&context.reportDetails.canVerify)await mountMonthlySchedule(d,output,{propertyId:selected.propertyId,month:selected.month,onSnapshot:load}).initialize();
  const coverage=node('section');coverage.append(node('h3',t('تغطية بنود الفحص')));for(const item of result.coverage)coverage.append(node('p',t(inspectionKinds[item.kind])+' — '+t(!item.hasTask?'غير موثّق: لا توجد مهمة محفوظة':item.documented?'تم وفق الأدلة المحفوظة':'يحتاج استكمال أو توثيق')));output.append(coverage);
  if(!result.rows.length)output.append(node('p',t('لا توجد مهام محفوظة لهذا العقار في شهر الاستحقاق المحدد. عدم وجود مهام لا يثبت إجراء الفحص.')));
  for(const row of result.rows){
   const card=node('article');card.append(node('h3',`${row.number||'—'} · ${stateLabel[row.state]}`),node('p',row.description||'—'),
    node('p',message('الاستحقاق: {due} · الشركة: {vendor} · التكلفة: {cost}',{due:row.dueOn,vendor:row.vendor||t('غير متاح'),cost:row.cost===null?t('غير متاح'):row.cost+' '+t('د.ك')})),
    node('p',message('اعتماد الإغلاق: {date} · مستند الإغلاق: {document}',{date:row.completedAt||t('غير متاح'),document:row.completionDocument?.number||row.completionDocument?.title||t('غير متاح')})));
   const v=row.details||{};
   for(const [label,value] of [['اسم الفني',v.technician_name],['تاريخ الفحص',v.inspected_on],['رقم الفاتورة',row.invoice?v.invoice_number:null],['نتيجة الإصلاح',v.result_details],['اعتماد النتيجة',v.verified_at],['المسؤول',v.responsible_name||v.responsible_user_id],['موعد الإقفال المخطط',v.planned_close_on],['عقد الصيانة',row.contract?.contract_no]])card.append(node('p',t(label)+': '+(value||t('غير موثّق'))));
   if(v.urgent)card.append(node('p',t('عاجل')));
   documentButton('فتح مرفق الفاتورة',row.invoice,card);documentButton('فتح دليل الإغلاق',row.document,card);
   for(const proof of row.evidence)documentButton(proof.stage==='before'?'فتح صورة قبل التنفيذ':'فتح صورة بعد التنفيذ',proof.document,card);
   if(!snapshot&&context.reportDetails.canWrite){const edit=node('button',t('إدخال تفاصيل الفحص أو تحديثها'));edit.type='button';edit.onclick=()=>d.run(async()=>{const fresh=checkDetailsScope(await read('aqari_maintenance_report_details',{p_workspace_id:d.session.bound.workspace,p_property_id:selected.propertyId,p_action:'context',p_data:{}}),d.session,selected.propertyId);d.session.check();mountMonthlyDetails(d,{task:row.task,context:fresh,onSaved:()=>load()});});card.append(edit);}
   if(row.cancelled)card.append(node('p',t('المهمة ملغاة؛ لا تُحتسب منجزة.')));
   for(const missing of row.missing)card.append(node('p',t(missing)));
   output.append(card);
  }
  d.status.textContent=t('تم استرجاع التقرير من السجلات المحفوظة.');return result;
 }
 form.onsubmit=e=>{e.preventDefault();return d.run(()=>load());};
 d.onDispose(()=>{output.replaceChildren();property.replaceChildren();month.value='';});
 return {async initialize(){const data=await list();d.session.check();if(!Array.isArray(data?.properties))throw Error('تعذر استرجاع العقارات.');property.replaceChildren();for(const p of data.properties){const option=node('option',p.name);option.value=p.id;property.append(option);}if(!data.properties.length)d.status.textContent=t('لا توجد عقارات متاحة لهذا الحساب.');},load};
}

export function openMonthlyMaintenanceReport(){const d=createDialog(t('التقرير الشهري للصيانة حسب العقار'));if(d)d.run(()=>mountMonthlyMaintenanceReport(d).initialize());}
