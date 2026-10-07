import {createDialog,node,field} from '../components/dialog.js';
import {t,message,getLocale,direction,dateLocale} from '../components/locale.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {DEPOSIT_METHODS,depositMoney,depositFils,depositToday,depositValues,createDepositWriter,isDepositDenied,depositReceiptHTML} from '../domain/deposit-ledger.js';

const errors={
 ACCESS_DENIED:'لا تملك صلاحية هذه العملية.',SECTION_READ_DENIED:'لا تملك صلاحية عرض دفتر التأمين.',SECTION_WRITE_DENIED:'لا تملك صلاحية تسجيل حركة تأمين.',
 DEPOSIT_INVALID_LEASE:'العقد غير متاح. حدّث السجل واختر عقداً محفوظاً.',DEPOSIT_SIGNED_CONTRACT_REQUIRED:'قبض التأمين يحتاج عقداً موقّعاً محفوظاً.',
 DEPOSIT_REFUND_EXCEEDS_BALANCE:'مبلغ الرد يتجاوز رصيد التأمين المحفوظ.',DEPOSIT_RECEIPT_EXCEEDS_CONTRACT:'المبلغ يتجاوز التأمين المتبقي للعقد.',
 DEPOSIT_DOCUMENTED_AMOUNT_REQUIRED:'مبلغ التأمين المتفق عليه غير موثق في العقد؛ راجع العقد قبل تسجيل القبض.',DEPOSIT_REFUND_DATE_BALANCE:'لا يكفي رصيد التأمين في تاريخ الرد المحدد. راجع تاريخ الحركة.',DEPOSIT_PERIOD_CLOSED:'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.',
 DEPOSIT_REFERENCE_EXISTS:'مرجع الدفع مسجل سابقاً. راجع الحركة المحفوظة.',DEPOSIT_REQUEST_CONFLICT:'لا تطابق الحركة المحفوظة بيانات العملية. راجع السجل قبل أي إجراء جديد.',
 DEPOSIT_WORKSPACE_UNAVAILABLE:'مساحة العمل غير متاحة حالياً. أعد فتح الصفحة.',
 DEPOSIT_INVALID_DATA:'راجع بيانات الحركة وتاريخها والمبلغ ومرجع الدفع.',DEPOSIT_UNKNOWN_ACTION:'تعذر تسجيل الحركة المطلوبة. حدّث الصفحة.',DEPOSIT_UNKNOWN_FIELD:'راجع بيانات الحركة وتاريخها والمبلغ ومرجع الدفع.',DEPOSIT_INVALID_REQUEST_ID:'تعذر التحقق من العملية السابقة. أعد فتح الصفحة قبل تسجيل حركة تأمين.',
 DEPOSIT_INVALID_AMOUNT:'أدخل مبلغاً صحيحاً بالدينار الكويتي، بثلاث منازل عشرية كحد أقصى.',DEPOSIT_INVALID_DATE:'أدخل تاريخاً صحيحاً لا يتجاوز اليوم.',DEPOSIT_FUTURE_DATE:'أدخل تاريخاً صحيحاً لا يتجاوز اليوم.',DEPOSIT_INVALID_METHOD:'اختر طريقة دفع صحيحة.',DEPOSIT_INVALID_REFERENCE:'أدخل مرجع التحويل أو الدفع من 3 إلى 120 حرفاً.',DEPOSIT_INVALID_REASON:'راجع سبب الحركة أو بيانها، بحد أقصى 500 حرف.'
};
const freshDraft=()=>({amount:'',on_date:depositToday(),method:'cash',reference:'',reason:''});

