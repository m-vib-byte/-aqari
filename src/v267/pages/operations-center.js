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
 f.append(field('الحالة الجديدة',state),field(kind==='cheque'?'مرجع البنك':'مرجع الإجراء',reference),field('سبب موثق',reason),formButton('حفظ الحالة'));
 f.onsubmit=e=>{e.preventDefault();onSubmit({state:state.value,bank_reference:reference.value.trim(),reason:reason.value.trim()});};return f;
}

export function openOperationsCenter(){
 const d=createDialog('مركز العمليات المتكاملة');if(!d)return;
 let data=null,pending=false,loaded=false;
 const notice=el('p','هذه الشاشة تقرأ السجلات الفعلية فقط. كل كتابة يعقبها استرجاع من قاعدة البيانات للتحقق منها.');
 const refresh=el('button','تحديث جميع السجلات');refresh.type='button';
 const summary=el('section'),cheques=section('الشيكات الآجلة والمرتجعة','تسجيل الشيك ثم توثيق انتقالاته البنكية وإعادة الدين عند الارتجاع.'),vendors=section('الموردون والمقاولون','ملف المورد أساس أوامر الشغل والعقود السنوية.'),orders=section('أوامر الشغل','أمر مرقم، اعتماد، تنفيذ، إنجاز ثم فاتورة مرتبطة بالمصروف.'),legal=section('القضايا والمصاريف القضائية','القضية والجلسات والتكاليف والذمة المرتبطة بالعقد.'),petty=section('العهدة المالية','سقف ورصيد وحركات موثقة؛ الصرف يحتاج فاتورة واعتماداً.');
 d.body.append(notice,refresh,summary,cheques,vendors,orders,legal,petty);
 const rpc=(domain,action,payload={})=>d.session.request(d.session.client.rpc('aqari_operations_register',{p_workspace_id:d.session.bound.workspace,p_domain:domain,p_action:action,p_data:payload}));

 async function load(proof=null){
  const [overview,chequeData,vendorData,orderData,legalData,pettyData]=await Promise.all([
   rpc('overview','list'),rpc('cheques','list'),rpc('vendors','list'),rpc('work_orders','list'),rpc('legal_cases','list'),rpc('petty_cash','list')
  ]);
  if(!overview?.health||!Array.isArray(overview.properties)||!Array.isArray(overview.documents)||!Array.isArray(overview.leases)||!Array.isArray(vendorData.items)||!Array.isArray(orderData.items))throw Error('تعذر استرجاع مركز العمليات من قاعدة البيانات.');
  data={overview,chequeData,vendorData,orderData,legalData,pettyData};loaded=true;render();
  if(proof&&!proof(data))throw Error('حُفظت العملية لكن نتيجة إعادة القراءة لا تطابق الطلب؛ لا تكررها قبل المراجعة.');
 }
 async function write(domain,action,payload,proof){
  if(pending)throw Error('توجد عملية قيد التحقق. انتظر نتيجة إعادة القراءة.');pending=true;render();
  try{await rpc(domain,action,payload);await load(proof);d.status.textContent='تم الحفظ والتحقق بإعادة القراءة من قاعدة البيانات.';}
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
  f.append(field('العقد',lease),field('رقم الشيك',number),field('البنك',bank),field('النوع',kind),field('المبلغ د.ك',amount),field('تاريخ الاستحقاق',due),formButton('تسجيل الشيك'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid(),expected=money(amount.value);runWrite('cheques','create',{id,lease_id:lease.value,cheque_no:required(number.value,'رقم الشيك',2),bank_name:required(bank.value,'اسم البنك',2),kind:kind.value,amount:expected,due_on:due.value},x=>x.chequeData.items.some(c=>c.id===id&&Number(c.amount)===Number(expected)));};cheques.append(f);
  for(const c of data.chequeData.items){const card=el('article');card.append(el('h3',`${c.cheque_no} — ${chequeStates[c.state]||c.state}`),el('p',`${c.bank_name} • ${Number(c.amount).toFixed(3)} د.ك • الاستحقاق ${c.due_on}`),el('p',`العقد: ${titleFor(c.lease_id,data.overview.leases,'contract_no')}${c.renewal_frozen?' • التجديد مجمد':''}`));if((transitions[c.state]||[]).length&&!pending)card.append(statusForm(c,'cheque',values=>runWrite('cheques','transition',{id:c.id,event_id:uuid(),revision:c.revision,...values},x=>x.chequeData.items.some(row=>row.id===c.id&&row.revision===c.revision+1&&row.state===values.state))));cheques.append(card);}
 }
 function renderVendors(){
  vendors.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),name=input(),license=input(),phone=input('tel'),email=input('email'),rating=input('number'),basis=input();name.required=true;rating.min='0';rating.max='5';rating.step='0.01';
  f.append(field('اسم المورد أو المقاول',name),field('رقم الترخيص أو المدني',license),field('الهاتف',phone),field('البريد',email),field('التقييم من 5',rating),field('أساس التقييم',basis),formButton('حفظ المورد'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('vendors','save',{id,revision:0,name:required(name.value,'اسم المورد',2),license_no:license.value.trim(),phone:phone.value.trim(),email:email.value.trim(),rating:rating.value||null,rating_basis:basis.value.trim(),status:'active'},x=>x.vendorData.items.some(v=>v.id===id));};vendors.append(f);
  for(const v of data.vendorData.items)vendors.append(Object.assign(el('article'),{textContent:`${v.name} • ${v.phone||'دون هاتف'} • التقييم: ${v.rating??'غير مقيم'}`}));
 }
 function renderOrders(){
  orders.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),property=selectFrom(data.overview.properties,'اختر العقار'),vendor=selectFrom(data.vendorData.items,'اختر المورد'),number=input(),description=el('textarea'),amount=input();number.required=description.required=amount.required=true;description.maxLength=5000;amount.inputMode='decimal';
  f.append(field('العقار',property),field('المورد',vendor),field('رقم أمر الشغل',number),field('وصف الأعمال',description),field('القيمة المعتمدة د.ك',amount),formButton('إنشاء أمر الشغل'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('work_orders','create',{id,property_id:property.value,vendor_id:vendor.value,order_no:required(number.value,'رقم الأمر',2),description:required(description.value,'وصف العمل',3),approved_amount:money(amount.value)},x=>x.orderData.items.some(o=>o.id===id));};orders.append(f);
  for(const o of data.orderData.items){const card=el('article');card.append(el('h3',`${o.order_no} — ${workStates[o.status]||o.status}`),el('p',`${titleFor(o.property_id,data.overview.properties)} • ${titleFor(o.vendor_id,data.vendorData.items)} • ${Number(o.approved_amount).toFixed(3)} د.ك`),el('p',o.description));if((transitions[o.status]||[]).length&&!pending)card.append(statusForm(o,'work',values=>runWrite('work_orders','status',{id:o.id,revision:o.revision,state:values.state,reason:values.reason,reference:values.bank_reference},x=>x.orderData.items.some(row=>row.id===o.id&&row.revision===o.revision+1&&row.status===values.state))));orders.append(card);}
 }
 function renderLegal(){
  legal.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),lease=selectFrom(data.overview.leases.map(x=>({...x,name:x.contract_no})),'اختر العقد'),number=input(),court=input(),kind=input(),opened=input('date'),description=el('textarea');number.required=court.required=kind.required=opened.required=true;
  f.append(field('العقد',lease),field('رقم القضية',number),field('المحكمة',court),field('نوع القضية',kind),field('تاريخ الفتح',opened),field('ملخص',description),formButton('فتح سجل القضية'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('legal_cases','create',{id,lease_id:lease.value,case_no:required(number.value,'رقم القضية',2),court:required(court.value,'المحكمة',2),kind:required(kind.value,'نوع القضية',2),opened_on:opened.value,summary:description.value.trim()},x=>x.legalData.items.some(c=>c.id===id));};legal.append(f);
  for(const c of data.legalData.items)legal.append(Object.assign(el('article'),{textContent:`${c.case_no} • ${c.court} • ${c.kind} • ${c.status} • ${c.transactions_frozen?'المعاملات مجمدة':'غير مجمدة'}`}));
 }
 function renderPetty(){
  petty.querySelectorAll(':scope > :not(h2):not(p)').forEach(x=>x.remove());
  const f=el('form'),name=input(),custodian=input(),ceiling=input();name.required=custodian.required=ceiling.required=true;ceiling.inputMode='decimal';
  f.append(field('اسم العهدة',name),field('معرف أمين العهدة',custodian),field('السقف د.ك',ceiling),formButton('فتح عهدة'));
  f.onsubmit=e=>{e.preventDefault();const id=uuid();runWrite('petty_cash','create',{id,name:required(name.value,'اسم العهدة',2),custodian_id:required(custodian.value,'معرف أمين العهدة'),ceiling:money(ceiling.value)},x=>x.pettyData.funds.some(row=>row.id===id));};petty.append(f);
  for(const fund of data.pettyData.funds)petty.append(Object.assign(el('article'),{textContent:`${fund.name} • الرصيد ${Number(fund.balance).toFixed(3)} د.ك من سقف ${Number(fund.ceiling).toFixed(3)} د.ك • ${fund.status}`}));
 }
 function render(){if(!loaded)return;renderSummary();renderCheques();renderVendors();renderOrders();renderLegal();renderPetty();refresh.disabled=pending;}
 refresh.onclick=()=>d.run(async()=>{await load();d.status.textContent='تم استرجاع جميع السجلات التشغيلية.';});
 d.onDispose(()=>{data=null;loaded=false;pending=false;summary.replaceChildren();for(const box of [cheques,vendors,orders,legal,petty])box.replaceChildren();});
 d.run(load);
}
