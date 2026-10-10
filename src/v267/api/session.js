import {isUiError} from '../components/ui-error.js';
export function currentScope() {
 const c=window.AQARI_SUPABASE?.context,g=window.AQARI_DATA_GATE?.scope;
 if(!document.documentElement.classList.contains('aqari-auth-unlocked')||!c?.user?.id||!c?.workspace?.id||c.membership?.is_active!==true||c.membership.user_id!==c.user.id||c.membership.workspace_id!==c.workspace.id||g?.userId!==c.user.id||g?.workspaceId!==c.workspace.id)throw Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.');
 if(window.AQARI_PUBLIC_CONFIG?.supabaseUrl!=='https://ofgmcsmxmdswlovsckqs.supabase.co')throw Error('هذه العملية متاحة في المعاينة المستقلة فقط.');
 return {user:c.user.id,workspace:c.workspace.id,role:c.membership.role};
}
const messages={PARTNER_STAFF_CONFLICT:'لا يمكن ربط حساب موظف عام بصلاحية شريك محدودة. استخدم بريداً مستقلاً للشريك.',INVALID_PARTNER_ACCESS:'راجع البريد والاسم والعقار وسبب التعديل.',SOURCE_FIELDS_PENDING:'الاسم أو تواريخ العقد أو بيانات المصدر ما زالت معلقة.',VERIFIED_LEASE_DOCUMENT_REQUIRED:'يلزم عقد موقّع محفوظ ومربوط بالعقد الصحيح.',DOCUMENTED_DEPOSIT_REQUIRED:'أدخل التأمين المثبت بالمستند دون قيمة افتراضية.',APPROVED_DOCUMENT_REQUIRED:'تأكيد التوقيع يتطلب نفس المستند والتأمين المعتمدين.',INVALID_REVIEW_TRANSITION:'تغيرت مرحلة العقد؛ حدّث السجلات.',REVIEW_DETAILS_REQUIRED:'وثّق مرجع المراجعة وسبب الاعتماد.',REVISION_CONFLICT:'تغيرت الإعدادات. حدّث السجلات قبل الحفظ.',ACCESS_DENIED:'لا تملك صلاحية هذه العملية.',SECTION_WRITE_DENIED:'القسم متوقف أو صلاحية الحفظ غير متاحة.',INVALID_LABEL:'راجع المسمى؛ النص يجب ألا يحتوي رموز HTML.',DOCUMENT_ENTITY_NOT_FOUND:'احفظ السجل الصحيح أولاً قبل رفع المستند.',STORED_FILE_NOT_CONFIRMED:'لم يتأكد الملف في التخزين. حدّث السجلات قبل إعادة الرفع.',DOCUMENT_IMMUTABLE:'النسخة الأصلية محفوظة ولا يمكن استبدالها.'};
Object.assign(messages,{
 UNIT_NOT_READY:'الوحدة غير جاهزة للتأجير. افتح جاهزية الوحدات واحفظ معاينة موثقة قبل تثبيت العقد.',
 PAYMENT_CYCLE_REQUIRED:'اختر دورية السداد قبل تثبيت العقد.',
 MFA_REQUIRED:'أكمل التحقق الثنائي ثم أعد محاولة الحفظ. بقيت البيانات المدخلة في هذه النافذة.',
 MFA_RECENT_REAUTH_REQUIRED:'جدّد التحقق الثنائي ثم أعد محاولة الحفظ؛ يلزم تحقق خلال آخر 15 دقيقة. بقيت البيانات المدخلة في هذه النافذة.',
 INVALID_REPORT_FILTERS:'راجع العقار والفترة المحددة قبل حفظ فلاتر التقرير.',
 REPORT_FILTERS_CHANGED:'تغيرت فلاتر التقرير من جلسة أخرى؛ أعد فتح التقرير للتحقق من الاختيارات المحفوظة.',
 HR_COST_ALLOCATION_REQUIRED:'أكمل توزيع تكلفة الموظفين على عقاراتهم بنسبة إجمالية 100% قبل عرض الكشف أو اعتماد الشهر.',
 INVALID_ALLOCATION_SHARE:'أدخل نسبة أكبر من صفر ولا تتجاوز 100، بخانتين عشريتين كحد أقصى.',
 ALLOCATIONS_REQUIRED:'أدخل نسب توزيع تكلفة الموظف على العقارات.',
 ALLOCATIONS_MUST_TOTAL_100:'يجب أن يكون مجموع نسب توزيع تكلفة الموظف 100% تمامًا.',
 INVALID_ALLOCATION_PROPERTY:'اختر عقارات الموظف دون تكرار.',
 INVALID_HANDOVER:'أكمل أسماء الأطراف والوقت وعدد النسخ وإثبات التسليم بالقيم الصحيحة.',
 HANDOVER_VERIFIED_DOCUMENT_REQUIRED:'يلزم مستند أصلي محفوظ ومتحقق منه قبل تسجيل التسليم.',
 HANDOVER_VERIFIED_EVIDENCE_REQUIRED:'اختر إثبات تسليم محفوظًا ضمن السجل نفسه.',
 HANDOVER_IDEMPOTENCY_CONFLICT:'معرف التسليم محفوظ ببيانات مختلفة. راجع السجل قبل إعادة المحاولة.',
 HANDOVER_ALREADY_VOID:'سبق إلغاء هذا القيد. حدّث سجل التسليم.',
 HANDOVER_NOT_FOUND:'تعذر العثور على قيد التسليم في المستند المحدد.',
 HANDOVER_IMMUTABLE:'قيد التسليم محفوظ؛ استخدم الإلغاء الموثق ثم أضف قيدًا صحيحًا.',
 UNIT_NOT_READY:'الوحدة غير جاهزة للتأجير. سجّل معاينة معتمدة في جاهزية الوحدات قبل إنشاء العقد أو تمديده.',
 PROPERTY_ARCHIVED_NEW_ACTIVITY_FORBIDDEN:'العقار مؤرشف. أعد تفعيله قبل إنشاء وحدة أو عقد جديد.',
 PROPERTY_LIFECYCLE_REVISION_CONFLICT:'تغيرت حالة العقار. حدّث الحالة قبل إعادة المحاولة.',
 PROPERTY_LIFECYCLE_NO_CHANGE:'الحالة المطلوبة محفوظة مسبقًا. حدّث الحالة.',
 INVALID_READINESS_RECORD:'أكمل بيانات معاينة الوحدة بالقيم الصحيحة.',
 INVALID_READINESS_DATE:'لا يمكن تسجيل معاينة بتاريخ مستقبلي.',
 READINESS_IDEMPOTENCY_CONFLICT:'معرف المعاينة محفوظ بمحتوى مختلف. حدّث السجل وتحقق قبل إعادة المحاولة.',
 READINESS_HISTORY_IMMUTABLE:'المعاينة الأصلية محفوظة؛ سجّل معاينة جديدة لتغيير حالة الجاهزية.',
 PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED:'يتضمن وصل في هذا العقار تخصيصًا تجاريًا. يحتاج مصدره مطابقة منفصلة؛ لم يحتسب كتوزيع إيجاري.',
 PARTNER_PERIOD_ALREADY_DISTRIBUTED:'سبق توزيع العقار في هذا الشهر؛ لا يمكن تكراره حتى بعد عكسه.',
 PARTNER_ALREADY_REVERSED:'سبق عكس هذا التوزيع؛ أعد قراءة السجل.',
 PARTNER_SOURCE_REVIEW_REQUIRED:'هذا الشهر يحتاج إقفالًا مفصلًا ومطابقًا من السجل المالي. الإقفال القديم أو غير المتطابق لا يسمح بالتوزيع.',
 PARTNER_SHARES_REVIEW_REQUIRED:'فعّل سجل الحصص وحدد حصصًا موثقة مجموعها 100% أولًا.',
 PARTNER_LEGACY_FINANCE_REVIEW_REQUIRED:'لهذا العقار توزيعات أو مدفوعات قديمة تحتاج مطابقة منفصلة قبل استخدام الدفتر الجديد.',
 PARTNER_REVIEW_STALE:'تغيرت المراجعة أو الحصص؛ أعد عرض المصدر وراجع القيم قبل الاعتماد.',
 PARTNER_SHARES_CHANGED_AFTER_REVIEW:'تغيرت الحصص بعد المراجعة. اعتمد مراجعة جديدة موثقة قبل التوزيع.',
 PARTNER_EXPLICIT_RECONCILIATION_REQUIRED:'مبالغ المطابقة المدخلة لا تطابق المصدر. راجع المستند وأدخل المقبوض والمصروف والاحتياطي، بما فيها الصفر.',
 PARTNER_DOCUMENT_UNVERIFIED:'اختر مستند مطابقة مرفوعًا ومتحققًا منه للعقار نفسه.',
 PARTNER_RECIPIENT_ACCESS_REQUIRED:'أحد حسابات الشركاء غير فعال أو غير مؤكد لهذا العقار؛ راجع صلاحياته.',
 PARTNER_PROPERTY_SHARES_BINDING_CONFLICT:'سجل الحصص مرتبط بعقار آخر؛ راجع ربط الحصص.',
 PARTNER_DISTRIBUTED_SOURCE_IMMUTABLE:'سبق توزيع هذا المصدر. تبقى مراجعته ثابتة، والتصحيح بعكس مستقل.',
 PARTNER_RETRY_CONFLICT:'معرف المحاولة مرتبط ببيانات مختلفة. أعد التحقق من العملية السابقة.',
 DOCUMENT_SOURCE_MISMATCH:'تغيرت بيانات المصدر المالي. أعد اختيار الحركة المحفوظة قبل الإصدار.',
 DOCUMENT_CONFIRMED_PAYMENT_REQUIRED:'اختر دفعة إيجار مؤكدة وغير ملغاة للعقد المحدد.',
 DOCUMENT_CONFIRMED_DEPOSIT_REQUIRED:'اختر حركة تأمين مؤكدة من النوع المطلوب للعقد نفسه.',
 DOCUMENT_APPROVED_EXPENSE_REQUIRED:'اختر مصروفاً معتمداً للعقار المحدد.',
 DOCUMENT_APPROVED_SOURCE_REQUIRED:'أمر الشغل لم يعتمد بعد أو لم يعد صالحاً للإصدار.',
 DOCUMENT_APPROVED_SETTLEMENT_REQUIRED:'أكمل اعتماد التسوية وبراءة الذمة في سجل الإخلاء أولاً.',
 DOCUMENT_SUPPLEMENTAL_SETTLEMENT_REVIEW_REQUIRED:'التسوية تحتاج مطابقة التزامات الخدمات والقضايا والقيود الإضافية قبل إصدار المستند.',
 DOCUMENT_OPEN_UTILITIES_REVIEW_REQUIRED:'توجد فاتورة خدمات غير محسومة على العقار. راجعها قبل إصدار التسوية النهائية.',
 DOCUMENT_OPEN_LEGAL_REVIEW_REQUIRED:'توجد قضية مفتوحة مرتبطة بالعقد. راجع التزاماتها قبل إصدار التسوية النهائية.',
 DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED:'رصيد المستأجر الدائن يحتاج مطابقة وإظهارًا صحيحًا قبل إصدار التسوية النهائية.',
 COMMERCIAL_COLLECTION_ACCOUNT_CHANGED:'تغيرت مراجعة الحساب. حدّث السجل وراجع الحساب من جديد.',
 COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH:'اختر حسابًا نشطًا من العقار نفسه يناسب طريقة التحصيل.',
 COMMERCIAL_ALLOCATION_EXCEEDS_BALANCE:'المبلغ يتجاوز المتبقي من الاستحقاق. حدّث السجل.',
 COMMERCIAL_ALLOCATION_SOURCE_INVALID:'الاستحقاق غير متاح للتحصيل. حدّث السجل.',
 COMMERCIAL_COLLECTION_DOCUMENT_UNVERIFIED:'اختر مستند قبض محفوظًا ومتحققًا منه للعقد أو العقار نفسه.',
 COMMERCIAL_COLLECTION_BEFORE_CHARGE:'تاريخ التحصيل يجب أن يوافق نهاية فترة الاستحقاق أو يليها.',
 COMMERCIAL_COLLECTION_AFTER_CLEARANCE:'العقد حصل على براءة ذمة أو أُغلق؛ لا يقبل تحصيلًا أو عكسًا جديدًا.',
 COMMERCIAL_COLLECTION_RETRY_CONFLICT:'بيانات العملية السابقة مختلفة. حدّث السجل وراجع التحصيل قبل تسجيل عملية أخرى.',
 COMMERCIAL_SALE_HAS_COLLECTION:'يوجد تحصيل مخصص لهذا الاستحقاق. اعكس التحصيل الموثق أولًا قبل عكس الاستحقاق.',
 COMMERCIAL_COLLECTION_LEDGER_MISMATCH:'تعذر مطابقة الاستحقاقات والتحصيلات وتخصيصاتها. راجع السجل قبل اعتماد التسوية.',
 COMMERCIAL_ALLOCATION_TOTAL_MISMATCH:'مجموع التخصيص لا يطابق مبلغ التحصيل.',
 COMMERCIAL_COLLECTION_ALREADY_REVERSED:'سبق عكس التحصيل. حدّث السجل لعرض القيد المحفوظ.',
 INVALID_COMMERCIAL_COLLECTION_DATE:'راجع تاريخ التحصيل أو العكس؛ يجب ألا يتجاوز اليوم.',
 OPENING_SOURCE_UNVERIFIED:'المصدر غير متاح أو لم تتطابق بصمته المحفوظة؛ اختر ملفًا مؤكد الحفظ ثم تحقّق منه.',
 OPENING_SOURCE_TOTALS_MISMATCH:'مدين المصدر أو دائنه لا يطابق القيود المختارة؛ راجع المبلغين كلًّا على حدة.',
 OPENING_REVIEW_REVISION_CONFLICT:'صدرت مراجعة أحدث؛ حدّث السجلات قبل اعتماد التصحيح.',
 OPENING_CUTOFF_REQUIRED:'اختر تاريخ القطع صراحةً؛ تشمل المراجعة نهاية اليوم المحدد.',
 OPENING_RETRY_CONFLICT:'معرّف المراجعة مرتبط بطلب أو مدير آخر؛ راجع الحفظ السابق ولا تكرر الاعتماد.',
 OPENING_SOURCE_ALREADY_REVIEWED:'سبق حفظ هذه المطابقة نفسها؛ افتح المراجعة السابقة.',
 OPENING_CORRECTION_REASON_REQUIRED:'اربط آخر مراجعة محفوظة وأدخل سبب التصحيح.',
 OPENING_ENTRY_SCOPE_OR_CUTOFF_CONFLICT:'اختر قيودًا افتتاحية تخص المستأجر ونطاق المستند، ومؤرخة حتى نهاية يوم القطع.',
 OPENING_ENTRIES_REQUIRED:'اختر قيدًا افتتاحيًا واحدًا على الأقل دون تكرار.',
 OPENING_SOURCE_ATTESTATION_REQUIRED:'تحقّق من الملف الأصلي ثم أقر بمطابقته للمصدر قبل الاعتماد.',
 DOCUMENT_OPENING_RECONCILIATION_REQUIRED:'يلزم اعتماد تاريخ بداية الرصيد الافتتاحي قبل إصدار كشف الحساب؛ لن يضاف الإيجار القديم مرتين.',
 DOCUMENT_COMMERCIAL_RECONCILIATION_REQUIRED:'يلزم إقفال مستحقات السماح والمبيعات والخدمات التجارية قبل إصدار الكشف.',
 DOCUMENT_UNALLOCATED_DEBT_REVIEW_REQUIRED:'توجد مديونية للمستأجر غير موزعة على عقد؛ يلزم تسويتها قبل الإصدار.',
 DOCUMENT_CREDIT_TRANSFER_REVIEW_REQUIRED:'توجد تسوية رصيد بين عقود تحتاج مطابقة قبل إصدار الكشف.',
 DOCUMENT_NO_ACTUAL_DEBT:'لا توجد مديونية فعلية تبرر إصدار الإشعار.',
 DOCUMENT_SOURCE_CANNOT_CHANGE:'لا يمكن تغيير المصدر المرتبط بمستند محفوظ.',
 DOCUMENT_IDEMPOTENCY_CONFLICT:'المعرف مستخدم بمحتوى مختلف؛ راجع الأرشيف قبل محاولة إصدار أخرى.',
 STALE_DOCUMENT_VERSION:'صدر تعديل أحدث لهذا المستند. أعد فتح النسخة الحالية قبل التصحيح.',
 INVALID_DOCUMENT_RANGE:'راجع ترتيب التواريخ وفترة الكشف والمبالغ المستحقة.',
 INVALID_DOCUMENT_FIELD:'أكمل حقول النموذج بالقيم الصحيحة قبل الحفظ.',
 DOCUMENT_OPTIONS_LIMIT:'تجاوز عدد السجلات حد العرض؛ يلزم تضييق نطاق السجلات قبل الإصدار.'
});
export function safeError(e){if(isUiError(e))return e.message;if(e?.code==='23505'&&String(e?.message||'').includes('aqari_official_unique_financial_source'))return 'سبق إصدار مستند لهذه الحركة. افتحه من الأرشيف لإنشاء إصدار مصحح.';return messages[String(e?.message||'').split(':')[0]] || (/^[\u0600-\u06ff]/.test(e?.message||'')?e.message:'تعذر إكمال العملية أو تأكيدها. حدّث السجلات وتحقق قبل إعادة المحاولة.');}
export function createSession(){
 const bound=currentScope(),jobs=new Set();let closed=false,client;
 const check=()=>{if(closed||JSON.stringify(currentScope())!==JSON.stringify(bound))throw Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.');};
 async function connect(){
  check();const controller=new AbortController();jobs.add(controller);let timer,aborted;
  try{
   const stopped=new Promise((_,reject)=>{
    aborted=()=>reject(Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.'));
    controller.signal.addEventListener('abort',aborted,{once:true});
    timer=setTimeout(()=>{reject(Error('انتهت مهلة الاتصال. حدّث السجلات للتحقق.'));controller.abort();},20000);
   });
   // Check before starting and after resolving: an old attempt must never store
   // its client after timeout, close, account change or a successful retry.
   const work=Promise.resolve().then(()=>{check();return window.AQARI_SUPABASE.getClient();});
   const candidate=await Promise.race([work,stopped]);check();client=candidate;return client;
  }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',aborted);jobs.delete(controller);}
 }
 async function waitForRequest(work,controller,timeoutMessage){
  let timer,aborted;
  try{
   // The provider may ignore abort while resolving auth or reading a body.
   // Close must still settle the caller immediately and discard any late result.
   const stopped=new Promise((_,reject)=>{
    aborted=()=>reject(Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.'));
    controller.signal.addEventListener('abort',aborted,{once:true});
    if(controller.signal.aborted){aborted();return;}
    timer=setTimeout(()=>{reject(Error(timeoutMessage));controller.abort();},20000);
   });
   return await Promise.race([work,stopped]);
  }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',aborted);}
 }
 async function request(query){check();const controller=new AbortController();jobs.add(controller);
  try{const r=await waitForRequest(query.abortSignal(controller.signal),controller,'انتهت مهلة الاتصال. حدّث السجلات للتحقق.');check();if(r.error){const error=Object.assign(new Error(r.error.message||'REQUEST_FAILED'),r.error);if(Number.isInteger(r.status))error.status=r.status;throw error;}return r.data;}finally{jobs.delete(controller);}}
 function close(){closed=true;for(const job of jobs)job.abort();jobs.clear();}
 async function operation(task){
  check();const controller=new AbortController();jobs.add(controller);
  try{const work=Promise.resolve().then(()=>{check();return task(controller.signal);});
   const result=await waitForRequest(work,controller,'انتهت مهلة قراءة المستند. أعد المحاولة للتحقق من النسخة المحفوظة.');check();return result;
  }finally{jobs.delete(controller);}
 }
 async function storage(method,path,body,bucket='aqari-documents'){
  check();if(!['aqari-documents','aqari-hr-private','aqari-maintenance-private'].includes(bucket)||!path.startsWith(bound.workspace+'/')||path.includes('..')||!['POST','GET'].includes(method))throw Error('مسار المستند غير صالح.');
  const controller=new AbortController();jobs.add(controller);
  try{
   const work=(async()=>{const auth=await window.AQARI_SUPABASE.getSession();check();if(!auth?.access_token||auth.user?.id!==bound.user)throw Error('تغيرت جلسة الدخول.');
    const suffix=path.split('/').map(encodeURIComponent).join('/');
    const response=await fetch('https://ofgmcsmxmdswlovsckqs.supabase.co/storage/v1/object/'+(method==='GET'?'authenticated/':'')+bucket+'/'+suffix,{
     method,body,headers:{apikey:window.AQARI_PUBLIC_CONFIG.supabasePublishableKey,Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':body.type,'x-upsert':'false'}:{})},
     signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
    check();if(!response.ok){const error=Error('تعذر تأكيد تخزين الملف. حدّث السجلات قبل إعادة الرفع.');error.status=response.status;throw error;}return method==='GET'?response.blob():response.json();})();
   const result=await waitForRequest(work,controller,'انتهت مهلة رفع أو قراءة المستند. حدّث السجلات للتحقق.');
   // Revalidate after the complete body, not only after the response headers.
   check();return result;
  }finally{jobs.delete(controller);}
 }
 return {bound,connect,check,request,storage,operation,close,get client(){return client;}};
}
