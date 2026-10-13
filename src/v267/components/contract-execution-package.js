export async function assertContractExecutionRenderer(session) {
 return session.operation(async signal=>{
  session.check();
  const response=await fetch('/api/contract-execution-package',{
   method:'GET',signal,credentials:'same-origin',cache:'no-store',redirect:'error'
  });session.check();
  const unavailable=()=>Object.assign(Error('خدمة إصدار وأرشفة العقد غير جاهزة. لم يتم اعتماد العقد أو حجز رقم وصل.'),{code:'EXECUTION_RENDERER_UNAVAILABLE'});
  if(!response.ok||!(response.headers.get('Content-Type')||'').includes('application/json'))throw unavailable();
  const raw=await response.text();session.check();
  let result;try{if(raw.length<=1024)result=JSON.parse(raw);}catch{}
  if(result?.configured!==true)throw unavailable();
 });
}

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
  if(!response.ok){
   const failure=Object.assign(Error('لم يتأكد تجهيز مستندات الإبرام. لم يتم اعتماد العقد؛ تحقّق قبل إعادة المحاولة.'),{status:response.status});
   if(response.status===403&&(response.headers?.get('Content-Type')||'').includes('application/json')){
    let text;try{text=await response.text();}catch{session.check();throw failure;}session.check();
    let error;try{if(text.length<=16384)error=JSON.parse(text);}catch{}
    // The endpoint exposes these two source-read challenges only before its commit.
    if(error?.code==='42501'&&['MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'].includes(error?.error))
     throw Object.assign(Error(error.error),{status:403,code:'42501'});
   }
   throw failure;
  }
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
