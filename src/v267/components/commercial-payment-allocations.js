import {node,field} from './dialog.js';

const input=(type='text')=>{const el=node('input');el.type=type;return el;};
const option=(value,text)=>{const el=node('option',text);el.value=value;return el;};
const ARABIC='٠١٢٣٤٥٦٧٨٩';
export const commercialMoney=value=>{
 const text=String(value??'').trim().replace(/[٠-٩]/g,n=>String(ARABIC.indexOf(n))).replace(/٫/g,'.');
 if(!/^[0-9]{1,12}(?:\.[0-9]{1,3})?$/.test(text))throw Error('INVALID_COMMERCIAL_MONEY');
 const [whole,fraction='']=text.split('.');return BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
};
export const commercialMoneyText=value=>String(value/1000n)+'.'+String(value%1000n).padStart(3,'0');
const todayKuwait=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuwait'});
const errors={
 COMMERCIAL_PAYMENT_OVERALLOCATED:'المبلغ يتجاوز الجزء المتاح من الدفعة المختارة.',
 COMMERCIAL_SALE_OVERALLOCATED:'المبلغ يتجاوز رصيد استحقاق نسبة المبيعات.',
 COMMERCIAL_SALE_NOT_OPEN:'هذا الاستحقاق معكوس أو غير متاح للتخصيص.',
 COMMERCIAL_PAYMENT_NOT_AVAILABLE:'الدفعة ملغاة أو لا تخص العقد أو لم تعد متاحة للتخصيص.',
 COMMERCIAL_ALLOCATION_RETRY_CONFLICT:'بيانات محاولة التخصيص لا تطابق الطلب السابق. أعد قراءة الكشف.',
 COMMERCIAL_ALLOCATION_ALREADY_REVERSED:'تم عكس هذا التخصيص سابقًا.',
 INVALID_COMMERCIAL_ALLOCATION:'راجع الدفعة والمبلغ المطلوب تخصيصه.',
 INVALID_COMMERCIAL_ALLOCATION_REVERSAL:'راجع تاريخ وسبب عكس التخصيص.',
 INVALID_COMMERCIAL_ALLOCATION_REVERSAL_DATE:'لا يمكن أن يسبق العكس تاريخ التخصيص.',
 COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED:'هذا العقد يستخدم التحصيل التجاري المستقل، بما فيه القيود المعكوسة. راجع قسم التحصيل التجاري الموثق؛ لا يمكن تخصيص وصل إيجار للعقد نفسه.',
 ACCESS_DENIED:'ليست لديك صلاحية لقراءة أو تعديل تسوية نسبة المبيعات.'
};
const errorText=error=>error?.code==='PGRST202'?'تحتاج تسوية العقد تفعيل تحديث قاعدة البيانات قبل تسجيل أي تخصيص.':errors[error?.message]||error?.message||'تعذر التحقق من تسوية نسبة المبيعات.';

