import {node,field} from '../components/dialog.js';

const option=(value,text)=>{const el=node('option',text);el.value=value;return el;};
const input=(type='text')=>{const el=node('input');el.type=type;return el;};
const decimal=(value,places)=>{
 const text=String(value).trim().replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/٫/g,'.');
 if(!new RegExp('^[0-9]{1,9}(?:\\.[0-9]{1,'+places+'})?$').test(text))throw Error('أدخل مبلغًا صحيحًا بالدينار حتى ثلاثة منازل عشرية.');
 const [whole,fraction='']=text.split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
};
const formatted=n=>String(n/1000n)+'.'+String(n%1000n).padStart(3,'0');
export const salesAmount=(gross,percentage)=>formatted((decimal(gross,3)*decimal(percentage,4)+500000n)/1000000n);
const moneyEqual=(a,b)=>decimal(a,3)===decimal(b,3);
const previousMonth=()=>{const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7);};
const errorText=error=>({
 SALES_MONTH_ALREADY_POSTED:'يوجد استحقاق معتمد لهذا العقد في الشهر نفسه. اعكسه أولًا إذا كان يحتاج تصحيحًا.',
 SALES_RETRY_CONFLICT:'بيانات محاولة الحفظ لا تطابق العملية السابقة. أعد قراءة سجل الشهر.',
 SALES_TERMS_REVISION_CONFLICT:'تغيرت نسبة المبيعات بعد فتح الصفحة. أعد قراءة السجل وراجع النسبة الجديدة.',
 APPROVED_SALES_TERMS_REQUIRED:'احفظ واعتمد شروط نسبة المبيعات أولًا.',
 SALES_SOURCE_DOCUMENT_UNVERIFIED:'اختر تقرير مبيعات محفوظًا ومتحققًا منه للعقار أو العقد نفسه.',
 SALES_PERIOD_OUTSIDE_COMPLETED_LEASE_MONTH:'اختر شهرًا انتهت فترته ضمن مدة عقد معتمد.',
 SALES_ALREADY_REVERSED:'تم عكس هذا الاستحقاق سابقًا. أعد قراءة السجل.',
 INVALID_SALES_REVERSAL_DATE:'تاريخ العكس يجب أن يكون بعد فترة الاستحقاق وحتى اليوم.',
 INVALID_COMMERCIAL_SALES:'راجع قيمة المبيعات والمرجع وأساس الاحتساب.',
 INVALID_SALES_MONTH:'اختر شهرًا صحيحًا.',
 INVALID_SALES_REVERSAL:'أدخل سبب العكس وتاريخه.'
}[error?.message]||error?.message||'تعذر التحقق من السجل.');

