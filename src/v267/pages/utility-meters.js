import {createDialog,node,field} from '../components/dialog.js';
const labels={unknown:'غير مؤكد',unpaid:'غير مسدد',partial:'مسدد جزئياً',paid:'مسدد'};
export function openUtilityMeters(){
 const d=createDialog('الإعدادات والخدمات — عدادات برج شيخة');if(!d)return;
 d.body.append(node('p','تسجيل داخلي من المستندات فقط. لا يوجد اتصال بوزارة الكهرباء والماء أو دفع إلكتروني.'));
 const meter=node('select'),reload=node('button','تحديث العدادات والفواتير'),details=node('div'),history=node('div'),form=node('form');let meters=[];let requestId=crypto.randomUUID();
 const type=node('select');for(const [v,t]of [['reading','قراءة عداد'],['bill','فاتورة']]){const o=node('option',t);o.value=v;type.append(o);}
 const reading=node('input'),unit=node('input'),date=node('input'),invoice=node('input'),period=node('input'),dueDate=node('input'),due=node('input'),paid=node('input'),state=node('select'),source=node('input'),notes=node('textarea'),save=node('button','حفظ والتحقق من السجل');save.type='submit';source.required=true;source.maxLength=500;notes.maxLength=2000;reading.maxLength=100;invoice.maxLength=120;
 date.type=dueDate.type='date';period.type='month';due.inputMode=paid.inputMode='decimal';
 for(const [v,t]of Object.entries(labels)){const o=node('option',t);o.value=v;state.append(o);}
 const billing=node('div');billing.append(field('رقم الفاتورة',invoice),field('شهر الفاتورة',period),field('تاريخ الاستحقاق',dueDate),field('المبلغ المستحق — د.ك',due),field('المبلغ المسدد — د.ك',paid),field('حالة السداد',state));
 form.append(field('نوع السجل',type),field('القراءة كما في المستند',reading),field('وحدة القراءة كما في المستند',unit),field('تاريخ القراءة المؤكد',date),billing,field('مرجع الصورة أو الفاتورة',source),field('ملاحظات',notes),save);
 function mode(){billing.hidden=type.value!=='bill';invoice.required=period.required=due.required=type.value==='bill';reading.required=type.value==='reading';}type.onchange=mode;mode();
 d.body.append(field('العداد',meter),reload,details,node('h3','إضافة قراءة أو فاتورة موثقة'),form,node('h3','سجل القراءات والفواتير'),history);
 async function show(){
  const m=meters.find(x=>x.id===meter.value);details.replaceChildren();history.replaceChildren();if(!m){d.status.textContent='لا توجد عدادات متاحة لصلاحيتك.';return;}
  details.append(node('p',`رقم العداد: ${m.serial_no||'معلق — غير مؤكد'} • حساب الوزارة: ${m.account_no||'غير مدون'} • الوحدة: ${m.unit_no||'معلقة للمراجعة'}`),node('p',m.notes));
  const rows=await d.session.request(d.session.client.from('aqari_utility_entries').select('*').eq('workspace_id',d.session.bound.workspace).eq('property_id',m.property_id).eq('meter_id',m.id).order('recorded_at',{ascending:false}).limit(100));
  if(!rows.length)history.append(node('p','لا توجد قراءات أو فواتير محفوظة.'));
  for(const r of rows){const card=node('article');card.append(node('h4',r.entry_type==='bill'?'فاتورة '+r.invoice_no:'قراءة موثقة من المصدر'),node('p',`القراءة: ${r.reading_raw??'غير مدونة'} ${r.reading_unit||''} • تاريخها: ${r.observed_on||'غير مثبت'}`),node('p',`المستحق: ${r.amount_due??'غير مثبت'} • المسدد: ${r.amount_paid??'غير مثبت'} د.ك • ${labels[r.payment_status]}`),node('p',`الفترة: ${r.bill_period||'غير مدونة'} • الاستحقاق: ${r.due_on||'غير مدون'}`),node('p','المصدر: '+r.source_ref),node('p',r.notes),node('p','حُفظ في '+r.recorded_at+' • '+(r.recorded_by?'بواسطة المستخدم '+r.recorded_by:'استيراد المصدر المعتمد')));history.append(card);}
  d.status.textContent='تم استرجاع العدادات والسجلات من قاعدة البيانات.';
 }
 async function load(){const old=meter.value;meters=await d.session.request(d.session.client.from('aqari_utility_meters').select('*').eq('workspace_id',d.session.bound.workspace).eq('property_id','255631ad-3993-0bbe-ddab-64ecf24cf8ef').order('kind').limit(100));meter.replaceChildren();for(const m of meters){const o=node('option',(m.kind==='water'?'ماء':'كهرباء')+' — '+(m.serial_no||'رقم معلق'));o.value=m.id;meter.append(o);}if(meters.some(m=>m.id===old))meter.value=old;await show();}
 reload.onclick=()=>d.run(load);meter.onchange=()=>d.run(show);
 const money=value=>{const s=value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.');if(!s)return null;if(!/^\d{1,12}(\.\d{1,3})?$/.test(s))throw Error('أدخل مبلغاً صحيحاً دون افتراض قيمة مفقودة.');return s;};
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  const m=meters.find(x=>x.id===meter.value);if(!m)throw Error('اختر عداداً محفوظاً.');
  const isBill=type.value==='bill';const row={id:requestId,workspace_id:d.session.bound.workspace,property_id:m.property_id,meter_id:m.id,entry_type:type.value,reading_raw:reading.value.trim()||null,reading_unit:unit.value.trim()||null,observed_on:date.value||null,source_ref:source.value.trim(),notes:notes.value.trim(),recorded_by:d.session.bound.user,invoice_no:isBill?invoice.value.trim():null,bill_period:isBill?period.value+'-01':null,due_on:isBill?dueDate.value||null:null,amount_due:isBill?money(due.value):null,amount_paid:isBill?money(paid.value):null,payment_status:isBill?state.value:'unknown'};
  if(!row.source_ref||(!isBill&&!row.reading_raw))throw Error('أكمل القراءة ومرجع المستند.');
  if(isBill&&(row.amount_due===null||!row.invoice_no||!period.value))throw Error('أكمل رقم الفاتورة وفترتها والمبلغ المثبت.');
  if(row.payment_status!=='unknown'&&(row.amount_paid===null||row.amount_due===null))throw Error('حالة السداد تحتاج مبلغاً مستحقاً ومسددًا مثبتين.');
  const old=await d.session.request(d.session.client.from('aqari_utility_entries').select('id').eq('workspace_id',row.workspace_id).eq('id',requestId));
  if(!old.length)await d.session.request(d.session.client.from('aqari_utility_entries').insert(row));
  const verified=await d.session.request(d.session.client.from('aqari_utility_entries').select('*').eq('workspace_id',row.workspace_id).eq('id',requestId).single());
  if(Object.entries(row).some(([k,v])=>(['amount_due','amount_paid'].includes(k)&&v!==null?Number(verified[k])!==Number(v):String(verified[k]??'')!==String(v??''))))throw Error('لم تتأكد مطابقة السجل. حدّث السجلات.');
  requestId=crypto.randomUUID();form.reset();mode();await show();d.status.textContent='تم حفظ السجل والتحقق منه بإعادة القراءة. الأصل محفوظ دون حذف أو استبدال.';
 });};
 d.run(load);
}
