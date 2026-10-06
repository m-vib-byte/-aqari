export async function prepareContractExecutionPackage(session, body) {
 return session.operation(async signal=>{
  session.check();
  if(body.workspaceId!==session.bound.workspace)throw Error('نطاق تجهيز العقد غير صالح.');
  const auth=await window.AQARI_SUPABASE.getSession();session.check();
  if(!auth?.access_token||auth.user?.id!==session.bound.user)throw Error('تغيرت جلسة الدخول.');
  const response=await fetch('/api/contract-execution-package',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},
   body:JSON.stringify(body),signal,credentials:'same-origin',cache:'no-store',redirect:'error'
  });session.check();
  if(!response.ok)throw Error('لم يتأكد تجهيز مستندات الإبرام. لم يتم اعتماد العقد؛ تحقّق قبل إعادة المحاولة.');
  if(!(response.headers.get('Content-Type')||'').includes('application/json'))throw Error('استجابة تجهيز العقد غير صالحة.');
  const text=await response.text();session.check();
  if(text.length>16384)throw Error('استجابة تجهيز العقد غير صالحة.');
  const result=JSON.parse(text),expires=Date.parse(result?.expiresAt);
  if(result?.packageId!==body.packageId||result?.workspaceId!==session.bound.workspace||
   result?.contractRef!==body.contractRef||result?.settlementId!==body.settlementId||
   !Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+30*60*1000)
   throw Error('لم تتأكد مطابقة حزمة مستندات العقد.');
  return result.packageId;
 });
}
