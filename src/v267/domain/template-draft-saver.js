const copy=value=>JSON.parse(JSON.stringify(value));

// These rejections are raised before save_draft inserts or updates any row.
// Unknown errors, lost replies and revision conflicts retain the exact request.
const rejectedValidation=new Set([
 'INVALID_TEMPLATE_CONTENT','INVALID_TEMPLATE_CLAUSE','INVALID_TEMPLATE_FIELD',
 'DUPLICATE_TEMPLATE_FIELD','INVALID_TEMPLATE_PRESENTATION','INVALID_DRAFT_REQUEST',
]);
const errorMessage=error=>String(error?.message||error||'');
const isRejectedValidation=error=>rejectedValidation.has(errorMessage(error).trim());

/** Safe, actionable editor status. Returns null for errors the caller handles. */
export function templateDraftErrorMessage(error){
 const message=errorMessage(error).trim();
 if(/(?:REVISION|VERSION|DRAFT).*CONFLICT|revision conflict/i.test(message))return 'ظهرت نسخة محفوظة أحدث؛ تعديلاتك باقية ويمكن حفظها كنسخة مستقلة.';
 if(message==='INVALID_TEMPLATE_CLAUSE')return 'راجع عنوان البند وطوله؛ الحد ٢٠٠ حرف للعنوان و٣٠ ألف حرف للنص. تعديلاتك باقية، ثم اضغط حفظ الآن.';
 if(message==='INVALID_TEMPLATE_FIELD')return 'راجع أسماء الحقول وأنواعها؛ اسم الحقل من حرف إلى ١٠٠ حرف. صحّحها ثم اضغط حفظ الآن.';
 if(message==='DUPLICATE_TEMPLATE_FIELD')return 'يوجد حقل مكرر في النموذج. راجع قائمة الحقول ثم اضغط حفظ الآن.';
 if(message==='INVALID_TEMPLATE_PRESENTATION')return 'راجع مقاس الحقول ومواضعها داخل ورقة A4، ثم اضغط حفظ الآن.';
 if(message==='INVALID_TEMPLATE_CONTENT')return 'راجع اسم النموذج ونوعه وحجم النص وعدد البنود والحقول، ثم اضغط حفظ الآن.';
 if(message==='INVALID_DRAFT_REQUEST')return 'تعذر التحقق من طلب الحفظ. تعديلاتك باقية؛ اضغط حفظ الآن لإعادة المحاولة.';
 if(/timeout|timed out|network|fetch|مهلة.*(?:الاتصال|قراءة)|انقطاع.*الاتصال/i.test(message))return 'لم يتأكد الحفظ بسبب الاتصال. تعديلاتك باقية؛ تحقق من الاتصال ثم اضغط حفظ الآن.';
 return null;
}

// Start only after a genuine edit. Ambiguous failures retry the same payload and
// idempotency key; confirmed validation failures can be corrected in the editor.
export function createTemplateDraftSaver({read,write,onSaved=()=>{},onStatus=()=>{},delay=900}){
 let timer=null,running=null,pending=null,dirty=false,change=0,disposed=false;
 function changed(){if(disposed)return;dirty=true;change++;clearTimeout(timer);onStatus('dirty');timer=setTimeout(()=>flush().catch(()=>{}),delay);}
 async function flush(){
  clearTimeout(timer);if(disposed)return;if(running)return running;
  running=(async()=>{
   while(!disposed&&(dirty||pending)){
    let writeCompleted=false;
    try{
     pending||={data:{...copy(read()),request_id:crypto.randomUUID()},change};
     onStatus('saving');
     const saved=await write(pending.data);writeCompleted=true;
     const savedChange=pending.change;if(disposed)return;
     onSaved(saved);pending=null;dirty=change!==savedChange;onStatus(dirty?'dirty':'saved');
    }catch(error){
     // A failed read-back must not be treated as a server-side rejection: the
     // write may already have committed and its idempotency key must survive.
     if(!writeCompleted&&isRejectedValidation(error))pending=null;
     dirty=true;onStatus('error',error);throw error;
    }
   }
  })();
  try{return await running;}finally{running=null;}
 }
 return {changed,flush,get dirty(){return dirty||!!pending;},get saving(){return !!running;},get uncertain(){return !!pending;},get canDiscard(){return !running&&!pending;},dispose(){disposed=true;clearTimeout(timer);}};
}
