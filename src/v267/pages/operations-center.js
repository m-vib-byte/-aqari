import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const chequeStates={scheduled:'مجدول',deposited:'مودع',returned:'مرتجع',redeposited:'أعيد إيداعه',cleared:'محصل',settled:'مسوى',cancelled:'ملغى'};
const workStates={draft:'مسودة',approved:'معتمد',assigned:'مسند',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى'};
const transitions={
 scheduled:['deposited','cancelled'],deposited:['cleared','returned'],returned:['redeposited','settled','cancelled'],redeposited:['cleared','returned'],
 draft:['approved','cancelled'],approved:['assigned','cancelled'],assigned:['in_progress','cancelled'],in_progress:['completed','cancelled']
};
const el=(tag,text='')=>node(tag,String(text));
const option=(value,label)=>{const o=el('option',label);o.value=value;return o;};
const input=(type='text')=>{const x=el('input');x.type=type;return x;};
const selectFrom=(items,label,value='id')=>{const s=el('select');s.append(option('',label));for(const item of items)s.append(option(item[value],item.name||item.contract_no||item[value]));s.required=true;return s;};
const uuid=()=>crypto.randomUUID();
function money(value){const v=String(value??'').trim().replace(/٫/g,'.');if(!/^\d{1,9}(?:\.\d{1,3})?$/.test(v)||Number(v)<=0)throw Error('أدخل مبلغاً موجباً بثلاث منازل عشرية كحد أقصى.');const [a,b='']=v.split('.');return a+'.'+b.padEnd(3,'0');}
function required(value,label,min=1){const v=String(value??'').trim();if(v.length<min)throw Error(label+' مطلوب.');return v;}
function formButton(label){const b=el('button',label);b.type='submit';return b;}
function section(title,description){const box=el('section');box.className='aq267-operations-section';box.append(el('h2',title),el('p',description));return box;}
function statusForm(record,kind,onSubmit){
 const f=el('form'),state=el('select'),reference=input(),reason=input();
 for(const next of transitions[record.state||record.status]||[])state.append(option(next,(kind==='cheque'?chequeStates:workStates)[next]||next));
 reference.maxLength=120;reason.maxLength=500;reason.minLength=3;reason.required=true;
 f.append(field(translateStatic('الحالة الجديدة'),state),field(kind==='cheque'?'مرجع البنك':'مرجع الإجراء',reference),field(translateStatic('سبب موثق'),reason),formButton('حفظ الحالة'));
 f.onsubmit=e=>{e.preventDefault();onSubmit({state:state.value,bank_reference:reference.value.trim(),reason:reason.value.trim()});};return f;
}

export function openOperationsCenter(initial={}){
 const d=createDialog(initial.requestId?'أمر الشغل المرتبط بالبلاغ':'مركز العمليات المتكاملة');if(!d)return;
 let data=null,pending=false,loaded=false;
 const notice=el('p','هذه الشاشة تقرأ السجلات الفعلية فقط. كل كتابة يعقبها استرجاع من قاعدة البيانات للتحقق منها.');
 const refresh=el('button','تحديث جميع السجلات');refresh.type='button';
 const summary=el('section'),cheques=section('الشيكات الآجلة والمرتجعة','تسجيل الشيك ثم توثيق انتقالاته البنكية وإعادة الدين عند الارتجاع.'),vendors=section('الموردون والمقاولون','ملف المورد أساس أوامر الشغل والعقود السنوية.'),orders=section('أوامر الشغل','أمر مرقم، اعتماد، تنفيذ، إنجاز ثم فاتورة مرتبطة بالمصروف.'),legal=section('القضايا والمصاريف القضائية','القضية والجلسات والتكاليف والذمة المرتبطة بالعقد.'),petty=section('العهدة المالية','سقف ورصيد وحركات موثقة؛ الصرف يحتاج فاتورة واعتماداً.');
 if(initial.requestId)d.body.append(notice,refresh,orders);else d.body.append(notice,refresh,summary,cheques,vendors,orders,legal,petty);
 const rpc=(domain,action,payload={})=>d.session.request(d.session.client.rpc('aqari_operations_register',{p_workspace_id:d.session.bound.workspace,p_domain:domain,p_action:action,p_data:payload}));

 async function load(proof=null){
  const [overview,chequeData,vendorData,orderData,legalData,pettyData]=await Promise.all([
   rpc('overview','list'),rpc('cheques','list'),rpc('vendors','list'),rpc('work_orders','list'),rpc('legal_cases','list'),rpc('petty_cash','list')
  ]);
  if(!overview?.health||!Array.isArray(overview.properties)||!Array.isArray(overview.documents)||!Array.isArray(overview.leases)||!Array.isArray(vendorData.items)||!Array.isArray(orderData.items))throw Error('تعذر استرجاع مركز العمليات من قاعدة البيانات.');
  if(initial.requestId&&(!Array.isArray(orderData.requests)||!orderData.requests.some(r=>r.id===initial.requestId)))throw Error('البلاغ غير متاح لإنشاء أمر شغل؛ حدّث حالة الصيانة وتحقق من الصلاحية.');
  data={overview,chequeData,vendorData,orderData,legalData,pettyData};loaded=true;render();
  if(proof&&!proof(data))throw Error('حُفظت العملية لكن نتيجة إعادة القراءة لا تطابق الطلب؛ لا تكررها قبل المراجعة.');
 }
 async function write(domain,action,payload,proof){
  if(pending)throw Error('توجد عملية قيد التحقق. انتظر نتيجة إعادة القراءة.');pending=true;render();
  try{await rpc(domain,action,payload);await load(proof);d.status.textContent=translateStatic('تم الحفظ والتحقق بإعادة القراءة من قاعدة البيانات.');}
  finally{pending=false;if(loaded)render();}
 }
 function runWrite(domain,action,payload,proof){d.run(()=>write(domain,action,payload,proof));}
 function titleFor(id,list,key='name'){return list.find(x=>x.id===id)?.[key]||'غير متاح';}

 function renderSummary(){
  summary.replaceChildren(el('h2','المؤشرات التشغيلية'));
  const h=data.overview.health;
  summary.append(el('p',`شيكات مفتوحة: ${h.open_cheques} • أوامر شغل مفتوحة: ${h.open_work_orders} • قضايا مفتوحة: ${h.open_legal_cases} • عقود موردين فعالة: ${h.active_vendor_contracts}`),
   el('p',`تكاملات معلقة: ${h.pending_integrations} • إشعارات فاشلة: ${h.failed_notifications} • فترات مالية مقفلة: ${h.closed_financial_periods}`));
 }
 function renderCheques(){
  cheques.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),lease=selectFrom(data.overview.leases.map(x=>({...x,name:x.contract_no})),'اختر العقد'),number=input(),bank=input(),kind=el('select'),amount=input(),due=input('date');
  kind.append(option('postdated','شيك آجل'),option('guarantee','شيك ضمان'));number.required=bank.required=amount.required=due.required=true;amount.inputMode='decimal';
  f.append(field(translateStatic('العقد'),lease),field(translateStatic('رقم الشيك'),number),field(translateStatic('البنك'),bank),field(translateStatic('النوع'),kind),field(translateStatic('المبلغ د.ك'),amount),field(translateStatic('تاريخ الاستحقاق'),due),formButton('تسجيل الشيك'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid(),expected=money(amount.value);runWrite('cheques','create',{id,lease_id:lease.value,cheque_no:required(number.value,'رقم الشيك',2),bank_name:required(bank.value,'اسم البنك',2),kind:kind.value,amount:expected,due_on:due.value},x=>x.chequeData.items.some(c=>c.id===id&&Number(c.amount)===Number(expected)));};cheques.append(f);
  for(const c of data.chequeData.items){const card=el('article');card.append(el('h3',`${c.cheque_no} — ${chequeStates[c.state]||c.state}`),el('p',`${c.bank_name} • ${Number(c.amount).toFixed(3)} د.ك • الاستحقاق ${c.due_on}`),el('p',`العقد: ${titleFor(c.lease_id,data.overview.leases,'contract_no')}${c.renewal_frozen?' • التجديد مجمد':''}`));if((transitions[c.state]||[]).length&&!pending)card.append(statusForm(c,'cheque',values=>runWrite('cheques','transition',{id:c.id,event_id:uuid(),revision:c.revision,...values},x=>x.chequeData.items.some(row=>row.id===c.id&&row.revision===c.revision+1&&row.state===values.state))));cheques.append(card);}
 }
 function renderVendors(){
  vendors.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),name=input(),license=input(),phone=input('tel'),email=input('email'),rating=input('number'),basis=input();name.required=true;rating.min='0';rating.max='5';rating.step='0.01';
  f.append(field(translateStatic('اسم المورد أو المقاول'),name),field(translateStatic('رقم الترخيص أو المدني'),license),field(translateStatic('الهاتف'),phone),field(translateStatic('البريد'),email),field(translateStatic('التقييم من 5'),rating),field(translateStatic('أساس التقييم'),basis),formButton('حفظ المورد'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('vendors','save',{id,revision:0,name:required(name.value,'اسم المورد',2),license_no:license.value.trim(),phone:phone.value.trim(),email:email.value.trim(),rating:rating.value||null,rating_basis:basis.value.trim(),status:'active'},x=>x.vendorData.items.some(v=>v.id===id));};vendors.append(f);
  const cf=el('form'),cv=selectFrom(data.vendorData.items.filter(v=>v.status==='active'),'اختر المورد'),cp=selectFrom(data.overview.properties,'اختر العقار'),cn=input(),service=input(),starts=input('date'),ends=input('date'),amount=input(),doc=selectFrom(data.overview.documents,'اختر مستند العقد المحفوظ'),reason=input();
  for(const x of [cn,service,starts,ends,amount,reason])x.required=true;amount.inputMode='decimal';
  cf.append(el('h3','تسجيل عقد صيانة سنوي معتمد'),field(translateStatic('المورد'),cv),field(translateStatic('العقار'),cp),field(translateStatic('رقم العقد'),cn),field(translateStatic('الخدمة'),service),field(translateStatic('البداية'),starts),field(translateStatic('النهاية'),ends),field(translateStatic('القيمة د.ك'),amount),field(translateStatic('مستند العقد المتحقق'),doc),field(translateStatic('سبب الاعتماد'),reason),formButton('اعتماد عقد المورد'));
  cf.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('vendors','contract',{id,vendor_id:cv.value,property_id:cp.value,contract_no:required(cn.value,'رقم العقد',2),service_kind:required(service.value,'نوع الخدمة',2),starts_on:starts.value,ends_on:ends.value,amount:money(amount.value),document_id:doc.value,reason:required(reason.value,'سبب الاعتماد',3)},x=>x.vendorData.contracts.some(c=>c.id===id&&c.status==='active'));};vendors.append(cf);
  for(const v of data.vendorData.items)vendors.append(Object.assign(el('article'),{textContent:`${v.name} • ${v.phone||'دون هاتف'} • التقييم: ${v.rating??'غير مقيم'}`}));
  for(const c of data.vendorData.contracts)vendors.append(Object.assign(el('article'),{textContent:`عقد ${c.contract_no} • ${titleFor(c.vendor_id,data.vendorData.items)} • ${c.service_kind} • ينتهي ${c.ends_on} • ${c.status}`}));
 }
 function renderOrders(){
  orders.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),property=selectFrom(data.overview.properties,'اختر العقار'),request=el('select'),unit=input(),linkNotice=el('p'),vendor=selectFrom(data.vendorData.items.filter(v=>v.status==='active'),'اختر المورد'),number=input(),description=el('textarea'),amount=input(),create=formButton('إنشاء أمر الشغل');number.required=description.required=amount.required=true;description.maxLength=5000;amount.inputMode='decimal';unit.readOnly=true;
  const requests=Array.isArray(data.orderData.requests)?data.orderData.requests:[],linked=()=>requests.find(r=>r.id===request.value);
  function requestChanged(){const r=linked();unit.value=r?.unit_no||'';create.disabled=pending||Boolean(r?.work_order_id);linkNotice.textContent=r?.work_order_id?`هذا البلاغ مرتبط بأمر الشغل ${r.work_order_no} الظاهر أدناه؛ لن يُنشأ أمر مكرر.`:r?'العقار والوحدة محفوظان من البلاغ؛ لا يعاد إدخالهما.':'';if(r&&!r.work_order_id){number.value='WO-'+r.request_no;description.value=r.description;}}
  function propertyChanged(){request.replaceChildren(option('','أمر مستقل أو اختر بلاغ العقار'));for(const r of requests.filter(r=>r.property_id===property.value))request.append(option(r.id,`بلاغ ${r.request_no} • الوحدة ${r.unit_no}${r.work_order_id?' • مرتبط بأمر':''}`));request.value='';requestChanged();}
  property.onchange=propertyChanged;request.onchange=requestChanged;propertyChanged();
  if(initial.requestId){const r=requests.find(r=>r.id===initial.requestId);property.value=r.property_id;propertyChanged();request.value=r.id;property.disabled=request.disabled=true;requestChanged();}
  if(!Array.isArray(data.orderData.requests))linkNotice.textContent=translateStatic('ربط البلاغات غير متاح في هذه النسخة.');
  f.append(field(translateStatic('العقار'),property),field(translateStatic('بلاغ الصيانة المرتبط'),request),field(translateStatic('وحدة البلاغ'),unit),linkNotice,field(translateStatic('المورد'),vendor),field(translateStatic('رقم أمر الشغل'),number),field(translateStatic('وصف الأعمال'),description),field(translateStatic('القيمة المعتمدة د.ك'),amount),create);
  f.onsubmit=e=>{e.preventDefault();return d.run(async()=>{const r=linked();if(r?.work_order_id)throw Error('البلاغ مرتبط بأمر شغل محفوظ؛ افتح الأمر الموجود.');if(r&&r.property_id!==property.value)throw Error('بلاغ الصيانة لا يتبع العقار المحدد.');const id=uuid(),expected=money(amount.value),payload={id,property_id:property.value,vendor_id:vendor.value,order_no:required(number.value,'رقم الأمر',2),description:required(description.value,'وصف العمل',3),approved_amount:expected,maintenance_request_id:r?.id||null,request_revision:r?.revision||null,unit_id:r?.unit_id||null};await write('work_orders','create',payload,x=>x.orderData.items.some(o=>o.id===id&&o.property_id===payload.property_id&&o.vendor_id===payload.vendor_id&&Number(o.approved_amount)===Number(expected)&&(!r||(o.maintenance_request_id===r.id&&o.unit_id===r.unit_id&&o.request_snapshot?.id===r.id&&o.request_snapshot?.revision===r.revision))));});};orders.append(f);
  for(const o of data.orderData.items.filter(o=>!initial.requestId||o.maintenance_request_id===initial.requestId)){const card=el('article');card.append(el('h3',`${o.order_no} — ${workStates[o.status]||o.status}`),el('p',`${titleFor(o.property_id,data.overview.properties)} • ${titleFor(o.vendor_id,data.vendorData.items)} • ${Number(o.approved_amount).toFixed(3)} د.ك`),el('p',o.description));if(o.maintenance_request_id)card.append(el('p',`البلاغ المرتبط: ${o.request_snapshot?.request_no||o.maintenance_request_id} • الوحدة: ${o.request_snapshot?.unit_no||'تحتاج مراجعة الربط السابق'}`));if((transitions[o.status]||[]).length&&!pending)card.append(statusForm(o,'work',values=>runWrite('work_orders','status',{id:o.id,revision:o.revision,state:values.state,reason:values.reason,reference:values.bank_reference},x=>x.orderData.items.some(row=>row.id===o.id&&row.revision===o.revision+1&&row.status===values.state))));
   if(o.status==='completed'&&!o.invoice_id&&!pending){const f=el('form'),invoice=input(),amount=input(),reference=input(),doc=selectFrom(data.overview.documents.filter(x=>x.property_id===o.property_id),'اختر فاتورة العقار المحفوظة'),reason=input();for(const x of [invoice,amount,reference,reason])x.required=true;amount.inputMode='decimal';f.append(el('h4','ربط فاتورة الإنجاز بالمصروف'),field(translateStatic('رقم الفاتورة'),invoice),field(translateStatic('المبلغ'),amount),field(translateStatic('المرجع المالي'),reference),field(translateStatic('مستند الفاتورة المتحقق'),doc),field(translateStatic('سبب الاعتماد'),reason),formButton('اعتماد الفاتورة والمصروف'));f.onsubmit=e=>{e.preventDefault();const expenseId=uuid();runWrite('work_orders','invoice',{id:o.id,revision:o.revision,expense_id:expenseId,invoice_id:required(invoice.value,'رقم الفاتورة',2),amount:money(amount.value),reference:required(reference.value,'المرجع',3),document_id:doc.value,reason:required(reason.value,'سبب الاعتماد',3)},x=>x.orderData.items.some(row=>row.id===o.id&&row.invoice_id===invoice.value.trim()&&row.revision===o.revision+1));};card.append(f);}
   orders.append(card);
  }
 }
 function renderLegal(){
  legal.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),lease=selectFrom(data.overview.leases.map(x=>({...x,name:x.contract_no})),'اختر العقد'),number=input(),court=input(),kind=input(),opened=input('date'),description=el('textarea');number.required=court.required=kind.required=opened.required=true;
  f.append(field(translateStatic('العقد'),lease),field(translateStatic('رقم القضية'),number),field(translateStatic('المحكمة'),court),field(translateStatic('نوع القضية'),kind),field(translateStatic('تاريخ الفتح'),opened),field(translateStatic('ملخص'),description),formButton('فتح سجل القضية'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('legal_cases','create',{id,lease_id:lease.value,case_no:required(number.value,'رقم القضية',2),court:required(court.value,'المحكمة',2),kind:required(kind.value,'نوع القضية',2),opened_on:opened.value,summary:description.value.trim()},x=>x.legalData.items.some(c=>c.id===id));};legal.append(f);
  for(const c of data.legalData.items){const card=el('article');card.append(el('h3',`${c.case_no} • ${c.court} • ${c.kind}`),el('p',`${c.status} • ${c.transactions_frozen?'المعاملات مجمدة':'غير مجمدة'}`));
   const ef=el('form'),ek=el('select'),when=input('datetime-local'),title=input(),details=el('textarea'),edoc=selectFrom(data.overview.documents,'مستند الحدث (اختياري)'),ereason=input();for(const [v,l]of [['hearing','جلسة'],['filing','إيداع'],['judgment','حكم'],['appeal','استئناف'],['note','ملاحظة'],['status_change','تغيير حالة']])ek.append(option(v,l));title.required=ereason.required=true;ef.append(el('h4','جلسة أو إجراء قضائي'),field(translateStatic('النوع'),ek),field(translateStatic('الموعد'),when),field(translateStatic('العنوان'),title),field(translateStatic('التفاصيل'),details),field(translateStatic('المستند'),edoc),field(translateStatic('سبب التسجيل'),ereason),formButton('حفظ الإجراء'));ef.onsubmit=e=>{e.preventDefault();const eventId=uuid();runWrite('legal_cases','event',{id:c.id,event_id:eventId,kind:ek.value,occurs_at:when.value||null,title:required(title.value,'العنوان',2),details:details.value.trim(),document_id:edoc.value||null,reason:required(ereason.value,'سبب التسجيل',3)},x=>x.legalData.events.some(row=>row.id===eventId));};card.append(ef);
   const cf=el('form'),ck=el('select'),amount=input(),date=input('date'),payee=input(),reference=input(),doc=selectFrom(data.overview.documents,'اختر مستند التكلفة المحفوظ'),charge=input('checkbox'),basis=input(),reason=input();for(const [v,l]of [['court_fee','رسوم محكمة'],['lawyer_fee','أتعاب محاماة'],['expert_fee','أتعاب خبير'],['execution_fee','رسوم تنفيذ'],['other','أخرى']])ck.append(option(v,l));for(const x of [amount,date,payee,reference,reason])x.required=true;amount.inputMode='decimal';cf.append(el('h4','مصروف قضائي معتمد'),field(translateStatic('البند'),ck),field(translateStatic('المبلغ'),amount),field(translateStatic('التاريخ'),date),field(translateStatic('الجهة'),payee),field(translateStatic('المرجع'),reference),field(translateStatic('المستند المتحقق'),doc),field(translateStatic('تحميله على المستأجر'),charge),field(translateStatic('السند القانوني عند التحميل'),basis),field(translateStatic('سبب الاعتماد'),reason),formButton('اعتماد المصروف القضائي'));cf.onsubmit=e=>{e.preventDefault();const costId=uuid();runWrite('legal_cases','cost',{id:c.id,cost_id:costId,expense_id:uuid(),kind:ck.value,amount:money(amount.value),occurred_on:date.value,payee:required(payee.value,'الجهة',2),reference:required(reference.value,'المرجع',3),document_id:doc.value,charge_to_tenant:charge.checked,legal_basis:charge.checked?required(basis.value,'السند القانوني',5):basis.value.trim(),reason:required(reason.value,'سبب الاعتماد',3)},x=>x.legalData.costs.some(row=>row.id===costId));};card.append(cf);legal.append(card);
  }
 }
 function renderPetty(){
  petty.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),name=input(),custodian=input(),ceiling=input();name.required=custodian.required=ceiling.required=true;ceiling.inputMode='decimal';
  f.append(field(translateStatic('اسم العهدة'),name),field(translateStatic('معرف أمين العهدة'),custodian),field(translateStatic('السقف د.ك'),ceiling),formButton('فتح عهدة'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('petty_cash','create',{id,name:required(name.value,'اسم العهدة',2),custodian_id:required(custodian.value,'معرف أمين العهدة'),ceiling:money(ceiling.value)},x=>x.pettyData.funds.some(row=>row.id===id));};petty.append(f);
  for(const fund of data.pettyData.funds){const card=el('article');card.append(el('h3',fund.name),el('p',`الرصيد ${Number(fund.balance).toFixed(3)} د.ك من سقف ${Number(fund.ceiling).toFixed(3)} د.ك • ${fund.status}`));if(fund.status==='open'&&!pending){const f=el('form'),kind=el('select'),amount=input(),property=selectFrom(data.overview.properties,'العقار عند الصرف'),doc=selectFrom(data.overview.documents,'فاتورة الصرف المحفوظة'),invoice=input(),category=input(),reference=input(),reason=input();kind.append(option('fund','تمويل'),option('spend','صرف'),option('settle','تسوية'));amount.required=reason.required=true;amount.inputMode='decimal';f.append(field(translateStatic('نوع الحركة'),kind),field(translateStatic('المبلغ'),amount),field(translateStatic('العقار'),property),field(translateStatic('المستند'),doc),field(translateStatic('رقم الفاتورة'),invoice),field(translateStatic('البند'),category),field(translateStatic('المرجع'),reference),field(translateStatic('سبب الحركة'),reason),formButton('حفظ حركة العهدة'));f.onsubmit=e=>{e.preventDefault();const entryId=uuid(),isSpend=kind.value==='spend';runWrite('petty_cash','entry',{id:fund.id,entry_id:entryId,kind:kind.value,amount:money(amount.value),property_id:isSpend?property.value:null,document_id:isSpend?doc.value:null,expense_id:isSpend?uuid():null,invoice_id:isSpend?required(invoice.value,'رقم الفاتورة',2):null,category:isSpend?required(category.value,'البند',2):null,reference:isSpend?required(reference.value,'المرجع',3):null,reason:required(reason.value,'سبب الحركة',3)},x=>x.pettyData.entries.some(row=>row.id===entryId)&&x.pettyData.funds.some(row=>row.id===fund.id&&row.revision===fund.revision+1));};card.append(f);}petty.append(card);}
 }
 function render(){if(!loaded)return;renderSummary();renderCheques();renderVendors();renderOrders();renderLegal();renderPetty();refresh.disabled=pending;}
 refresh.onclick=()=>d.run(async()=>{await load();d.status.textContent=translateStatic('تم استرجاع جميع السجلات التشغيلية.');});
 d.onDispose(()=>{data=null;loaded=false;pending=false;summary.replaceChildren();for(const box of [cheques,vendors,orders,legal,petty])box.replaceChildren();});
 d.run(load);
}

