import {createDialog,node,field} from '../components/dialog.js';
export async function openLeaseReview(){
 const d=createDialog('اعتماد عقود المصدر');if(!d)return;
 const {session,body,status,run}=d,leases=node('select'),documents=node('select'),detail=node('div'),deposit=node('input'),note=node('textarea'),check=node('input'),save=node('button','اعتماد العقد'),refresh=node('button','تحديث العقود والمستندات');
 deposit.type='number';deposit.min='0';deposit.step='0.001';note.maxLength=2000;check.type='checkbox';let rows=[],selected=null,revision=null;
 body.append(node('p','راجع العقد الموقّع المحفوظ وطابق الاسم والإيجار والتواريخ والتأمين. الاعتماد لا ينشئ تحصيلاً. البنود المعلقة لا تُصحح تلقائياً. ارفع العقد أولاً من مسح المستندات واربطه بالعقد الصحيح.'),field('العقد المحفوظ',leases),refresh,detail,field('العقد الموقّع المحفوظ',documents),field('التأمين المثبت بالعقد — لا قيمة افتراضية',deposit),field('مرجع المطابقة وسبب الاعتماد',note),field('راجعت المستند وطابقت جميع البيانات والتوقيعات',check),save);
 async function loadSelection(){
  selected=rows.find(x=>x.id===leases.value);detail.replaceChildren();documents.replaceChildren();check.checked=false;note.value='';deposit.value='';save.hidden=true;
  if(!selected)return;
  detail.append(node('p',`العقار: ${selected.snapshot.property} • الوحدة: ${selected.snapshot.unit} • المستأجر: ${selected.snapshot.tenant||'الاسم معلق'}`),node('p',`من ${selected.start_date||'معلق'} إلى ${selected.end_date||'معلق'} • إيجار العقد ${selected.monthly_rent} • الحالة ${selected.status}`));
  const docs=await session.request(session.client.from('aqari_documents').select('id,title,document_no,status').eq('workspace_id',session.bound.workspace).eq('entity_type','lease').eq('entity_ref',selected.external_ref).eq('document_type','signed_contract').eq('status','uploaded').order('created_at',{ascending:false}));
  const placeholder=node('option','اختر المستند الذي راجعته');placeholder.value='';documents.append(placeholder);for(const doc of docs){const o=node('option',doc.document_no+' — '+doc.title);o.value=doc.id;documents.append(o);}
  if(selected.status==='approved')deposit.value=String(selected.deposit);
  deposit.readOnly=selected.status==='approved';save.textContent=selected.status==='approved'?'تأكيد التوقيع وتفعيل العقد':'اعتماد العقد';
  const blocked=!selected.snapshot.tenant?.trim()||!selected.start_date||!selected.end_date||selected.snapshot.pending?.length||!['draft','approved'].includes(selected.status);
  save.hidden=!!blocked||!docs.length;status.textContent=blocked?'العقد معلق أو ليس في مرحلة اعتماد. لا تغيير تلقائي.':!docs.length?'لا يوجد عقد موقّع محفوظ لهذا السجل. ارفعه أولاً.':'راجع المستند قبل تنفيذ المرحلة التالية.';
 }
 async function load(){
  rows=[];for(let offset=0;;offset+=250){const page=await session.request(session.client.from('aqari_leases').select('id,external_ref,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot').eq('workspace_id',session.bound.workspace).not('import_source','is',null).order('id').range(offset,offset+249));rows.push(...page);if(page.length<250)break;if(rows.length>=10000)throw Error('تعذر تحميل جميع العقود.');}
  const state=await session.request(session.client.rpc('aqari_read_state_v267',{p_workspace_id:session.bound.workspace}));revision=state.revision;const previous=leases.value;leases.replaceChildren();for(const row of rows){const o=node('option',`الوحدة ${row.snapshot.unit} — العقد ${row.contract_no} — ${row.snapshot.tenant||'اسم معلق'}`);o.value=row.id;leases.append(o);}if(rows.some(x=>x.id===previous))leases.value=previous;await loadSelection();
 }
 leases.onchange=()=>run(loadSelection);refresh.onclick=()=>run(load);
 save.onclick=()=>run(async()=>{
  if(!selected||!documents.value||!check.checked||!deposit.value||note.value.trim().length<10)throw Error('حدد المستند والتأمين ومرجع المطابقة وأكد المراجعة.');
  const action=selected.status==='approved'?'sign':'approve',id=selected.id;
  const result=await session.request(session.client.rpc('aqari_review_source_lease',{p_workspace_id:session.bound.workspace,p_lease_id:id,p_document_id:documents.value,p_action:action,p_deposit:deposit.value,p_note:note.value.trim(),p_expected_revision:revision}));
  const verified=await session.request(session.client.from('aqari_leases').select('id,status,snapshot').eq('workspace_id',session.bound.workspace).eq('id',id).single());
  if(verified.status!==result.status||verified.snapshot.operationalReview?.id!==result.review_id)throw Error('لم تتأكد إعادة قراءة الاعتماد. حدّث السجلات قبل أي إعادة محاولة.');
  await load();status.textContent='حُفظت المرحلة وأعيدت قراءتها من القاعدة مع سجل التدقيق. حدّث الصفحة الرئيسية قبل التحصيل لتقرأ العقد المحدّث. لم تُنشأ دفعة أو وصل.';
 });
 await run(load);
}
