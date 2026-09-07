const cfg=window.AQARI_PUBLIC_CONFIG,$=id=>document.getElementById(id),notice=message=>{$('notice').textContent=message;};
if(cfg?.supabaseUrl!=='https://djkpkkgoibruaezdrchb.supabase.co'||cfg.releaseStage!=='preview')throw Error('STAGING_REQUIRED');
const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:cfg.supabaseAuthStorageKey+'-tenant'}});
let snapshot=null,epoch=0,busy=false;
const receiptUrls=new Set();
function releaseReceipts(){for(const url of receiptUrls)URL.revokeObjectURL(url);receiptUrls.clear();}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('انتهت مهلة الاتصال.')),20000);})]);}finally{clearTimeout(timer);}}
function lock(value){busy=value;for(const b of document.querySelectorAll('button'))b.disabled=value;}
function clear(){snapshot=null;releaseReceipts();$('content').hidden=true;$('auth').hidden=false;for(const id of ['tenantLeases','tenantPayments','tenantRequests','maintenanceLease'])$(id).replaceChildren();}
function items(target,rows,format){$(target).replaceChildren();if(!rows.length){const p=document.createElement('p');p.textContent='لا توجد سجلات محفوظة.';$(target).append(p);}for(const r of rows){const p=document.createElement('p');p.className='item';p.textContent=format(r);$(target).append(p);}}
async function refresh(){
 const current=epoch;const {data:sessionData,error:sessionError}=await bounded(client.auth.getSession());if(sessionError)throw sessionError;if(!sessionData.session){clear();return null;}
 const {data,error}=await bounded(client.rpc('aqari_tenant_portal_snapshot'));if(current!==epoch)return null;if(error)throw Error('تعذر فتح ملف المستأجر. تأكد من تأكيد بريدك وربطه بملفك لدى الإدارة.');
 snapshot=data;$('auth').hidden=true;$('content').hidden=false;$('tenantName').textContent=data.tenant.full_name;
 items('tenantLeases',data.leases,l=>`العقد ${l.contract_no} • الوحدة ${l.snapshot.unit} • ${l.snapshot.property}\nالإيجار ${Number(l.monthly_rent).toFixed(3)} د.ك • من ${l.start_date} إلى ${l.end_date}`);
 releaseReceipts();items('tenantPayments',data.payments,p=>`وصل إيجار ${p.reference} • ${Number(p.amount).toFixed(3)} د.ك • ${p.paid_at}`);
 for(const [i,payment] of data.payments.entries()){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='فتح وصل الإيجار';button.onclick=()=>receipt(payment,button);$('tenantPayments').children[i].append(button);}
 const states={received:'تم الاستلام',assigned:'تم التكليف',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى'};
 items('tenantRequests',data.maintenance,m=>`طلب ${m.request_no} • ${states[m.status]}\n${m.description}`);
 $('maintenanceLease').replaceChildren();const today=new Date(Date.now()+10800000).toISOString().slice(0,10);
 for(const l of data.leases.filter(l=>l.status==='signed'&&l.start_date<=today&&l.end_date>=today)){const option=document.createElement('option');option.value=l.id;option.textContent=`العقد ${l.contract_no} • الوحدة ${l.snapshot.unit}`;$('maintenanceLease').append(option);}
 $('maintenanceForm').hidden=!$('maintenanceLease').options.length;return data;
}
async function receipt(payment,button){
 if(busy||!snapshot)return;lock(true);const current=epoch,workspace=snapshot.account.workspace_id,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const {data,error}=await bounded(client.auth.getSession());if(error||!data.session)throw Error('سجل الدخول من جديد.');
  const response=await fetch('/api/rent-receipt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({workspaceId:workspace,receiptNo:payment.reference}),signal:controller.signal,cache:'no-store'});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('application/pdf'))throw Error('تعذر استرجاع الوصل المحفوظ.');
  const blob=await response.blob();if(await blob.slice(0,5).text()!=='%PDF-')throw Error('ملف الوصل غير صالح.');
  const session=await bounded(client.auth.getSession());if(current!==epoch||session.data.session?.user.id!==data.session.user.id)return;
  const url=URL.createObjectURL(blob);receiptUrls.add(url);
  const view=document.createElement('a');view.href=url;view.target='_blank';view.rel='noopener';view.textContent='عرض الوصل وطباعته';view.style.display='block';view.style.padding='12px';
  const download=document.createElement('a');download.href=url;download.download='rent-receipt.pdf';download.textContent='تحميل PDF';download.style.display='block';download.style.padding='12px';
  button.replaceWith(view,download);notice('تم استرجاع الوصل المحفوظ. يمكنك طباعته من عارض PDF أو قائمة المشاركة على الآيفون.');
 }catch(e){if(current===epoch)notice(e.name==='AbortError'?'انتهت مهلة تحميل الوصل. أعد المحاولة.':e.message);}
 finally{clearTimeout(timer);lock(false);}
}
$('tenantLogin').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;lock(true);epoch++;try{const {error}=await bounded(client.auth.signInWithPassword({email:$('tenantEmail').value.trim(),password:$('tenantPassword').value}));if(error)throw Error('تعذر الدخول. راجع البريد وكلمة المرور وتأكيد الحساب.');await refresh();notice('تم فتح ملفك المحفوظ.');}catch(e){clear();notice(e.message);}finally{$('tenantPassword').value='';lock(false);}});
$('tenantSignup').onclick=async()=>{if(busy)return;if($('tenantPassword').value.length<10){notice('اختر كلمة مرور من ١٠ أحرف على الأقل.');return;}lock(true);epoch++;try{const {error}=await bounded(client.auth.signUp({email:$('tenantEmail').value.trim(),password:$('tenantPassword').value,options:{emailRedirectTo:new URL(cfg.supabaseAuthRedirectUrl).origin+'/tenant.html'}}));if(error)throw Error('تعذر إنشاء الحساب. يجب أن يكون بريدك مسجلاً في ملف مستأجر واحد لدى الإدارة.');notice('راجع بريدك لتأكيد الحساب، ثم ارجع إلى هذه الصفحة وسجل الدخول.');}catch(e){notice(e.message);}finally{$('tenantPassword').value='';lock(false);}};
$('tenantLogout').onclick=async()=>{epoch++;clear();lock(true);try{const {error}=await bounded(client.auth.signOut());if(error)throw error;notice('تم تسجيل الخروج.');}catch(_){notice('تعذر تأكيد تسجيل الخروج؛ أعد المحاولة.');}finally{lock(false);}};
$('maintenanceForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!snapshot)return;lock(true);let sent=false,confirmed=false;const current=epoch;
 try{
  const id=crypto.randomUUID(),lease=snapshot.leases.find(l=>l.id===$('maintenanceLease').value);if(!lease)throw Error('اختر عقداً فعالاً.');
  sent=true;const {error}=await bounded(client.from('aqari_maintenance_requests').insert({id,workspace_id:snapshot.account.workspace_id,tenant_id:snapshot.account.tenant_id,lease_id:lease.id,description:$('maintenanceDescription').value.trim()}));if(error)throw error;
  const data=await refresh();if(current!==epoch)return;if(!data?.maintenance.some(m=>m.id===id))throw Error('READBACK_REQUIRED');
  confirmed=true;$('maintenanceDescription').value='';notice('تم حفظ طلب الصيانة وظهوره في سجلك.');
 }catch(e){notice(sent?'لم يتأكد الحفظ. أعد تحميل الصفحة وتحقق من الطلب قبل إرساله مرة أخرى.':e.message);}
 finally{lock(false);if(sent&&!confirmed)$('maintenanceSave').disabled=true;}
});
window.addEventListener('pagehide',()=>{epoch++;client.auth.stopAutoRefresh();});
window.addEventListener('pageshow',event=>{if(event.persisted){client.auth.startAutoRefresh();refresh().catch(e=>{clear();notice(e.message);});}});
refresh().catch(e=>{clear();notice(e.message);});