export function openDepositLedger(){
 const d=createDialog(t('دفتر التأمين — القبض والرد'),{localized:true});if(!d)return;
 const urls=createPrivateUrls(d);let writer,leases=[],entries=[],selectedId='',mode='receive',draft=freshDraft(),loaded=false,absent=false,output=null;
 const selected=()=>leases.find(lease=>lease.id===selectedId);
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_deposit_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const say=source=>{if(!d.closed)d.status.textContent=t(source);};
 const button=(label,fn)=>{const b=node('button',t(label));b.type='button';b.onclick=fn;return b;};
 const text=(tag,label)=>node(tag,t(label));
 function forgetView(){leases=[];entries=[];selectedId='';draft=freshDraft();output=null;urls.clear();d.body.replaceChildren();}
 async function work(task){return d.run(async()=>{
  try{await task();d.session.check();}
  catch(error){
   let lost=false;try{d.session.check();}catch{lost=true;}
   if(lost||isDepositDenied(error)){forgetView();loaded=false;}
   const code=String(error?.message||'').split(':')[0],source=errors[code]||(/^[\u0600-\u06ff]/.test(error?.message||'')?error.message:t('تعذر تأكيد العملية. حدّث السجل للتحقق قبل إعادة المحاولة.'));
   say(source);
   if(!lost&&!isDepositDenied(error))render();
  }
 });}
 async function read({reconcile=true,leaseId=selectedId}={}){
  let result;
  if(reconcile&&writer.pending){
   result=await writer.reconcile();absent=result.state==='absent';
   if(result.state==='saved'){leaseId=result.entry.snapshot.lease_id;draft=freshDraft();output=null;}
  }
  if(writer.pending){leaseId=writer.pending.lease_id;mode=writer.pending.action;if(writer.retained)draft={...writer.retained};}
  const data=await rpc('list',leaseId?{lease_id:leaseId}:{});d.session.check();
  if(!Array.isArray(data?.leases)||!Array.isArray(data?.entries))throw Error('تعذر قراءة دفتر التأمين. حدّث السجل.');
  if(data.entries.some(entry=>!leaseId||entry?.lease_id!==leaseId||entry?.snapshot?.lease_id!==leaseId)||data.entries.length&&!data.leases.some(lease=>lease.id===leaseId))throw Error('تعذر قراءة دفتر التأمين. حدّث السجل.');
  // Commit selection and its rows together. A failed read must never relabel the previous ledger.
  if(leaseId!==selectedId){if(!writer.pending)draft=freshDraft();output=null;urls.clear();}
  selectedId=leaseId;leases=data.leases;entries=data.entries;loaded=true;
  if(selectedId&&!leases.some(lease=>lease.id===selectedId)){selectedId='';entries=[];}
  render();
  if(result?.state==='saved')say(t('تم حفظ حركة التأمين والتحقق من الوصل والرصيد.'));
  else if(writer.pending)say(absent?t('لم تظهر الحركة في السجل بعد. أعد المحاولة بالبيانات نفسها فقط.'):t('تحقق من العملية السابقة قبل تسجيل حركة جديدة.'));
  else say(t('تم استرجاع دفتر التأمين من السجلات المحفوظة.'));
 }
 async function movement(retry=false){
  const lease=selected();if(!lease)throw Error('اختر عقداً محفوظاً.');
  if(!retry&&writer.pending)throw Error('تحقق من العملية السابقة قبل تسجيل حركة جديدة.');
  if(!retry&&mode==='receive'&&lease.can_receive!==true)throw Error('لا تتاح عملية القبض لهذا العقد حسب حالته وصلاحيتك.');
  if(!retry&&mode==='refund'&&(lease.can_refund!==true||d.session.bound.role!=='general_manager'))throw Error('رد التأمين يحتاج صلاحية المدير العام.');
  const values=depositValues(mode,{...draft,lease_id:selectedId});
  if(!retry&&mode==='refund'&&depositFils(values.amount)>depositFils(lease.balance))throw Error('مبلغ الرد يتجاوز رصيد التأمين المحفوظ.');
  const result=await (retry?writer.retry(values):writer.submit(mode,values));d.session.check();absent=result.state==='absent';
  if(result.state==='saved'){draft=freshDraft();output=null;await read({reconcile:false});say(t('تم حفظ حركة التأمين والتحقق من الوصل والرصيد.'));}
  else{draft={...values};render();say(t('لم تظهر الحركة في السجل بعد. أعد المحاولة بالبيانات نفسها فقط.'));}
 }
 async function prepareReceipt(id){
  output=null;urls.clear();
  const result=await rpc('get',{id});d.session.check();const entry=result?.entry;
  if(!entry||entry.id!==id||entry.snapshot?.lease_id!==selectedId)throw Error('تعذر التحقق من الوصل المحفوظ. حدّث السجل.');
  const html=depositReceiptHTML(entry,{translate:t,locale:getLocale(),direction:direction()});
  output=urls.create(new Blob([html],{type:'text/html;charset=utf-8'}));render();say(t('تم تجهيز الوصل من الحركة المحفوظة. افتحه للطباعة أو الحفظ بصيغة PDF.'));
 }
 function render(){
  if(d.closed)return;
  d.body.replaceChildren(text('p',t('دفتر التأمين مستقل عن تحصيل الإيجار. قيمة التأمين في العقد لا تعني أنه مقبوض.')),text('p',t('القبض والرد يسجلان حركة منفذة. لا ترسل هذه الشاشة أموالاً أو تنفذ تحويلاً خارجياً.')));
  const toolbar=node('div'),picker=node('select'),empty=text('option',t('اختر عقداً محفوظاً.'));empty.value='';picker.append(empty);
  for(const lease of leases){const option=node('option',[lease.contract_no,lease.tenant_name,lease.property_name,lease.unit_no].filter(Boolean).join(' · '));option.value=lease.id;picker.append(option);}
  picker.value=selectedId;picker.disabled=!!writer?.pending;picker.onchange=()=>work(()=>read({reconcile:false,leaseId:picker.value}));
  toolbar.append(field(t('العقد المحفوظ'),picker),button(t('تحديث السجل والتحقق من العملية'),()=>work(()=>read())));d.body.append(toolbar);
  if(!loaded)return;
  if(!leases.length){d.body.append(text('p',t('لا توجد عقود متاحة لدفتر التأمين حسب صلاحيتك.')));return;}
  if(writer?.pending)d.body.append(text('p',writer.retained?t('توجد عملية بانتظار التحقق. تبقى بياناتها ثابتة لمنع تكرار القبض أو الرد.'):t('توجد عملية سابقة بانتظار التحقق. إن لم تظهر في السجل، أعد إدخال بياناتها نفسها لإعادة المحاولة.')));
  const lease=selected();if(!lease){d.body.append(text('p',t('اختر عقداً لعرض المستأجر والعقار والوحدة وحركات التأمين المرتبطة به.')));return;}
  const details=node('dl');
  for(const [label,value]of [[t('رقم العقد'),lease.contract_no],[t('المستأجر'),lease.tenant_name],[t('العقار'),lease.property_name],[t('الوحدة'),lease.unit_no],[t('التأمين المحدد في العقد — د.ك'),lease.contract_deposit],[t('التأمين المقبوض — د.ك'),lease.received],[t('التأمين المردود — د.ك'),lease.refunded],[t('رصيد التأمين المحفوظ — د.ك'),lease.balance]])details.append(text('dt',label),node('dd',String(value??t('غير مسجل'))));
  d.body.append(details);
  const canReceive=lease.can_receive===true,canRefund=lease.can_refund===true&&d.session.bound.role==='general_manager';
  if(canReceive||canRefund||writer?.pending){
   const actions=node('div');
   if(!writer?.pending){
    if(canReceive)actions.append(button(t('تسجيل قبض تأمين'),()=>{mode='receive';draft=freshDraft();render();}));
    if(canRefund)actions.append(button(t('تسجيل رد تأمين'),()=>{mode='refund';draft=freshDraft();render();}));
    if((mode==='receive'&&!canReceive)||(mode==='refund'&&!canRefund))mode=canReceive?'receive':'refund';
   }
   d.body.append(actions);const form=node('form');form.dataset.aq267DepositForm=mode;
   form.append(text('h3',mode==='receive'?t('وصل قبض تأمين'):t('وصل رد تأمين')));
   const controls={},add=(name,label,type='text')=>{const control=node(type==='textarea'?'textarea':'input');if(type!=='textarea')control.type=type;control.value=draft[name]??'';control.oninput=()=>{draft[name]=control.value;};control.disabled=!!writer?.pending&&!!writer.retained;controls[name]=control;form.append(field(t(label),control));return control;};
   const amount=add('amount',t('المبلغ بالدينار الكويتي'));amount.inputMode='decimal';amount.dir='ltr';amount.required=true;amount.maxLength=16;
   const date=add('on_date',t('تاريخ العملية'),'date');date.required=true;date.max=depositToday();
   const method=node('select');for(const [value,label]of Object.entries(DEPOSIT_METHODS)){const option=text('option',label);option.value=value;method.append(option);}method.value=draft.method;method.disabled=!!writer?.pending&&!!writer.retained;
   method.onchange=()=>{draft.method=method.value;controls.reference.required=method.value!=='cash';};form.append(field(t('طريقة الدفع'),method));
   const reference=add('reference',t('مرجع الدفع — اختياري للنقدي'));reference.maxLength=120;reference.required=draft.method!=='cash';
   const reason=add('reason',mode==='refund'?t('سبب رد التأمين'):t('بيان القبض — اختياري'),'textarea');reason.maxLength=500;reason.rows=3;reason.required=mode==='refund';
   if(mode==='refund'&&!writer?.pending){const full=button(t('استخدام كامل الرصيد للرد'),()=>{draft.amount=depositMoney(lease.balance);amount.value=draft.amount;});full.disabled=depositFils(lease.balance)===0n;form.append(full);}
   if(writer?.pending){
    if(absent){const retry=text('button',t('إعادة نفس العملية دون تكرار'));retry.type='submit';form.append(retry);form.onsubmit=event=>{event.preventDefault();return work(()=>movement(true));};}
   }else{const save=text('button',t('حفظ الحركة والتحقق من الوصل'));save.type='submit';form.append(save);form.onsubmit=event=>{event.preventDefault();return work(()=>movement());};}
   d.body.append(form);
  }else d.body.append(text('p',t('عرض دفتر التأمين فقط. لا تتاح حركة جديدة لهذا العقد حسب حالته وصلاحيتك.')));
  const list=node('div');list.append(text('h3',t('حركات التأمين المحفوظة')));
  if(!entries.length)list.append(text('p',t('لا توجد حركات تأمين محفوظة لهذا العقد.')));
  for(const entry of entries){
   const card=node('article');card.dataset.aq267DepositEntry=entry.id;
   card.append(node('h4',t(entry.kind==='receipt'?t('وصل قبض تأمين'):t('وصل رد تأمين'))+' · '+entry.voucher_no),node('p',message('{amount} د.ك · {date}',{amount:depositMoney(entry.amount),date:entry.on_date})),node('p',entry.reason||''));
   if(entry.actor_name)card.append(node('p',t('سجل العملية')+': '+entry.actor_name));
   if(entry.created_at){const when=new Date(entry.created_at);if(Number.isFinite(when.getTime()))card.append(node('p',when.toLocaleString(dateLocale(),{timeZone:'Asia/Kuwait'})));}
   card.append(button(t('تجهيز الوصل المحفوظ للطباعة'),()=>work(()=>prepareReceipt(entry.id))));list.append(card);
  }
  d.body.append(list);
  if(output){const link=text('a',t('فتح الوصل للطباعة أو الحفظ'));link.href=output;link.target='_blank';link.rel='noopener';d.body.append(link);}
  d.body.append(text('p',t('وصل التأمين مستقل عن الإيجار ولا يمثل مخالصة أو براءة ذمة.')));
 }
 d.onDispose(()=>{forgetView();writer=null;});
 return work(async()=>{writer=createDepositWriter({rpc,scope:d.session.bound,check:d.session.check});await read();});
}
