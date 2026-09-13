export async function readOperationalReport(dialog,{kind,format,propertyId,month,getSession=()=>window.AQARI_SUPABASE.getSession(),fetcher=fetch},timeoutMs=20000){
 if(!['collection','collectors'].includes(kind)||!['json','pdf'].includes(format)||!propertyId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('تعذر التحقق من طلب التقرير.');
 const controller=new AbortController();let timer;const unregister=dialog.onDispose(()=>controller.abort());
 const check=()=>{dialog.session.check();if(dialog.closed||controller.signal.aborted)throw Error('تغيرت جلسة الدخول.');};
 try{
  timer=setTimeout(()=>controller.abort(),timeoutMs);check();const auth=await getSession();check();
  if(auth?.user?.id!==dialog.session.bound.user||!auth.access_token)throw Error('تغيرت جلسة الدخول.');
  const response=await fetcher('/api/operational-report',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspaceId:dialog.session.bound.workspace,propertyId,month,report:kind,format}),signal:controller.signal,cache:'no-store',redirect:'error'});
  check();if(!response.ok){const error=Error(response.status===409?'تغيرت البيانات أثناء التصدير؛ أعد المحاولة.':'تعذر تصدير التقرير.');error.status=response.status;throw error;}
  const final=await getSession();check();if(final?.user?.id!==auth.user.id)throw Error('تغيرت جلسة الدخول.');
  if(format==='pdf'){const blob=await response.blob();if(blob.type!=='application/pdf')throw Error('تعذر تأكيد ملف PDF.');return blob;}
  const data=await response.json();if(data?.workspaceId!==dialog.session.bound.workspace||data?.propertyId!==propertyId||data?.month!==month||data?.report!==kind)throw Error('تعذر تأكيد لقطة التقرير.');return data;
 }finally{clearTimeout(timer);unregister();controller.abort();}
}
