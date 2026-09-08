import {createDialog,node,field} from '../components/dialog.js';
export function openPropertyStatements(){
 const d=createDialog('كشوف العقارات المحفوظة');if(!d)return;
 const select=node('select'),month=node('input'),refresh=node('button','عرض الكشف'),pdf=node('button','تحميل PDF / طباعة'),result=node('div');month.type='month';month.value='2026-08';pdf.disabled=true;
 d.body.append(field('العقار',select),field('الشهر',month),refresh,pdf,result);
 let selected;const urls=new Set();
 d.el.addEventListener('close',()=>{for(const u of urls)URL.revokeObjectURL(u);},{once:true});
 function show(content){
  result.replaceChildren();result.append(node('h3',content.property_name+' — '+content.period),node('p','كشف المصدر المحفوظ. مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.'));
  const s=content.summary.printed_totals;result.append(node('p',`الإيجار الحالي: ${s.rent_kd} د.ك • العربون: ${s.advance_kd} د.ك • النظافة: ${s.cleaning_kd} د.ك`),node('p','معلق: فرق التأمين؛ تواريخ عقدي 402 و403؛ تاريخ دفع 703.'));
  for(const row of content.rows){
   const card=node('details'),head=node('summary',`الوحدة ${row.unit} — ${row.name_en_raw||'الاسم غير مكتمل بالمصدر'} — ${row.current_rent_kd} د.ك`);card.append(head);
   for(const [title,key]of [['رقم العقد','contract_no_raw'],['بداية العقد','contract_start_raw'],['نهاية العقد','contract_end_raw'],['إيجار العقد','contract_rent_kd'],['الإيجار الحالي','current_rent_kd'],['العربون','advance_kd'],['التأمين (معلق)','insurance_kd'],['طريقة السداد','payment_method_raw'],['تاريخ الدفع','payment_date_raw'],['رقم العملية','payment_operation_raw'],['رقم الوصل بالمصدر','receipt_no_raw'],['المحاسب','accountant_raw'],['الهاتف بالمصدر','phone_raw'],['المدني بالمصدر','civil_id_raw']]){
    let v=row[key]??'غير مدون';if((key.includes('contract_')&&key.endsWith('_raw')&&key!=='contract_no_raw'&&row.pending.includes('contract_dates'))||(key==='payment_date_raw'&&row.pending.includes('payment_date')))v+=' — معلق';card.append(node('p',title+': '+v));
   }result.append(card);
  }
 }
 async function load(){pdf.disabled=true;selected=null;result.replaceChildren();const rows=await d.session.request(d.session.client.from('aqari_property_statements').select('workspace_id,property_id,period,content').eq('workspace_id',d.session.bound.workspace).eq('property_id',select.value).eq('period',month.value+'-01'));
  if(rows.length!==1){d.status.textContent='لا يوجد كشف محفوظ لهذا الشهر.';return;}selected=rows[0];show(selected.content);pdf.disabled=false;d.status.textContent='تم استرجاع الكشف المحفوظ من قاعدة البيانات.';
 }
 refresh.onclick=()=>d.run(load).then(()=>{pdf.disabled=!selected;});
 select.onchange=month.onchange=()=>{selected=null;pdf.disabled=true;result.replaceChildren();};
 pdf.onclick=()=>d.run(async()=>{
  if(!selected)throw Error('اعرض الكشف أولاً.');const bound=selected,auth=await window.AQARI_SUPABASE.getSession();d.session.check();if(auth?.user?.id!==d.session.bound.user||!auth.access_token)throw Error('تغيرت جلسة الدخول.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);const cancel=()=>controller.abort();d.el.addEventListener('close',cancel,{once:true});
  try{const r=await fetch('/api/property-statement',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspaceId:d.session.bound.workspace,propertyId:bound.property_id,period:bound.period.slice(0,7)}),signal:controller.signal,cache:'no-store',redirect:'error'});d.session.check();if(!r.ok)throw Error('تعذر تصدير الكشف.');const blob=await r.blob();d.session.check();if(!blob.type.includes('application/pdf'))throw Error('تعذر تأكيد ملف PDF.');const u=URL.createObjectURL(blob);urls.add(u);const a=node('a','فتح PDF للطباعة أو المشاركة');a.href=u;a.target='_blank';a.rel='noopener';result.prepend(a);a.click();d.status.textContent='تم إنشاء PDF من السجل المحفوظ.';}finally{clearTimeout(timer);d.el.removeEventListener('close',cancel);}
 });
 d.run(async()=>{const rows=await d.session.request(d.session.client.from('aqari_property_statements').select('property_id,period,content').eq('workspace_id',d.session.bound.workspace).order('period',{ascending:false}).limit(100));const seen=new Set();for(const r of rows)if(!seen.has(r.property_id)){seen.add(r.property_id);const o=node('option',r.content.property_name);o.value=r.property_id;select.append(o);}if(!rows.length){d.status.textContent='لا توجد كشوف محفوظة متاحة.';return;}month.value=rows[0].period.slice(0,7);await load();}).then(()=>{pdf.disabled=!selected;});
}
