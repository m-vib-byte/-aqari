// Bound the entire read/render operation, including auth and response bodies.
// These API actions only return bytes; document persistence uses verified upload.
export async function requestPdfField(dialog,{body,signal,errors={},translate=x=>x,fetcher=fetch},timeoutMs=45000){
 const controller=new AbortController();let timer,timedOut=false;
 const abort=()=>controller.abort();
 const stopped=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>{
  const error=Error(translate(timedOut?'انتهت مهلة معالجة العقد. بياناتك باقية في الشاشة؛ أعد المحاولة.':'أُلغيت معالجة العقد.'));
  error.name=timedOut?'TimeoutError':'AbortError';reject(error);
 },{once:true}));
 const unregister=dialog.onDispose(abort);
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const check=()=>{dialog.session.check();if(dialog.closed||controller.signal.aborted)throw Error(translate('أُلغيت معالجة العقد.'));};
 const getAuth=async()=>{
  check();const auth=(await dialog.session.client.auth.getSession())?.data?.session;check();
  if(!auth?.access_token||auth.user?.id!==dialog.session.bound.user)throw Error(translate('تغيرت جلسة الدخول.'));
  return auth;
 };
 try{
  timer=setTimeout(()=>{timedOut=true;abort();},timeoutMs);
  return await Promise.race([stopped,(async()=>{
   const auth=await getAuth();
   const response=await fetcher('/api/pdf-field-template',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});check();
   if(!response.ok){let info={};try{info=await response.json();}catch{}check();const error=Error(translate(errors[info.error]||'تعذر معالجة النموذج. راجع الملف والحقول ثم أعد المحاولة.'));error.status=response.status;throw error;}
   const json=['inspect','text'].includes(body.action),expected=json?'application/json':['page','filled_page'].includes(body.action)?'image/png':'application/pdf';
   if(response.headers.get('Content-Type')?.split(';')[0]!==expected)throw Error(translate('استجابة الملف غير صالحة.'));
   const result=await (json?response.json():response.blob());check();
   await getAuth();check();return result;
  })()]);
 }finally{clearTimeout(timer);unregister();signal?.removeEventListener('abort',abort);abort();}
}
