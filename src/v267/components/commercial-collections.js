import {node,field} from './dialog.js';

const input=(type='text')=>Object.assign(node('input'),{type});
const option=(value,label)=>Object.assign(node('option',label),{value});
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuwait'});
const clone=value=>JSON.parse(JSON.stringify(value));
const fils=value=>{
 const text=String(value??'').trim().replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[۰-۹]/g,n=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n))).replace(/٫/g,'.');
 if(!/^[0-9]{1,12}(?:\.[0-9]{1,3})?$/.test(text))throw Error('أدخل مبلغًا صحيحًا حتى ثلاثة منازل عشرية.');
 const [whole,fraction='']=text.split('.');return BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
};
const amount=value=>{const n=fils(value);return `${n/1000n}.${String(n%1000n).padStart(3,'0')}`;};
const equalAmount=(a,b)=>fils(a)===fils(b);
const methods={cash:'نقدي',bank_transfer:'تحويل بنكي موثق'};
const accountKeys=['id','property_id','kind','name','masked_reference','currency','revision'];
const errors={
 COMMERCIAL_COLLECTION_RETRY_CONFLICT:'بيانات العملية السابقة مختلفة. حدّث السجل وراجع التحصيل قبل تسجيل عملية أخرى.',
 COMMERCIAL_COLLECTION_ACCOUNT_CHANGED:'تغيرت مراجعة الحساب. حدّث السجل وراجع الحساب من جديد.',
 COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH:'اختر حسابًا نشطًا من العقار نفسه يناسب طريقة التحصيل.',
 COMMERCIAL_COLLECTION_DOCUMENT_UNVERIFIED:'اختر مستند قبض محفوظًا ومتحققًا منه للعقد أو العقار نفسه.',
 COMMERCIAL_ALLOCATION_TOTAL_MISMATCH:'مجموع التخصيص لا يطابق مبلغ التحصيل.',
 COMMERCIAL_ALLOCATION_EXCEEDS_BALANCE:'المبلغ يتجاوز المتبقي من الاستحقاق. حدّث السجل.',
 COMMERCIAL_ALLOCATION_SOURCE_INVALID:'الاستحقاق غير متاح للتحصيل. حدّث السجل.',
 COMMERCIAL_COLLECTION_BEFORE_CHARGE:'تاريخ التحصيل يجب أن يوافق نهاية فترة الاستحقاق أو يليها.',
 COMMERCIAL_COLLECTION_AFTER_CLEARANCE:'العقد حصل على براءة ذمة أو أُغلق؛ لا يقبل تحصيلًا أو عكسًا جديدًا.',
 COMMERCIAL_COLLECTION_ALREADY_REVERSED:'سبق عكس التحصيل. حدّث السجل لعرض القيد المحفوظ.',
 COMMERCIAL_COLLECTION_LEDGER_MISMATCH:'تعذر مطابقة مصادر الاستحقاقات والتحصيلات وتخصيصاتها وتواريخها. راجع السجل قبل الاعتماد.',
 COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED:'هذا العقد يستخدم مسار تخصيص الإيصالات القائم؛ استكمل مراجعته من ذلك المسار. التحصيل المستقل غير متاح لهذا العقد.',
 COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED:'هذا العقد يستخدم التحصيل التجاري المستقل. راجع سجل التحصيل الموثق وأكمل العملية منه.',
 COMMERCIAL_COLLECTION_CUTOFF_REVIEW_REQUIRED:'توجد حركات تحتاج مطابقة عند تاريخ الإقفال. راجع تواريخ الاستحقاقات والتحصيلات قبل اعتماد الرصيد.',
 INVALID_COMMERCIAL_COLLECTION_DATE:'راجع تاريخ التحصيل أو العكس؛ يجب ألا يتجاوز اليوم.',
 INVALID_COMMERCIAL_COLLECTION_REVERSAL:'أدخل تاريخ العكس وسببًا واضحًا بخمسة أحرف على الأقل.',
 FINANCIAL_PERIOD_CLOSED:'الفترة المالية مقفلة. اختر تاريخًا في فترة مفتوحة.'
};
const denied=e=>e?.code==='42501'||[401,403].includes(e?.status)||e?.message==='ACCESS_DENIED';
// This exact PostgreSQL guard is returned by PostgREST as HTTP 400. An unknown
// P0001 or a transport error must still recover through independent readback.
const closedPeriod=e=>e?.code==='P0001'&&e?.status===400&&e?.message==='الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.';
const errorText=e=>e?.code==='PGRST202'?'التحصيل التجاري يحتاج تفعيل تحديث قاعدة البيانات.':closedPeriod(e)?errors.FINANCIAL_PERIOD_CLOSED:errors[e?.message]||'تعذر إكمال العملية أو التحقق منها. حدّث السجل وراجع البيانات.';
const mismatch=()=>Error('لم تتطابق إعادة القراءة مع التحصيل أو تخصيصه. احتُفظ بالطلب للتحقق.');

