import {t as visibleText} from '../components/locale.js';
import {mountAvailableUnitMeterReadings} from '../components/unit-meter-readings.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {t,message} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createPaymentProof} from '../components/payment-proof.js';
const labels={get unknown(){return visibleText('غير مؤكد');},get unpaid(){return visibleText('غير مسدد');},get partial(){return visibleText('مسدد جزئياً');},get paid(){return visibleText('مسدد');}};
export function openUtilityMeters(){
 const d=createDialog(t('الإعدادات والخدمات — عدادات العقارات'),{localized:true});if(!d)return;
 const view=mountUtilityMeters(d);d.run(view.init);
}
export function mountUtilityMeters(d){
 d.body.append(node('p',t('تسجيل داخلي من المستندات فقط. لا يوجد اتصال بوزارة الكهرباء والماء أو دفع إلكتروني.')));
 const urls=createPrivateUrls(d);
 const property=node('select'),meter=node('select'),reload=node('button',t('تحديث العدادات والفواتير')),details=node('div'),history=node('div'),form=node('form');let meters=[],properties=[];const saveProof=createPaymentProof(d.session);const payButton=node('button',t('دفع الفاتورة — بانتظار الربط الرسمي'));payButton.disabled=true;payButton.type='button';d.body.append(payButton);let requestId=crypto.randomUUID();
 const type=node('select');for(const [v,labelText]of [['reading',t('قراءة عداد')],['bill',t('فاتورة')]]){const o=node('option',t(labelText));o.value=v;type.append(o);}
 const reading=node('input'),unit=node('input'),date=node('input'),invoice=node('input'),period=node('input'),dueDate=node('input'),due=node('input'),paid=node('input'),state=node('select'),source=node('input'),notes=node('textarea'),save=node('button',t('حفظ والتحقق من السجل'));save.type='submit';source.required=true;source.maxLength=500;notes.maxLength=2000;reading.maxLength=100;invoice.maxLength=120;
 date.type=dueDate.type='date';period.type='month';due.inputMode=paid.inputMode='decimal';
 for(const [v,labelText]of Object.entries(labels)){const o=node('option',t(labelText));o.value=v;state.append(o);}
 const proof=node('input'),paymentDate=node('input'),paymentMethod=node('select');proof.type='file';proof.accept='image/jpeg,image/png,image/webp,application/pdf';paymentDate.type='date';for(const [v,labelText]of [['',t('اختر طريقة الدفع')],['cash',t('نقداً')],['knet',t('كي نت')],['bank',t('تحويل بنكي')],['cheque',t('شيك')]]){const o=node('option',t(labelText));o.value=v;paymentMethod.append(o);}
 const billing=node('div');billing.append(field(t('رقم الفاتورة'),invoice),field(t('شهر الفاتورة'),period),field(t('تاريخ الاستحقاق'),dueDate),field(t('المبلغ المستحق — د.ك'),due),field(t('المبلغ المسدد — د.ك'),paid),field(t('حالة السداد'),state),field(t('تاريخ الدفع المثبت'),paymentDate),field(t('طريقة الدفع'),paymentMethod),field(t('إثبات الدفع — صورة أو PDF'),proof));
 form.append(field(t('نوع السجل'),type),field(t('القراءة كما في المستند'),reading),field(t('وحدة القراءة كما في المستند'),unit),field(t('تاريخ القراءة المؤكد'),date),billing,field(t('مرجع الصورة أو الفاتورة'),source),field(t('ملاحظات'),notes),save);
 function mode(){billing.hidden=type.value!=='bill';invoice.required=period.required=due.required=type.value==='bill';reading.required=type.value==='reading';}type.onchange=mode;mode();
 const pager=node('nav'),previous=node('button',t('السجلات الأحدث')),next=node('button',t('السجلات الأقدم')),pageLabel=node('p');
 pager.setAttribute('aria-label',t('تصفح سجل القراءات والفواتير'));pageLabel.setAttribute('aria-live','polite');previous.type=next.type='button';pager.append(previous,pageLabel,next);pager.hidden=true;
 let page=0,hasMore=false,revision=0;const pageSize=50;
 function clearHistory(){revision++;urls.clear();details.replaceChildren();history.replaceChildren();pager.hidden=true;hasMore=false;}
 d.onDispose(clearHistory);
 // Stable ordering also makes entries with the same import timestamp reachable.
 const entries=m=>d.session.client.from('aqari_utility_entries').select('*').eq('workspace_id',d.session.bound.workspace).eq('property_id',m.property_id).eq('meter_id',m.id);
 async function allRows(query){const result=[];for(let offset=0;;offset+=200){const rows=await d.session.request(query().range(offset,offset+199));if(!Array.isArray(rows))throw Error('تعذر تأكيد اكتمال السجلات. أعد التحديث.');result.push(...rows);if(rows.length<200)return result;}}
 previous.onclick=()=>d.run(()=>show(Math.max(0,page-1)));next.onclick=()=>d.run(()=>hasMore?show(page+1):undefined);
 d.body.append(field(t('العقار'),property),field(t('العداد'),meter),reload,details,node('h3',t('إضافة قراءة أو فاتورة موثقة')),form,node('h3',t('سجل القراءات والفواتير')),history,pager);
 async function show(targetPage=0){
  clearHistory();const currentRevision=revision;
  const m=meters.find(x=>x.id===meter.value&&x.property_id===property.value);if(!m){d.status.textContent=t('لا توجد عدادات مؤكدة لهذا العقار. الهيكل جاهز؛ لن تُضاف أرقام أو قراءات افتراضية.');return;}
  const rows=await d.session.request(entries(m).order('recorded_at',{ascending:false}).order('id',{ascending:false}).range(targetPage*pageSize,targetPage*pageSize+pageSize));
  // The latest observed reading can be outside the current history page, or
  // have been entered long before a more recent import of an old document.
  const dated=await d.session.request(entries(m).not('observed_on','is',null).not('reading_raw','is',null).neq('reading_raw','').order('observed_on',{ascending:false}).order('recorded_at',{ascending:false}).order('id',{ascending:false}).limit(1));
  if(!Array.isArray(rows)||!Array.isArray(dated))throw Error('تعذر تأكيد اكتمال السجلات. أعد التحديث.');
  if(d.closed||revision!==currentRevision||meter.value!==m.id||property.value!==m.property_id)return;
  page=targetPage;hasMore=rows.length>pageSize;
  details.append(node('p',message('رقم العداد: {serial} • حساب الوزارة: {account} • الوحدة: {unit}',{serial:m.serial_no||t('معلق — غير مؤكد'),account:m.account_no||t('غير مدون'),unit:m.unit_no||t('معلقة للمراجعة')})),node('p',m.notes));
  details.append(node('p',dated.length?message('آخر قراءة مؤرخة: {reading} {unit} — {date}',{reading:dated[0].reading_raw,unit:dated[0].reading_unit||'',date:dated[0].observed_on}):t('آخر قراءة زمنياً: معلّقة لعدم وجود تاريخ مثبت؛ القراءات الأصلية موضحة في السجل.')));
  if(!rows.length)history.append(node('p',t(page?'لا توجد سجلات في هذه الصفحة. ارجع للسجلات الأحدث أو حدّث السجل.':'لا توجد قراءات أو فواتير محفوظة.')));
  for(const r of rows.slice(0,pageSize)){const card=node('article');card.append(node('h4',r.entry_type==='bill'?message('فاتورة {invoice}',{invoice:r.invoice_no}):t('قراءة موثقة من المصدر')),node('p',message('القراءة: {reading} {unit} • تاريخها: {date}',{reading:r.reading_raw??t('غير مدونة'),unit:r.reading_unit||'',date:r.observed_on||t('غير مثبت')})),node('p',message('المستحق: {due} • المسدد: {paid} د.ك • {status}',{due:r.amount_due??t('غير مثبت'),paid:r.amount_paid??t('غير مثبت'),status:t(labels[r.payment_status]||'غير مؤكد')})),node('p',message('الفترة: {period} • الاستحقاق: {date}',{period:r.bill_period||t('غير مدونة'),date:r.due_on||t('غير مدون')})),node('p',t('المصدر: ')+r.source_ref),node('p',r.notes),node('p',message('حُفظ في {date} • {author}',{date:r.recorded_at,author:r.recorded_by?message('بواسطة المستخدم {user}',{user:r.recorded_by}):t('استيراد المصدر المعتمد')})));if(r.payment_document_id){card.append(node('p',message('تاريخ الدفع: {date} • الطريقة: {method}',{date:r.payment_date,method:({cash:t('نقداً'),knet:t('كي نت'),bank:t('تحويل بنكي'),cheque:t('شيك')}[r.payment_method]||'')})));const open=node('button',t('عرض وتحميل إثبات الدفع'));open.onclick=()=>d.run(async()=>{const doc=await d.session.request(d.session.client.from('aqari_documents').select('storage_path,mime_type,document_no').eq('workspace_id',d.session.bound.workspace).eq('id',r.payment_document_id).single());const blob=await d.session.storage('GET',doc.storage_path),url=urls.create(blob),a=node('a',t('فتح إثبات الدفع'));a.href=url;a.target='_blank';a.rel='noopener';const download=node('a',t('تحميل إثبات الدفع'));download.href=url;download.download=doc.document_no+(doc.mime_type==='application/pdf'?'.pdf':'.'+doc.mime_type.split('/')[1]);card.append(a,download);d.status.textContent=t('تم استرجاع المرفق المحفوظ. اضغط فتح أو تحميل.');});card.append(open);}history.append(card);}
  pageLabel.textContent=message('الصفحة {page} • {count} سجل',{page:page+1,count:Math.min(rows.length,pageSize)});previous.hidden=page===0;next.hidden=!hasMore;pager.hidden=false;
  d.status.textContent=t('تم استرجاع العدادات والسجلات من قاعدة البيانات.');
 }
 async function load(){const old=meter.value,propertyId=property.value;clearHistory();meters=[];meter.replaceChildren();meter.value='';const loaded=await allRows(()=>d.session.client.from('aqari_utility_meters').select('*').eq('workspace_id',d.session.bound.workspace).eq('property_id',propertyId||'00000000-0000-0000-0000-000000000000').order('kind').order('id'));if(d.closed||property.value!==propertyId)return;meters=loaded;for(const m of meters){const o=node('option',(m.kind==='water'?t('ماء'):t('كهرباء'))+' — '+(m.serial_no||t('رقم معلق')));o.value=m.id;meter.append(o);}meter.value=meters.some(m=>m.id===old)?old:meters[0]?.id||'';await show();}
 property.onchange=()=>d.run(load);
 reload.onclick=()=>d.run(load);meter.onchange=()=>d.run(()=>show());
 const money=value=>{const s=value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.');if(!s)return null;if(!/^\d{1,12}(\.\d{1,3})?$/.test(s))throw Error('أدخل مبلغاً صحيحاً دون افتراض قيمة مفقودة.');return s;};
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  const m=meters.find(x=>x.id===meter.value&&x.property_id===property.value);if(!m)throw Error('اختر عداداً محفوظاً.');
  const isBill=type.value==='bill';const row={id:requestId,workspace_id:d.session.bound.workspace,property_id:m.property_id,meter_id:m.id,entry_type:type.value,reading_raw:reading.value.trim()||null,reading_unit:unit.value.trim()||null,observed_on:date.value||null,source_ref:source.value.trim(),notes:notes.value.trim(),recorded_by:d.session.bound.user,invoice_no:isBill?invoice.value.trim():null,bill_period:isBill?period.value+'-01':null,due_on:isBill?dueDate.value||null:null,amount_due:isBill?money(due.value):null,amount_paid:isBill?money(paid.value):null,payment_status:isBill?state.value:'unknown'};
  if(!row.source_ref||(!isBill&&!row.reading_raw))throw Error('أكمل القراءة ومرجع المستند.');
  if(isBill&&(row.amount_due===null||!row.invoice_no||!period.value))throw Error('أكمل رقم الفاتورة وفترتها والمبلغ المثبت.');
  if(row.payment_status!=='unknown'&&(row.amount_paid===null||row.amount_due===null))throw Error('حالة السداد تحتاج مبلغاً مستحقاً ومسددًا مثبتين.');
  if(isBill&&(Number(row.amount_paid)>0||proof.files?.length)){if(!proof.files?.[0]||!paymentDate.value||!paymentMethod.value||!(Number(row.amount_paid)>0))throw Error('لإثبات السداد، أرفق المستند وأدخل المبلغ المسدد والتاريخ والطريقة.');const prop=properties.find(p=>p.id===m.property_id);if(!prop)throw Error('العقار غير محفوظ.');row.payment_document_id=await saveProof(proof.files[0],{propertyRef:prop.external_ref,invoice:row.invoice_no,entryId:requestId,meterId:m.id});row.payment_date=paymentDate.value;row.payment_method=paymentMethod.value;}
  const old=await d.session.request(d.session.client.from('aqari_utility_entries').select('id').eq('workspace_id',row.workspace_id).eq('id',requestId));
  if(!old.length)await d.session.request(d.session.client.from('aqari_utility_entries').insert(row));
  const verified=await d.session.request(d.session.client.from('aqari_utility_entries').select('*').eq('workspace_id',row.workspace_id).eq('id',requestId).single());
  if(Object.entries(row).some(([k,v])=>(['amount_due','amount_paid'].includes(k)&&v!==null?Number(verified[k])!==Number(v):String(verified[k]??'')!==String(v??''))))throw Error('لم تتأكد مطابقة السجل. حدّث السجلات.');
  requestId=crypto.randomUUID();form.reset();mode();await show();d.status.textContent=t('تم حفظ السجل والتحقق منه بإعادة القراءة. الأصل محفوظ دون حذف أو استبدال.');
 });};
 async function init(){await mountAvailableUnitMeterReadings(d);properties=await allRows(()=>d.session.client.from('aqari_properties').select('id,name,external_ref').eq('workspace_id',d.session.bound.workspace).order('name').order('id'));if(d.closed)return;property.replaceChildren();for(const p of properties){const o=node('option',p.name);o.value=p.id;property.append(o);}if(!properties.some(p=>p.name.includes('ضحاوي'))){const o=node('option',t('برج ضحاوي — تجهيز العدادات لاحقاً'));o.value='';property.append(o);}property.value=properties[0]?.id||'';await load();}
 return {init};
}

