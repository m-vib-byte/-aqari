export function currentScope() {
 const c=window.AQARI_SUPABASE?.context,g=window.AQARI_DATA_GATE?.scope;
 if(!document.documentElement.classList.contains('aqari-auth-unlocked')||!c?.user?.id||!c?.workspace?.id||c.membership?.is_active!==true||c.membership.user_id!==c.user.id||c.membership.workspace_id!==c.workspace.id||g?.userId!==c.user.id||g?.workspaceId!==c.workspace.id)throw Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.');
 if(window.AQARI_PUBLIC_CONFIG?.supabaseUrl!=='https://djkpkkgoibruaezdrchb.supabase.co')throw Error('هذه العملية متاحة في المعاينة المستقلة فقط.');
 return {user:c.user.id,workspace:c.workspace.id,role:c.membership.role};
}
const messages={SOURCE_FIELDS_PENDING:'الاسم أو تواريخ العقد أو بيانات المصدر ما زالت معلقة.',VERIFIED_LEASE_DOCUMENT_REQUIRED:'يلزم عقد موقّع محفوظ ومربوط بالعقد الصحيح.',DOCUMENTED_DEPOSIT_REQUIRED:'أدخل التأمين المثبت بالمستند دون قيمة افتراضية.',APPROVED_DOCUMENT_REQUIRED:'تأكيد التوقيع يتطلب نفس المستند والتأمين المعتمدين.',INVALID_REVIEW_TRANSITION:'تغيرت مرحلة العقد؛ حدّث السجلات.',REVIEW_DETAILS_REQUIRED:'وثّق مرجع المراجعة وسبب الاعتماد.',REVISION_CONFLICT:'تغيرت الإعدادات. حدّث السجلات قبل الحفظ.',ACCESS_DENIED:'لا تملك صلاحية هذه العملية.',SECTION_WRITE_DENIED:'القسم متوقف أو صلاحية الحفظ غير متاحة.',INVALID_LABEL:'راجع المسمى؛ النص يجب ألا يحتوي رموز HTML.',DOCUMENT_ENTITY_NOT_FOUND:'احفظ السجل الصحيح أولاً قبل رفع المستند.',STORED_FILE_NOT_CONFIRMED:'لم يتأكد الملف في التخزين. حدّث السجلات قبل إعادة الرفع.',DOCUMENT_IMMUTABLE:'النسخة الأصلية محفوظة ولا يمكن استبدالها.'};
export function safeError(e){return messages[String(e?.message||'').split(':')[0]] || (/^[\u0600-\u06ff]/.test(e?.message||'')?e.message:'تعذر إكمال العملية أو تأكيدها. حدّث السجلات وتحقق قبل إعادة المحاولة.');}
export function createSession(){
 const bound=currentScope(),jobs=new Set();let closed=false,client;
 const check=()=>{if(closed||JSON.stringify(currentScope())!==JSON.stringify(bound))throw Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.');};
 async function connect(){check();client=await window.AQARI_SUPABASE.getClient();check();return client;}
 async function request(query){check();const controller=new AbortController();jobs.add(controller);let timer;
  try{const work=query.abortSignal(controller.signal);const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('انتهت مهلة الاتصال. حدّث السجلات للتحقق.'));},20000);});const r=await Promise.race([work,timeout]);check();if(r.error)throw r.error;return r.data;}finally{clearTimeout(timer);jobs.delete(controller);}}
 function close(){closed=true;for(const job of jobs)job.abort();jobs.clear();}
 async function storage(method,path,body){
  check();if(!path.startsWith(bound.workspace+'/')||path.includes('..')||!['POST','GET'].includes(method))throw Error('مسار المستند غير صالح.');
  const controller=new AbortController();jobs.add(controller);let timer;
  try{
   const work=(async()=>{const auth=await window.AQARI_SUPABASE.getSession();check();if(!auth?.access_token||auth.user?.id!==bound.user)throw Error('تغيرت جلسة الدخول.');
    const suffix=path.split('/').map(encodeURIComponent).join('/');
    const response=await fetch('https://djkpkkgoibruaezdrchb.supabase.co/storage/v1/object/'+(method==='GET'?'authenticated/':'')+'aqari-documents/'+suffix,{
     method,body,headers:{apikey:window.AQARI_PUBLIC_CONFIG.supabasePublishableKey,Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':body.type,'x-upsert':'false'}:{})},
     signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
    check();if(!response.ok){const error=Error('تعذر تأكيد تخزين الملف. حدّث السجلات قبل إعادة الرفع.');error.status=response.status;throw error;}return method==='GET'?response.blob():response.json();})();
   return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('انتهت مهلة رفع أو قراءة المستند. حدّث السجلات للتحقق.'));},20000);})]);
  }finally{clearTimeout(timer);jobs.delete(controller);}
 }
 return {bound,connect,check,request,storage,close,get client(){return client;}};
}