export async function requireCommercialCollectionsAccess(d){
 d.session.check();
 const a=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
 d.session.check();
 if(a?.user_id!==d.session.bound.user||a?.workspace_id!==d.session.bound.workspace||a?.role!==d.session.bound.role||a?.role!=='general_manager'||a?.features?.commercial_collections!==true||a?.permissions?.finance?.read!==true||a?.permissions?.documents?.read!==true)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
 return a;
}

export function mountCommercialCollections(d,container){
 const lease=node('select'),refresh=Object.assign(node('button','عرض التحصيل التجاري'),{type:'button'}),recover=Object.assign(node('button','التحقق من التحصيل السابق'),{type:'button'}),content=node('section'),status=node('p');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 container.append(node('h2','التحصيل التجاري الموثق'),node('p','سجّل مبلغًا تم قبضه مع مستنده وخصصه لاستحقاق نسبة المبيعات. التحويل هنا إثبات تحصيل؛ لا ينفذ دفعًا بنكيًا. التحصيل التجاري مستقل عن الإيجار الأساسي.'),field('عقد التحصيل التجاري',lease),refresh,recover,status,content);
 let data=null,selectedLease='',pending=null,busy=false,disposed=false,formControls=[];
 lease.append(option('','اختر العقد بعد عرض السجل'));recover.hidden=true;
 const call=async(action,payload)=>{
  if(disposed)throw Error('أُغلقت الصفحة.');d.session.check();
  const value=await d.session.request(d.session.client.rpc('aqari_commercial_collections',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:payload}));
  d.session.check();if(disposed)throw Error('أُغلقت الصفحة.');return value;
 };
 function controls(){
  const locked=busy||!!pending||disposed;lease.disabled=refresh.disabled=locked;
  for(const control of formControls)control.disabled=locked||data?.can_manage!==true;
  recover.hidden=!pending;recover.disabled=busy||disposed;recover.textContent=pending?.verifiedAbsent?'إعادة محاولة الطلب نفسه':'التحقق من التحصيل السابق';
 }
 async function run(task){if(busy||disposed)return;busy=true;controls();try{await d.run(task);}finally{busy=false;controls();}}
 async function read(id){
  const asOf=today(),value=await call('list',{...(id?{lease_id:id}:{}),as_of:asOf});
  if(value?.as_of!==asOf||typeof value.can_manage!=='boolean'||['leases','accounts','documents','sales','collections'].some(k=>!Array.isArray(value[k])))throw mismatch();
  const selected=value.leases.find(x=>x.id===id);
  if(value.mode==='legacy_payment_allocation'){
   if(!id||selected?.collection_mode!==value.mode||value.unavailable_reason!=='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED'||value.can_manage!==false||value.statement!==null||['accounts','documents','sales','collections'].some(k=>value[k].length))throw mismatch();
   return value;
  }
  if(value.mode!=='independent_collection'||value.unavailable_reason!==null)throw mismatch();
  if(id&&(selected?.collection_mode!==value.mode||value.statement?.lease_id!==id||value.statement?.as_of!==asOf||!Array.isArray(value.statement.lines)||value.collections.some(x=>x.collection?.lease_id!==id)))throw mismatch();
  if(id){const s=value.statement;if(fils(s.charge_total)-fils(s.reversed_charge_total)-fils(s.collected_total)+fils(s.collection_reversed_total)!==fils(s.balance))throw mismatch();}
  return value;
 }
 async function load(){
  if(pending||disposed)return;await requireCommercialCollectionsAccess(d);
  data=null;content.replaceChildren();formControls=[];
  data=await read(selectedLease);render();status.textContent=data.mode==='legacy_payment_allocation'?'تم تحديد مسار التحصيل لهذا العقد.':'تمت قراءة سجل التحصيل التجاري.';
 }
 function matchAllocations(actual,expected){
  if(!Array.isArray(actual)||actual.length!==expected.length||new Set(actual.map(x=>x.sale_id)).size!==actual.length)throw mismatch();
  if(expected.some(e=>!actual.some(a=>a.sale_id===e.sale_id&&equalAmount(a.amount,e.amount))))throw mismatch();
 }
 function matchCollection(result,expected,snapshot){
  const c=result?.collection;
  if(!c||['id','lease_id','account_id','method','occurred_on','reference','source_document_id'].some(k=>c[k]!==expected[k])||!equalAmount(c.amount,expected.amount)||!/^([a-f0-9]{64})$/.test(c.source_checksum||''))throw mismatch();
  if(!c.account_snapshot||accountKeys.some(k=>c.account_snapshot[k]!==snapshot[k]))throw mismatch();
  const request=c.request_data;if(!request||Object.keys(expected).some(k=>k!=='allocations'&&request[k]!==expected[k]))throw mismatch();
  matchAllocations(request.allocations,expected.allocations);matchAllocations(result.allocations,expected.allocations);return c;
 }
 function prove(result){
  if(pending.action==='record')return matchCollection(result,pending.payload,pending.account);
  const original=pending.original;
  const c=matchCollection(result,original.collection.request_data,original.collection.account_snapshot);
  if(c.source_checksum!==original.collection.source_checksum)throw mismatch();
  const r=result.reversal,p=pending.payload;
  if(!r)return null;
  if(r.id!==p.id||r.collection_id!==p.collection_id||r.occurred_on!==p.occurred_on||r.reason!==p.reason||!equalAmount(r.amount,c.amount)||!r.request_data||Object.keys(p).some(k=>r.request_data[k]!==p[k]))throw mismatch();
  return c;
 }
 async function verify(){
  if(!pending||disposed)return;
  const id=pending.action==='record'?pending.payload.id:pending.payload.collection_id,result=await call('get',{id});
  if(result?.collection===null&&pending.action==='record'&&Array.isArray(result.allocations)&&!result.allocations.length&&result.reversal===null){pending.verifiedAbsent=true;status.textContent='لم تُسجل العملية. يمكنك إعادة محاولة الطلب نفسه دون تكرار.';return;}
  const confirmed=prove(result);
  if(!confirmed){pending.verifiedAbsent=true;status.textContent='لم يُسجل العكس. يمكنك إعادة محاولة الطلب نفسه دون تكرار.';return;}
  const fresh=await read(pending.leaseId),listed=fresh.collections.find(x=>x.collection?.id===id);
  if(!listed||!prove(listed)||listed.collection.source_checksum!==confirmed.source_checksum)throw mismatch();
  if((result.reversal?.id||null)!==(listed.reversal?.id||null))throw mismatch();
  const reversed=pending.action==='reverse',alreadyReversed=!!listed.reversal;
  selectedLease=pending.leaseId;data=fresh;pending=null;render();
  status.textContent=reversed?'تم عكس التحصيل والتحقق من الأصل والتخصيص والرصيد.':alreadyReversed?'تم التحقق من التحصيل، ويوجد قيد عكس محفوظ له.':'تم حفظ التحصيل والتحقق من المستند والحساب والتخصيص والرصيد.';
 }
 async function send(){
  if(!pending||disposed)return;
  try{await call(pending.action,pending.payload);}catch(error){
   if(denied(error))throw error;
   if(closedPeriod(error)||error?.code==='PGRST202'||/^(22|23|40)/.test(error?.code||'')){pending=null;data=null;content.replaceChildren();formControls=[];status.textContent=errorText(error)+' أعد عرض السجل قبل المحاولة.';return;}
  }
  try{await verify();}catch(error){if(denied(error))throw error;if(!disposed)status.textContent=error?.message?.startsWith('لم تتطابق')?error.message:'لم يتأكد الحفظ. احتُفظ بالطلب؛ اضغط «التحقق من التحصيل السابق» قبل تسجيل عملية أخرى.';}
 }
 function propose(action,payload,extra){
  if(pending||disposed||data?.can_manage!==true)return false;
  const immutable=clone({...payload,id:crypto.randomUUID()});
  if(immutable.allocations){immutable.allocations.forEach(Object.freeze);Object.freeze(immutable.allocations);}Object.freeze(immutable);
  pending={action,payload:immutable,leaseId:selectedLease,verifiedAbsent:false,...clone(extra)};controls();return true;
 }
 function render(){
  content.replaceChildren();formControls=[];if(!data)return;
  lease.replaceChildren(option('','اختر العقد التجاري'),...data.leases.map(x=>option(x.id,`${x.contract_no} — ${x.property_name}${x.collection_mode==='legacy_payment_allocation'?' — تخصيص الإيصالات':''}`)));lease.value=selectedLease;
  if(!selectedLease){content.append(node('p',data.leases.length?'اختر عقدًا لعرض استحقاقاته وحساباته ومستنداته.':'لا توجد عقود ذات استحقاقات مبيعات محفوظة ضمن صلاحياتك.'));controls();return;}
  const chosen=data.leases.find(x=>x.id===selectedLease),s=data.statement;
  content.append(node('h3',`${chosen.contract_no} — ${chosen.property_name}`));
  if(data.mode==='legacy_payment_allocation'){content.append(node('p',errors.COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED));controls();return;}
  content.append(node('p',`استحقاقات: ${amount(s.charge_total)} د.ك • عكس استحقاقات: ${amount(s.reversed_charge_total)} د.ك`),node('p',`تحصيل: ${amount(s.collected_total)} د.ك • عكس تحصيل: ${amount(s.collection_reversed_total)} د.ك`),node('p',`المتبقي التجاري حتى ${data.as_of}: ${amount(s.balance)} د.ك`));
  if(data.can_manage){
   const form=node('form'),sale=node('select'),method=node('select'),account=node('select'),document=node('select'),value=input(),date=input('date'),reference=input(),review=input('checkbox'),hint=node('p'),save=Object.assign(node('button','تسجيل تحصيل موثق'),{type:'submit'});
   const available=data.sales.filter(x=>!x.reversed&&fils(x.outstanding)>0n),docs=data.documents.filter(x=>(x.entity_type==='lease'&&x.entity_ref===chosen.external_ref)||(x.entity_type==='property'&&x.entity_ref===chosen.property_ref));
   sale.append(option('','اختر الاستحقاق'),...available.map(x=>option(x.id,`${x.month.slice(0,7)} — ${x.reference} — متبقٍ ${amount(x.outstanding)} د.ك`)));
   method.append(option('','اختر طريقة التحصيل'),option('cash',methods.cash),option('bank_transfer',methods.bank_transfer));method.value='';
   document.append(option('','اختر مستند القبض المحفوظ'),...docs.map(x=>option(x.id,x.title)));
   value.inputMode='decimal';date.value=today();date.max=today();reference.minLength=3;reference.maxLength=160;review.required=true;
   for(const c of [sale,method,account,document,value,date,reference])c.required=true;
   function accounts(){const kind=method.value==='cash'?'cashbox':method.value==='bank_transfer'?'bank':null;account.replaceChildren(option('','اختر حساب العقار'),...data.accounts.filter(x=>x.property_id===chosen.property_id&&x.kind===kind&&x.currency==='KWD'&&Number.isInteger(x.revision)).map(x=>option(x.id,`${x.name} — ${x.masked_reference}`)));account.value='';review.checked=false;}
   method.onchange=accounts;accounts();
   sale.onchange=()=>{review.checked=false;const row=available.find(x=>x.id===sale.value);date.min=row?.period_end||'';hint.textContent=row?`المتبقي لهذا الاستحقاق: ${amount(row.outstanding)} د.ك. يمكن تحصيله جزئيًا.`:'';};
   for(const c of [account,document,date])c.onchange=()=>{review.checked=false;};value.oninput=reference.oninput=()=>{review.checked=false;};
   form.append(field('استحقاق نسبة المبيعات',sale),hint,field('طريقة التحصيل المثبتة',method),field('حساب أو صندوق التحصيل',account),field('مستند إثبات القبض',document),field('مبلغ التحصيل د.ك',value),field('تاريخ التحصيل',date),field('مرجع القبض أو التحويل',reference),field('راجعت المستند وقبض المبلغ، وهذا التحصيل التجاري مستقل عن الإيجار.',review),save);
   if(!available.length)content.append(node('p','لا يوجد استحقاق مبيعات متبقٍ للتحصيل.'));
   else if(!docs.length)content.append(node('p','ارفع مستند إثبات القبض واربطه بهذا العقد أو العقار، ثم أعد عرض السجل.'));
   else content.append(form);
   formControls.push(sale,method,account,document,value,date,reference,review,save);
   form.onsubmit=e=>{e.preventDefault();return run(async()=>{
    if(pending||!data?.can_manage)return;
    const source=available.find(x=>x.id===sale.value),a=data.accounts.find(x=>x.id===account.value),sum=amount(value.value);
    if(!source||!a||a.property_id!==chosen.property_id||a.kind!==(method.value==='cash'?'cashbox':'bank')||a.currency!=='KWD'||!Number.isInteger(a.revision)||!docs.some(x=>x.id===document.value)||!Object.hasOwn(methods,method.value)||reference.value.trim().length<3)throw Error('اختر الاستحقاق وحساب العقار ومستند القبض، وأكمل المرجع.');
    if(fils(sum)<=0n||fils(sum)>fils(source.outstanding))throw Error('مبلغ التحصيل يجب أن يكون موجبًا وألا يتجاوز المتبقي من الاستحقاق.');
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(date.value)||date.value<source.period_end||date.value>today())throw Error('راجع تاريخ التحصيل؛ يجب أن يلي فترة الاستحقاق وألا يتجاوز اليوم.');
    if(!review.checked)throw Error('أكد مراجعة مستند القبض واستقلال التحصيل التجاري عن الإيجار.');
    if(propose('record',{lease_id:selectedLease,account_id:a.id,account_revision:a.revision,method:method.value,occurred_on:date.value,reference:reference.value.trim(),source_document_id:document.value,amount:sum,allocations:[{sale_id:source.id,amount:sum}]},{account:Object.fromEntries(accountKeys.map(k=>[k,a[k]]))}))await send();
   });};
  }else content.append(node('p','التسجيل والعكس متاحان للمدير المخول بالمالية والتوثيق الثنائي.'));
  content.append(node('h3','التحصيل المحفوظ'));if(!data.collections.length)content.append(node('p','لا يوجد تحصيل تجاري محفوظ لهذا العقد.'));
  for(const row of data.collections){
   const c=row.collection,card=node('article');card.append(node('h4',`${c.reference} — ${amount(c.amount)} د.ك`),node('p',`${c.occurred_on} • ${methods[c.method]||c.method} • ${c.account_snapshot?.name||'الحساب المحفوظ'} ${c.account_snapshot?.masked_reference||''}`));
   for(const a of row.allocations){const source=data.sales.find(x=>x.id===a.sale_id);card.append(node('p',`مخصص لاستحقاق ${source?.month?.slice(0,7)||a.sale_id}: ${amount(a.amount)} د.ك`));}
   if(row.reversal)card.append(node('p',`معكوس بتاريخ ${row.reversal.occurred_on} — ${row.reversal.reason}. الأصل محفوظ.`));
   else if(data.can_manage){
    const details=node('details'),form=node('form'),date=input('date'),reason=input(),review=input('checkbox'),save=Object.assign(node('button','تأكيد عكس التحصيل'),{type:'submit'});
    details.append(node('summary','عكس هذا التحصيل'));date.value=today();date.min=c.occurred_on;date.max=today();date.required=true;reason.required=true;reason.minLength=5;reason.maxLength=500;review.required=true;date.onchange=reason.oninput=()=>{review.checked=false;};
    form.append(field('تاريخ عكس التحصيل',date),field('سبب عكس التحصيل',reason),field('راجعت عكس المبلغ كاملًا مع إبقاء الأصل.',review),save);details.append(form);card.append(details);formControls.push(date,reason,review,save);
    form.onsubmit=e=>{e.preventDefault();return run(async()=>{
     if(pending||!data?.can_manage)return;
     if(reason.value.trim().length<5||!review.checked)throw Error('أدخل سببًا واضحًا وأكد مراجعة عكس التحصيل كاملًا.');
     if(!/^20\d{2}-\d{2}-\d{2}$/.test(date.value)||date.value<c.occurred_on||date.value>today())throw Error('تاريخ العكس يجب أن يوافق التحصيل أو يليه وألا يتجاوز اليوم.');
     if(propose('reverse',{collection_id:c.id,occurred_on:date.value,reason:reason.value.trim()},{original:row}))await send();
    });};
   }content.append(card);
  }controls();
 }
 lease.onchange=()=>run(async()=>{if(pending)return;selectedLease=lease.value;await load();});refresh.onclick=()=>run(load);
 recover.onclick=()=>run(async()=>{if(!pending)return;try{if(pending.verifiedAbsent){pending.verifiedAbsent=false;await send();}else await verify();}catch(error){if(denied(error))throw error;status.textContent=error?.message?.startsWith('لم تتطابق')?error.message:'تعذر التحقق الآن. الطلب محفوظ دون إنشاء عملية جديدة.';}});
 d.onDispose(()=>{disposed=true;pending=data=null;selectedLease='';formControls=[];container.replaceChildren();});
 controls();return {load};
}
