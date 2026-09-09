const cfg=window.AQARI_PUBLIC_CONFIG,$=id=>document.getElementById(id),notice=message=>{$('notice').textContent=message;};
if(cfg?.supabaseUrl!=='https://djkpkkgoibruaezdrchb.supabase.co'||cfg.releaseStage!=='preview')throw Error('STAGING_REQUIRED');
const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:cfg.supabaseAuthStorageKey+'-tenant'}});
let snapshot=null,epoch=0,busy=false,operation=0,readVersion=0,userId=null,saveUncertain=false;
const receiptUrls=new Set(),jobs=new Set();
const safeError=e=>/^[\u0600-\u06ff]/.test(e?.message||'')?e.message:'تعذر إكمال العملية أو تأكيدها. أعد تحميل الصفحة وتحقق من السجلات.';
function releaseReceipts(){for(const url of receiptUrls)URL.revokeObjectURL(url);receiptUrls.clear();}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('انتهت مهلة الاتصال.')),20000);})]);}finally{clearTimeout(timer);}}
async function request(work){
 const controller=new AbortController();jobs.add(controller);let timer,rejectAbort;
 const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('تغيرت الجلسة أو انتهت مهلة الاتصال.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
 timer=setTimeout(()=>controller.abort(),20000);
 try{return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw Error('تغيرت الجلسة.');return work(controller.signal);}),aborted]);}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);jobs.delete(controller);}
}
function lock(value){busy=value;for(const b of document.querySelectorAll('button'))b.disabled=b.id==='tenantLogout'?false:value;if(saveUncertain)$('maintenanceSave').disabled=true;}
function start(){const token=++operation;lock(true);return token;}
function finish(token){if(token===operation)lock(false);}
function clear(){snapshot=null;releaseReceipts();$('content').hidden=true;$('auth').hidden=false;$('tenantName').textContent='';$('maintenanceDescription').value='';$('tenantPassword').value='';for(const id of ['tenantLeases','tenantPayments','tenantRequests','maintenanceLease'])$(id).replaceChildren();$('maintenanceForm').hidden=true;}
function invalidate(){epoch++;readVersion++;for(const job of jobs)job.abort();clear();saveUncertain=false;operation++;lock(false);}
const current=e=>e===epoch;
function items(target,rows,format){$(target).replaceChildren();if(!rows.length){const p=document.createElement('p');p.textContent='لا توجد سجلات محفوظة.';$(target).append(p);}for(const r of rows){const p=document.createElement('p');p.className='item';p.textContent=format(r);$(target).append(p);}}
async function session(){const {data,error}=await bounded(client.auth.getSession());if(error)throw Error('تعذر التحقق من جلسة الدخول.');return data.session;}
async function refresh(){
 const e=epoch,version=++readVersion;clear();const auth=await session();if(!current(e)||version!==readVersion)return null;
 if(!auth){clear();return null;}if(userId&&userId!==auth.user.id){invalidate();return null;}userId=auth.user.id;
 const {data,error}=await request(signal=>client.rpc('aqari_tenant_portal_snapshot').abortSignal(signal));if(!current(e)||version!==readVersion)return null;
 if(error)throw Error('تعذر فتح ملف المستأجر. تأكد من تأكيد بريدك وربطه بملفك لدى الإدارة.');
 const verified=await session();if(!current(e)||version!==readVersion)return null;
 if(verified?.user.id!==auth.user.id){invalidate();return null;}
 if(data?.account?.user_id!==auth.user.id||data.account.is_active!==true||!data.account.workspace_id||data.tenant?.id!==data.account.tenant_id||data.tenant.workspace_id!==data.account.workspace_id||!['leases','payments','maintenance'].every(k=>Array.isArray(data[k])))throw Error('تعذر تأكيد ارتباط الملف بحسابك.');
 snapshot=data;$('auth').hidden=true;$('content').hidden=false;$('tenantName').textContent=data.tenant.full_name;
 items('tenantLeases',data.leases,l=>`العقد ${l.contract_no} • الوحدة ${l.snapshot.unit} • ${l.snapshot.property}\nالإيجار ${Number(l.monthly_rent).toFixed(3)} د.ك • من ${l.start_date} إلى ${l.end_date}`);
 releaseReceipts();items('tenantPayments',data.payments,p=>`وصل إيجار ${p.reference} • ${Number(p.amount).toFixed(3)} د.ك • ${p.paid_at}`);
 for(const [i,payment] of data.payments.entries()){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='فتح وصل الإيجار';button.onclick=()=>receipt(payment,button);$('tenantPayments').children[i].append(button);}
 const states={received:'تم الاستلام',assigned:'تم التكليف',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى'};
 items('tenantRequests',data.maintenance,m=>`طلب ${m.request_no} • ${states[m.status]||'غير معروف'}\n${m.description}`);
 $('maintenanceLease').replaceChildren();const today=new Date(Date.now()+10800000).toISOString().slice(0,10);
 for(const l of data.leases.filter(l=>l.status==='signed'&&l.start_date<=today&&l.end_date>=today)){const option=document.createElement('option');option.value=l.id;option.textContent=`العقد ${l.contract_no} • الوحدة ${l.snapshot.unit}`;$('maintenanceLease').append(option);}
 $('maintenanceForm').hidden=!$('maintenanceLease').options.length;return data;
}
async function reload(){const e=epoch;try{const data=await refresh();if(data&&current(e))notice('تم فتح ملفك المحفوظ.');return data;}catch(error){if(current(e)){clear();notice(safeError(error));}return null;}}
async function receipt(payment,button){
 if(busy||!snapshot)return;const token=start(),e=epoch,account=snapshot.account;
 try{
  const auth=await session();if(!current(e))return;if(auth?.user.id!==account.user_id){invalidate();return;}
  const blob=await request(async signal=>{
   const response=await fetch('/api/rent-receipt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspaceId:account.workspace_id,receiptNo:payment.reference}),signal,cache:'no-store',credentials:'omit',redirect:'error'});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('application/pdf'))throw Error('تعذر استرجاع الوصل المحفوظ.');
   const file=await response.blob();if(await file.slice(0,5).text()!=='%PDF-')throw Error('ملف الوصل غير صالح.');return file;
  });
  const verified=await session();if(!current(e))return;if(verified?.user.id!==account.user_id){invalidate();return;}if(snapshot?.account!==account)return;
  const url=URL.createObjectURL(blob);receiptUrls.add(url);
  const view=document.createElement('a');view.href=url;view.target='_blank';view.rel='noopener';view.textContent='عرض الوصل وطباعته';view.style.display='block';view.style.padding='12px';
  const download=document.createElement('a');download.href=url;download.download='rent-receipt.pdf';download.textContent='تحميل PDF';download.style.display='block';download.style.padding='12px';
  button.replaceWith(view,download);notice('تم استرجاع الوصل المحفوظ. يمكنك طباعته من عارض PDF أو قائمة المشاركة على الآيفون.');
 }catch(error){if(current(e))notice(safeError(error));}finally{finish(token);}
}
$('tenantLogin').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;const email=$('tenantEmail').value.trim(),password=$('tenantPassword').value;invalidate();const e=epoch,token=start();
 try{const {error}=await bounded(client.auth.signInWithPassword({email,password}));if(!current(e))return;if(error)throw Error('تعذر الدخول. راجع البريد وكلمة المرور وتأكيد الحساب.');await reload();}
 catch(error){if(current(e)){clear();notice(safeError(error));}}finally{if(current(e))$('tenantPassword').value='';finish(token);}
});
$('tenantSignup').onclick=async()=>{
 if(busy)return;if($('tenantPassword').value.length<10){notice('اختر كلمة مرور من ١٠ أحرف على الأقل.');return;}
 const e=epoch,token=start();
 try{const {error}=await bounded(client.auth.signUp({email:$('tenantEmail').value.trim(),password:$('tenantPassword').value,options:{emailRedirectTo:new URL(cfg.supabaseAuthRedirectUrl).origin+'/tenant.html'}}));if(!current(e))return;if(error)throw Error('تعذر إنشاء الحساب. يجب أن يكون بريدك مسجلاً في ملف مستأجر واحد لدى الإدارة.');notice('راجع بريدك لتأكيد الحساب، ثم ارجع إلى هذه الصفحة وسجل الدخول.');}
 catch(error){if(current(e))notice(safeError(error));}finally{if(current(e))$('tenantPassword').value='';finish(token);}
};
$('tenantLogout').onclick=async()=>{invalidate();const e=epoch,token=start();try{const {error}=await bounded(client.auth.signOut());if(!current(e))return;if(error)throw error;notice('تم تسجيل الخروج.');}catch{if(current(e))notice('تعذر تأكيد تسجيل الخروج؛ أعد المحاولة.');}finally{finish(token);}};
$('maintenanceForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!snapshot||saveUncertain)return;const token=start(),e=epoch,account=snapshot.account;let sent=false,confirmed=false;
 try{
  const id=crypto.randomUUID(),lease=snapshot.leases.find(l=>l.id===$('maintenanceLease').value),description=$('maintenanceDescription').value.trim(),today=new Date(Date.now()+10800000).toISOString().slice(0,10);
  if(!lease||lease.status!=='signed'||lease.start_date>today||lease.end_date<today)throw Error('اختر عقداً فعالاً.');if(description.length<5||description.length>3000)throw Error('أدخل وصفاً من ٥ إلى ٣٠٠٠ حرف.');
  const auth=await session();if(!current(e))return;if(auth?.user.id!==account.user_id){invalidate();return;}
  sent=true;const {error}=await request(signal=>client.from('aqari_maintenance_requests').insert({id,workspace_id:account.workspace_id,tenant_id:account.tenant_id,lease_id:lease.id,description}).abortSignal(signal));if(!current(e))return;if(error)throw error;
  const data=await refresh();if(!current(e))return;if(!data?.maintenance.some(m=>m.id===id))throw Error('READBACK_REQUIRED');
  confirmed=true;$('maintenanceDescription').value='';notice('تم حفظ طلب الصيانة وظهوره في سجلك.');
 }catch(error){if(current(e))notice(sent?'لم يتأكد الحفظ. أعد تحميل الصفحة وتحقق من الطلب قبل إرساله مرة أخرى.':safeError(error));}
 finally{if(current(e)&&sent&&!confirmed)saveUncertain=true;finish(token);}
});
// Supabase callbacks must stay synchronous; reads happen after the auth callback returns.
client.auth.onAuthStateChange((event,auth)=>{
 const next=auth?.user.id||null;
 if(event==='SIGNED_OUT'||next!==userId){userId=next;invalidate();if(!next)notice('تم تسجيل الخروج.');else{const e=epoch;setTimeout(()=>{if(current(e))reload();},0);}}
});
window.addEventListener('pagehide',()=>{invalidate();client.auth.stopAutoRefresh();});
window.addEventListener('pageshow',event=>{if(event.persisted){client.auth.startAutoRefresh();reload();}});
reload();
