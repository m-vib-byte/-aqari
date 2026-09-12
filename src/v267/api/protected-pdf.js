export async function readProtectedPDF(dialog,{getSession,fetcher,body},timeoutMs=20000){
 const controller=new AbortController();let timer;
 const stopped=new Promise((_,reject)=>{
  controller.signal.addEventListener('abort',()=>reject(Error('تعذر تصدير الكشف.')),{once:true});
 });
 const unregister=dialog.onDispose(()=>controller.abort());
 function check(){dialog.session.check();if(dialog.closed||controller.signal.aborted)throw Error('تغيرت جلسة الدخول.');}
 try{
  timer=setTimeout(()=>controller.abort(),timeoutMs);
  return await Promise.race([stopped,(async()=>{
   check();const auth=await getSession();check();
   if(auth?.user?.id!==dialog.session.bound.user||!auth.access_token)throw Error('تغيرت جلسة الدخول.');
   const response=await fetcher('/api/property-statement',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify(body),signal:controller.signal,cache:'no-store',redirect:'error'});
   // Preserve the denial so the dialog can clear cached private data on 401/403.
   check();if(!response.ok){const error=Error('تعذر تصدير الكشف.');error.status=response.status;throw error;}
   const blob=await response.blob();check();
   if(blob.type!=='application/pdf')throw Error('تعذر تأكيد ملف PDF.');
   const final=await getSession();check();
   if(final?.user?.id!==auth.user.id)throw Error('تغيرت جلسة الدخول.');
   return blob;
  })()]);
 }finally{clearTimeout(timer);unregister();controller.abort();}
}
