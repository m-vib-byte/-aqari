import {t,message} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
export function openPropertyStatements(){
 const d=createDialog(t('كشوف العقارات المحفوظة'),{localized:true});if(!d)return;
 const select=node('select'),month=node('input'),refresh=node('button',t('عرض الكشف')),pdf=node('button',t('تحميل PDF / طباعة')),link=node('button',t('ربط الكشف بملفات المستأجرين والعقود')),result=node('div');month.type='month';month.value='2026-08';pdf.disabled=true;
 d.body.append(field(t('العقار'),select),field(t('الشهر'),month),refresh,pdf,link,result);
 let selected;let links=[];const urls=new Set();
 d.el.addEventListener('close',()=>{for(const u of urls)URL.revokeObjectURL(u);},{once:true});
 function show(content){
  result.replaceChildren();result.append(node('h3',content.property_name+' — '+content.period),node('p',t('كشف المصدر المحفوظ. مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.')));
  const s=content.summary.printed_totals;result.append(node('p',message('الإيجار الحالي: {rent} د.ك • العربون: {advance} د.ك • النظافة: {cleaning} د.ك',{rent:s.rent_kd,advance:s.advance_kd,cleaning:s.cleaning_kd})),node('p',t('معلق: فرق التأمين؛ تواريخ عقدي 402 و403؛ تاريخ دفع 703.')));
  for(const row of content.rows){
   const card=node('details'),head=node('summary',message('الوحدة {unit} — {tenant} — {rent} د.ك',{unit:row.unit,tenant:row.name_en_raw||t('الاسم غير مكتمل بالمصدر'),rent:row.current_rent_kd}));card.append(head);const savedLink=links.find(x=>x.unit_no===row.unit);card.append(node('p',savedLink?t('مرتبط بملف مستأجر وعقد محفوظ — لم يُرحّل كتحصيل'):t('لم يُربط بالملفات التشغيلية بعد')));
   for(const [title,key]of [[t('رقم العقد'),'contract_no_raw'],[t('بداية العقد'),'contract_start_raw'],[t('نهاية العقد'),'contract_end_raw'],[t('إيجار العقد'),'contract_rent_kd'],[t('الإيجار الحالي'),'current_rent_kd'],[t('العربون'),'advance_kd'],[t('التأمين (معلق)'),'insurance_kd'],[t('طريقة السداد'),'payment_method_raw'],[t('تاريخ الدفع'),'payment_date_raw'],[t('رقم العملية'),'payment_operation_raw'],[t('رقم الوصل بالمصدر'),'receipt_no_raw'],[t('المحاسب'),'accountant_raw'],[t('الهاتف بالمصدر'),'phone_raw'],[t('المدني بالمصدر'),'civil_id_raw']]){
    let v=row[key]??t('غير مدون');if((key.includes('contract_')&&key.endsWith('_raw')&&key!=='contract_no_raw'&&row.pending.includes('contract_dates'))||(key==='payment_date_raw'&&row.pending.includes('payment_date')))v+=t(' — معلق');card.append(node('p',title+': '+v));
   }result.append(card);
  }
 }
 async function load(){pdf.disabled=true;selected=null;result.replaceChildren();const rows=await d.session.request(d.session.client.from('aqari_property_statements').select('workspace_id,property_id,period,source_sha256,content').eq('workspace_id',d.session.bound.workspace).eq('property_id',select.value).eq('period',month.value+'-01'));
  if(rows.length!==1){d.status.textContent=t('لا يوجد كشف محفوظ لهذا الشهر.');return;}selected=rows[0];links=await d.session.request(d.session.client.from('aqari_statement_links').select('unit_no,tenant_id,lease_id').eq('workspace_id',d.session.bound.workspace).eq('property_id',selected.property_id).eq('period',selected.period));show(selected.content);result.prepend(node('p',message('الروابط المحفوظة: {linked} من {rows}. العقود المستوردة للمراجعة؛ لا يصدر وصل من دون عقد فعال ومبلغ دفع مثبت.',{linked:links.length,rows:selected.content.rows.length})));pdf.disabled=false;d.status.textContent=t('تم استرجاع الكشف المحفوظ من قاعدة البيانات.');
 }
 link.onclick=()=>d.run(async()=>{if(!selected)throw Error('اعرض الكشف أولاً.');const r=await d.session.request(d.session.client.rpc('aqari_link_property_statement',{p_workspace_id:d.session.bound.workspace,p_property_id:selected.property_id,p_period:selected.period,p_source_sha256:selected.source_sha256}));await load();if(links.length!==r.linked_rows)throw Error('لم تؤكد إعادة القراءة اكتمال الربط.');d.status.textContent=message('تم حفظ واسترجاع {linked} رابطاً؛ ملفات مستأجرين جديدة: {tenants}، عقود جديدة: {leases}. حدّث الصفحة لعرضها في الأقسام.',{linked:r.linked_rows,tenants:r.new_tenants,leases:r.new_leases});});
 refresh.onclick=()=>d.run(load).then(()=>{pdf.disabled=!selected;});
 select.onchange=month.onchange=()=>{selected=null;pdf.disabled=true;result.replaceChildren();};
 pdf.onclick=()=>d.run(async()=>{
  if(!selected)throw Error('اعرض الكشف أولاً.');const bound=selected,auth=await window.AQARI_SUPABASE.getSession();d.session.check();if(auth?.user?.id!==d.session.bound.user||!auth.access_token)throw Error('تغيرت جلسة الدخول.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);const cancel=()=>controller.abort();d.el.addEventListener('close',cancel,{once:true});
  try{const r=await fetch('/api/property-statement',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspaceId:d.session.bound.workspace,propertyId:bound.property_id,period:bound.period.slice(0,7)}),signal:controller.signal,cache:'no-store',redirect:'error'});d.session.check();if(!r.ok)throw Error('تعذر تصدير الكشف.');const blob=await r.blob();d.session.check();if(!blob.type.includes('application/pdf'))throw Error('تعذر تأكيد ملف PDF.');const u=URL.createObjectURL(blob);urls.add(u);const a=node('a',t('فتح PDF للطباعة أو المشاركة'));a.href=u;a.target='_blank';a.rel='noopener';result.prepend(a);a.click();d.status.textContent=t('تم إنشاء PDF من السجل المحفوظ.');}finally{clearTimeout(timer);d.el.removeEventListener('close',cancel);}
 });
 d.run(async()=>{const rows=await d.session.request(d.session.client.from('aqari_property_statements').select('property_id,period,source_sha256,content').eq('workspace_id',d.session.bound.workspace).order('period',{ascending:false}).limit(100));const seen=new Set();for(const r of rows)if(!seen.has(r.property_id)){seen.add(r.property_id);const o=node('option',r.content.property_name);o.value=r.property_id;select.append(o);}if(!rows.length){d.status.textContent=t('لا توجد كشوف محفوظة متاحة.');return;}month.value=rows[0].period.slice(0,7);await load();}).then(()=>{pdf.disabled=!selected;});
}
