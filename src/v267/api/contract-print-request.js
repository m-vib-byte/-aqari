export async function fetchContractPrint(d,prepared){
 return d.session.operation(async signal=>{
  const auth=await d.session.client.auth.getSession();d.session.check();
  const session=auth?.data?.session;
  if(!session?.access_token||session.user?.id!==d.session.bound.user)throw Error('تغيرت جلسة الدخول؛ أعد فتح العقد.');
  const response=await fetch('/api/contract-print',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({workspaceId:d.session.bound.workspace,contractRef:prepared.contractId,count:prepared.count,mode:prepared.mode,expectedRevision:prepared.revision}),signal,credentials:'same-origin',redirect:'error',cache:'no-store'});d.session.check();
  if(!response.ok)throw Error(response.status===409?'تغيّر العقد؛ أعد فتحه وتجهيز النسخة.':response.status===403?'تعذر تأكيد الصلاحية أو اعتماد العقد.':'تعذر توليد PDF؛ أعد المحاولة.');
  if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw Error('الملف المعاد ليس PDF.');
  const blob=await response.blob();d.session.check();
  if(blob.size<5||blob.size>10485760||await blob.slice(0,5).text()!=='%PDF-')throw Error('ملف PDF غير صالح.');
  const latest=await d.session.client.auth.getSession();d.session.check();
  if(latest?.data?.session?.user?.id!==d.session.bound.user||!latest?.data?.session?.access_token)throw Error('تغيرت جلسة الدخول؛ أعد فتح العقد.');
  return blob;
 });
}