export function mountCommercialSales(d,container){
 let state=null,pending=null,disposed=false;
 const month=input('month'),loadButton=node('button','عرض استحقاقات الشهر'),content=node('div'),retry=node('button','إعادة محاولة الحفظ والتحقق');
 month.value=previousMonth();loadButton.type=retry.type='button';retry.hidden=true;
 container.append(node('h2','استحقاقات نسبة المبيعات'),node('p','سجّل مبيعات الشهر من تقرير محفوظ. يُحتسب الاستحقاق كنسبة إضافية إلى الإيجار الأساسي بعد تأكيد نص العقد. التصحيح بقيد عكسي مع إبقاء الأصل.'),field('شهر المبيعات',month),loadButton,retry,content);
 month.onchange=()=>{if(pending){month.value=pending.payload.month;return;}state=null;content.replaceChildren();};
 const call=async(action,payload)=>{d.session.check();const value=await d.session.request(d.session.client.rpc('aqari_commercial_sales',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:payload}));d.session.check();return value;};
 async function read(period){
  const data=await call('list',{month:period});
  if(data?.month!==period||!Array.isArray(data.leases)||!Array.isArray(data.documents)||!Array.isArray(data.entries))throw Error('تعذر التحقق من سجل استحقاقات الشهر.');
  return data;
 }
 async function load(){
  if(pending)throw Error('أكمل التحقق من محاولة الحفظ السابقة أولًا.');
  state=await read(month.value);render();
 }
 function proposal(action,payload,expectedPercentage){
  if(pending)throw Error('أكمل التحقق من محاولة الحفظ السابقة أولًا.');
  pending={action,payload:{...payload,id:crypto.randomUUID()},expectedPercentage};retry.hidden=false;month.disabled=loadButton.disabled=true;
 }
 async function submit(){
  if(!pending||disposed)return;
  const {action,payload,expectedPercentage}=pending;let saved;
  try{saved=await call(action,payload);}catch(error){
   // A PostgreSQL validation/serialization rejection rolls back the whole RPC.
   // A network/lost-response error keeps the original request ID for recovery.
   if(/^(22|23|40)/.test(error?.code||'')){pending=null;retry.hidden=true;month.disabled=loadButton.disabled=false;}
   if(error?.code==='PGRST202')throw Error('استحقاقات المبيعات تحتاج تفعيل تحديث قاعدة البيانات. بقية مركز المطابقة متاحة.');
   if(error?.code==='42501')throw error;
   throw Error(errorText(error));
  }
  if(saved?.id!==payload.id)throw Error('لم تتطابق هوية عملية الحفظ؛ أعد محاولة التحقق.');
  const fresh=await read(payload.month);
  if(action==='record'){
   const row=fresh.entries.find(x=>x.id===payload.id);
   const expected=salesAmount(payload.gross_sales,expectedPercentage);
   if(!row||row.lease_id!==payload.lease_id||row.month!==payload.month+'-01'||row.terms_revision!==payload.terms_revision||row.source_document_id!==payload.source_document_id||row.source_reference!==payload.source_reference||row.calculation_basis!==payload.calculation_basis||!moneyEqual(row.gross_sales,payload.gross_sales)||!moneyEqual(row.amount,expected)||!moneyEqual(row.amount,saved.amount)||decimal(row.sales_percentage,4)!==decimal(expectedPercentage,4)||decimal(saved.sales_percentage,4)!==decimal(expectedPercentage,4))throw Error('لم تتطابق إعادة القراءة مع استحقاق المبيعات. أعد التحقق.');
  }else{
   const row=fresh.entries.find(x=>x.id===payload.sale_id),rev=row?.reversal;
   if(!rev||rev.id!==payload.id||rev.sale_id!==payload.sale_id||rev.occurred_on!==payload.occurred_on||rev.reason!==payload.reason)throw Error('لم تتطابق إعادة القراءة مع قيد العكس. أعد التحقق.');
  }
  state=fresh;month.value=fresh.month;pending=null;retry.hidden=true;month.disabled=loadButton.disabled=false;render();d.status.textContent='تم اعتماد القيد والتحقق منه بإعادة قراءة سجل الشهر.';
 }
 function render(){
  content.replaceChildren();if(!state)return;
  const form=node('form'),lease=node('select'),gross=input(),document=node('select'),reference=input(),review=input('checkbox'),preview=node('p');
  lease.append(option('','اختر العقد التجاري'));for(const row of state.leases)lease.append(option(row.id,row.contract_no+' — '+row.property_name+' — '+row.sales_percentage+'%'));
  for(const el of [lease,gross,document,reference])el.required=true;gross.inputMode='decimal';reference.maxLength=200;
  function update(){
   const selected=state.leases.find(x=>x.id===lease.value);document.replaceChildren(option('','اختر تقرير المبيعات المحفوظ'));review.checked=false;
   for(const doc of state.documents.filter(x=>selected&&(x.entity_type==='lease'?x.entity_ref===selected.external_ref:x.entity_ref===selected.property_ref)))document.append(option(doc.id,doc.title));
   recalculate();
  }
  function recalculate(){review.checked=false;const selected=state.leases.find(x=>x.id===lease.value);try{preview.textContent=selected?'الاستحقاق الإضافي: '+salesAmount(gross.value,selected.sales_percentage)+' د.ك':'اختر العقد لعرض النسبة.';}catch{preview.textContent='أدخل مبيعات الشهر لعرض الاستحقاق.';}}
  lease.onchange=update;gross.oninput=recalculate;document.onchange=reference.oninput=()=>{review.checked=false;};update();
  form.append(field('العقد التجاري',lease),field('مبيعات الفترة د.ك',gross),field('تقرير المبيعات المحفوظ',document),field('مرجع تقرير المبيعات',reference),preview,field('راجعت التقرير والعقد، والنسبة مبلغ إضافي إلى الإيجار الأساسي.',review),node('button','اعتماد استحقاق المبيعات'));
  form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
   if(pending)return submit();
   const selected=state.leases.find(x=>x.id===lease.value);if(!selected||!document.value||reference.value.trim().length<3)throw Error('اختر العقد والتقرير وأدخل مرجع المبيعات.');
   if(!review.checked)throw Error('أكد مراجعة التقرير ونص العقد وأساس احتساب النسبة.');
   proposal('record',{lease_id:selected.id,month:state.month,gross_sales:formatted(decimal(gross.value,3)),terms_revision:selected.terms_revision,source_document_id:document.value,source_reference:reference.value.trim(),calculation_basis:'additional_to_base_rent'},selected.sales_percentage);await submit();
  });};
  content.append(form,node('h3','السجل المحفوظ'));if(!state.entries.length)content.append(node('p','لا توجد استحقاقات محفوظة لهذا الشهر.'));
  for(const row of state.entries){
   const card=node('article'),contract=state.leases.find(x=>x.id===row.lease_id)?.contract_no||row.lease_id;
   card.append(node('h4',contract+' — '+row.source_reference),node('p',row.gross_sales+' × '+row.sales_percentage+'% = '+row.amount+' د.ك'),node('p',row.period_start+' — '+row.period_end),node('p',row.reversal?'معكوس — '+row.reversal.reason:'قيد مدين محفوظ'));
   if(!row.reversal){const reversal=node('form'),date=input('date'),reason=input();date.value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuwait'});reason.required=true;reason.minLength=5;reason.maxLength=500;reversal.append(field('تاريخ القيد العكسي',date),field('سبب العكس',reason),node('button','عكس الاستحقاق بقيد دائن'));reversal.onsubmit=e=>{e.preventDefault();return d.run(async()=>{if(pending)return submit();if(reason.value.trim().length<5)throw Error('أدخل سبب العكس بخمسة أحرف على الأقل.');proposal('reverse',{sale_id:row.id,month:state.month,occurred_on:date.value,reason:reason.value.trim()});await submit();});};card.append(reversal);}
   content.append(card);
  }
 }
 loadButton.onclick=()=>d.run(async()=>{try{await load();}catch(error){if(error?.code==='PGRST202')throw Error('استحقاقات المبيعات تحتاج تفعيل تحديث قاعدة البيانات. بقية مركز المطابقة متاحة.');throw error;}});
 retry.onclick=()=>d.run(submit);
 d.onDispose(()=>{disposed=true;state=pending=null;container.replaceChildren();});
}