export function mountCommercialPaymentAllocations(d,container,{leases=[]}={}){
 let disposed=false,pending=null,state=null;
 const lease=node('select'),load=node('button','عرض تسوية العقد'),retry=node('button','إعادة محاولة تخصيص السداد'),status=node('p'),body=node('div');
 load.type=retry.type='button';retry.hidden=true;status.setAttribute?.('role','status');
 lease.append(option('','اختر العقد التجاري'));for(const row of leases)lease.append(option(row.id,(row.contract_no||row.id)+' — '+(row.property_name||'')));
 container.append(node('h3','تسوية نسبة المبيعات'),node('p','خصّص جزءًا من دفعة مؤكدة لاستحقاق نسبة المبيعات. الجزء المخصص لا يُحتسب مرة ثانية كسداد إيجار، والوصل الملغى لا يُعتد به.'),field('العقد المراد تسويته',lease),load,retry,status,body);
 const check=()=>{d.session.check();if(disposed)throw Error('تم إغلاق تسوية نسبة المبيعات.');};
 const rpc=async(name,args)=>{check();const value=await d.session.request(d.session.client.rpc(name,args));check();return value;};
 async function collectionMode(id){
  const asOf=todayKuwait(),value=await rpc('aqari_commercial_collections',{p_workspace_id:d.session.bound.workspace,p_action:'list',p_data:{lease_id:id,as_of:asOf}});
  if(value?.as_of!==asOf||typeof value.can_manage!=='boolean'||['leases','accounts','documents','sales','collections'].some(key=>!Array.isArray(value[key])))throw Error('تعذر التحقق من مسار تحصيل العقد.');
  const selected=value.leases.find(row=>row.id===id);
  if(value.mode==='legacy_payment_allocation'){
   if(selected?.collection_mode!==value.mode||value.unavailable_reason!=='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED'||value.can_manage!==false||value.statement!==null||['accounts','documents','sales','collections'].some(key=>value[key].length))throw Error('تعذر التحقق من مسار تحصيل العقد.');
   return 'legacy_payment_allocation';
  }
  if(value.mode!=='independent_collection'||value.unavailable_reason!==null||value.statement?.lease_id!==id||value.statement?.as_of!==asOf||!Array.isArray(value.statement.lines)||(selected&&selected.collection_mode!==value.mode)||value.collections.some(row=>!row.collection?.id||row.collection.lease_id!==id))throw Error('تعذر التحقق من مسار تحصيل العقد.');
  // A reversal preserves the chosen route. An unused contract can start either
  // route; the database workspace lock prevents two concurrent first writes.
  return value.collections.length?'independent_collection':'uncommitted';
 }
 async function read(){
  if(!lease.value)throw Error('اختر العقد التجاري أولًا.');
  const id=lease.value,mode=await collectionMode(id);
  if(id!==lease.value)throw Error('تغير العقد أثناء قراءة التسوية. أعد العرض.');
  if(mode==='independent_collection')return {lease_id:id,mode};
  const value=await rpc('aqari_commercial_payment_context',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.value});
  if(!value||value.lease_id!==lease.value||!value.statement||value.statement.lease_id!==lease.value||!Array.isArray(value.statement.sales)||!Array.isArray(value.payments))throw Error('لم تتطابق إعادة قراءة تسوية العقد.');
  const paymentIds=new Set();for(const p of value.payments){
   if(!p?.id||paymentIds.has(p.id)||commercialMoney(p.amount)<0n||commercialMoney(p.allocated_amount)<0n||commercialMoney(p.available_amount)<0n||commercialMoney(p.allocated_amount)+commercialMoney(p.available_amount)!==commercialMoney(p.amount))throw Error('لم تتطابق أرصدة الدفعات المتاحة.');paymentIds.add(p.id);
  }
  for(const sale of value.statement.sales){
   if(!sale?.id||sale.lease_id!==lease.value||!Array.isArray(sale.allocations)||commercialMoney(sale.amount)<0n||commercialMoney(sale.paid_amount)<0n||commercialMoney(sale.paid_amount)>commercialMoney(sale.amount))throw Error('لم تتطابق أرصدة استحقاقات المبيعات.');
   const allocationIds=new Set();for(const a of sale.allocations){if(!a?.id||allocationIds.has(a.id)||a.sale_id!==sale.id||commercialMoney(a.amount)<=0n)throw Error('لم تتطابق تخصيصات السداد المحفوظة.');allocationIds.add(a.id);}
  }
  return value;
 }
 function lock(value){lease.disabled=load.disabled=value;}
 function clearPending(){pending=null;retry.hidden=true;lock(false);}
 function propose(action,payload){if(!state?.statement||state.lease_id!==lease.value)throw Error('أعد عرض تسوية العقد قبل تسجيل أي تخصيص.');if(pending)throw Error('أكمل التحقق من محاولة التخصيص السابقة أولًا.');pending={action,payload:{...payload,id:crypto.randomUUID()}};retry.hidden=false;lock(true);}
 async function submit(){
  if(!pending||disposed)return;const {action,payload}=pending;let saved;
  try{if(await collectionMode(lease.value)==='independent_collection')throw Object.assign(Error('COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED'),{code:'23514'});saved=await rpc('aqari_commercial_payment_allocations',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:payload});}
  catch(error){if(/^(22|23|40)/.test(error?.code||''))clearPending();throw Error(errorText(error));}
  if(saved?.id!==payload.id)throw Error('لم تتطابق هوية عملية التخصيص. أعد محاولة التحقق.');
  const fresh=await read(),sale=fresh.statement.sales.find(row=>row.id===(action==='allocate'?payload.sale_id:undefined));
  if(action==='allocate'){
   const allocation=sale?.allocations.find(row=>row.id===payload.id);
   if(!allocation||allocation.payment_id!==payload.payment_id||commercialMoney(allocation.amount)!==commercialMoney(payload.amount)||allocation.reversal)throw Error('لم تتطابق إعادة قراءة تخصيص السداد.');
  }else{
   const allocation=fresh.statement.sales.flatMap(row=>row.allocations).find(row=>row.id===payload.allocation_id);
   if(!allocation?.reversal||allocation.reversal.id!==payload.id||allocation.reversal.allocation_id!==payload.allocation_id||allocation.reversal.occurred_on!==payload.occurred_on||allocation.reversal.reason!==payload.reason)throw Error('لم تتطابق إعادة قراءة عكس تخصيص السداد.');
  }
  state=fresh;clearPending();render();status.textContent=action==='allocate'?'تم تخصيص الدفعة والتحقق منها بإعادة قراءة كشف العقد.':'تم عكس تخصيص السداد والتحقق منه بإعادة القراءة.';
 }
 function render(){
  body.replaceChildren();if(!state)return;
  if(state.mode==='independent_collection'){body.append(node('p',errors.COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED));return;}
  const summary=state.statement;body.append(node('p','إجمالي استحقاق المبيعات: '+summary.commercial_due_total+' د.ك — المسدد: '+summary.commercial_paid_total+' د.ك — المتبقي: '+summary.commercial_balance+' د.ك'));
  if(!summary.sales.length){body.append(node('p','لا توجد استحقاقات نسبة مبيعات محفوظة لهذا العقد.'));return;}
  for(const sale of summary.sales){
   const card=node('article'),due=commercialMoney(sale.amount),paid=commercialMoney(sale.paid_amount),remaining=due-paid;
   card.append(node('h4',(sale.month||'').slice(0,7)+' — '+sale.amount+' د.ك'),node('p','المسدد '+sale.paid_amount+' د.ك — المتبقي '+commercialMoneyText(remaining)+' د.ك'));
   if(sale.reversal)card.append(node('p','الاستحقاق معكوس — '+sale.reversal.reason));
   if(sale.allocations.length){card.append(node('h5','تخصيصات السداد'));for(const a of sale.allocations){
    const line=node('div');line.append(node('p',(a.payment_reference||a.payment_id)+' — '+a.amount+' د.ك'+(a.receipt_cancelled?' — الوصل ملغى والتخصيص غير فعّال':'')+(a.reversal?' — معكوس':'')));
    if(!a.reversal){const reverse=node('form'),date=input('date'),reason=input();date.value=todayKuwait();reason.required=true;reason.minLength=5;reason.maxLength=500;reverse.append(field('تاريخ عكس التخصيص',date),field('سبب عكس التخصيص',reason),node('button','عكس تخصيص السداد'));reverse.onsubmit=e=>{e.preventDefault();return d.run(async()=>{if(reason.value.trim().length<5)throw Error('أدخل سبب العكس بخمسة أحرف على الأقل.');propose('reverse',{allocation_id:a.id,occurred_on:date.value,reason:reason.value.trim()});await submit();});};line.append(reverse);}
    card.append(line);
   }}
   const available=state.payments.filter(p=>commercialMoney(p.available_amount)>0n);
   if(!sale.reversal&&remaining>0n&&available.length){
    const form=node('form'),payment=node('select'),amount=input();payment.append(option('','اختر الدفعة المؤكدة'));for(const p of available)payment.append(option(p.id,(p.reference||p.id)+' — متاح '+p.available_amount+' من '+p.amount+' د.ك'));
    amount.inputMode='decimal';amount.required=true;payment.required=true;
    const suggest=()=>{const p=available.find(row=>row.id===payment.value);if(!p)return;const max=commercialMoney(p.available_amount)<remaining?commercialMoney(p.available_amount):remaining;amount.value=commercialMoneyText(max);};payment.onchange=suggest;
    form.append(field('الدفعة',payment),field('المبلغ المخصص د.ك',amount),node('button','تخصيص دفعة للمبيعات'));
    form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{const p=available.find(row=>row.id===payment.value);if(!p)throw Error('اختر دفعة مؤكدة متاحة.');const value=commercialMoney(amount.value);if(value<=0n||value>commercialMoney(p.available_amount)||value>remaining)throw Error('المبلغ يتجاوز المتاح أو رصيد الاستحقاق.');propose('allocate',{sale_id:sale.id,payment_id:p.id,amount:commercialMoneyText(value)});await submit();});};card.append(form);
   }else if(!sale.reversal&&remaining>0n){card.append(node('p','لا توجد دفعة مؤكدة ذات رصيد متاح لهذا العقد.'));}
   body.append(card);
  }
 }
 async function loadState(){if(pending)throw Error('أكمل التحقق من محاولة التخصيص السابقة أولًا.');state=null;body.replaceChildren();status.textContent='';try{state=await read();render();status.textContent=state.mode==='independent_collection'?'تم تحديد مسار التحصيل لهذا العقد.':'تمت إعادة قراءة كشف العقد والدفعات المتاحة.';}catch(error){throw Error(errorText(error));}}
 load.onclick=()=>d.run(loadState);retry.onclick=()=>d.run(submit);lease.onchange=()=>{if(pending){return;}state=null;body.replaceChildren();status.textContent='';};
 const dispose=()=>{disposed=true;pending=state=null;container.replaceChildren();};return {dispose,refresh:()=>d.run(loadState)};
}
