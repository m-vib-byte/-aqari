import {mountPortalAccountRecovery,portalRecoveryCallback} from './src/v267/components/portal-account-recovery.js';
import {LANGUAGES,bindLocale,getLocale,setLocale,direction,t} from './src/v267/components/locale.js';
import {uiText,setText,refreshText} from './src/v267/components/ui-text.js';
const cfg=window.AQARI_PUBLIC_CONFIG,$=id=>document.getElementById(id),notice=source=>setText($('notice'),source);
if(cfg?.supabaseUrl!=='https://ofgmcsmxmdswlovsckqs.supabase.co'||cfg.releaseStage!=='preview')throw Error('STAGING_REQUIRED');
const recoveryCallback=portalRecoveryCallback(window.location);
if(recoveryCallback)window.location.replace(recoveryCallback);
let accountRecovery;
const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:!recoveryCallback,storageKey:cfg.supabaseAuthStorageKey+'-tenant'}});
let snapshot=null,epoch=0,busy=false,operation=0,readVersion=0,noticeVersion=0,engagementVersion=0,userId=null,saveUncertain=false;
const receiptUrls=new Set(),jobs=new Set(),attachmentDisposers=new Set();
const safeError=e=>/^[\u0600-\u06ff]/.test(e?.message||'')?e.message:'تعذر إكمال العملية أو تأكيدها. أعد تحميل الصفحة وتحقق من السجلات.';
function updateLanguage(){document.documentElement.lang=getLocale();document.documentElement.dir=direction();document.title=t('حساب المستأجر')+' | AQARI V267';$('tenantLanguage').value=getLocale();for(const el of document.querySelectorAll('[data-aq267-text]'))refreshText(el);accountRecovery?.refresh();}
bindLocale(null);
for(const [code,label] of Object.entries(LANGUAGES)){const option=document.createElement('option');option.value=code;option.textContent=label;$('tenantLanguage').append(option);}
$('tenantLanguage').addEventListener('change',()=>{setLocale($('tenantLanguage').value);updateLanguage();});
updateLanguage();
function releaseReceipts(){for(const url of receiptUrls)URL.revokeObjectURL(url);receiptUrls.clear();}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('انتهت مهلة الاتصال.')),20000);})]);}finally{clearTimeout(timer);}}
async function request(work){
 const controller=new AbortController();jobs.add(controller);let timer,rejectAbort;
 const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('تغيرت الجلسة أو انتهت مهلة الاتصال.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
 timer=setTimeout(()=>controller.abort(),20000);
 try{return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw Error('تغيرت الجلسة.');return work(controller.signal);}),aborted]);}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);jobs.delete(controller);}
}
function lock(value){busy=value;for(const b of document.querySelectorAll('button'))b.disabled=b.id==='tenantLogout'?false:value;if(saveUncertain)$('maintenanceSave').disabled=true;accountRecovery?.refresh();}
function start(){const token=++operation;lock(true);return token;}
function finish(token){if(token===operation)lock(false);}
function clear(){snapshot=null;noticeVersion++;releaseReceipts();for(const dispose of attachmentDisposers)dispose();attachmentDisposers.clear();$('tenantLogout').hidden=true;$('content').hidden=true;$('auth').hidden=Boolean(accountRecovery?.active);$('tenantName').textContent='';$('maintenanceDescription').value='';$('tenantPassword').value='';for(const id of ['tenantLeases','tenantPayments','tenantRequests','maintenanceLease','tenantNotices'])$(id).replaceChildren();setText($('tenantNoticesStatus'),'');$('maintenanceForm').hidden=true;}
function invalidate(){epoch++;readVersion++;for(const job of jobs)job.abort();clear();bindLocale(null);updateLanguage();saveUncertain=false;operation++;lock(false);}
const current=e=>e===epoch;
function items(target,rows,format){$(target).replaceChildren();if(!rows.length)$(target).append(uiText('p','لا توجد سجلات محفوظة.'));for(const r of rows){const p=document.createElement('p');p.className='item';p.append(...format(r));$(target).append(p);}}
async function session(){const {data,error}=await bounded(client.auth.getSession());if(error)throw Error('تعذر التحقق من جلسة الدخول.');return data.session;}
async function refresh(){
 if(recoveryCallback||accountRecovery?.active)return null;
 const e=epoch,version=++readVersion;clear();const auth=await session();if(!current(e)||version!==readVersion)return null;
 if(!auth){clear();return null;}if(userId&&userId!==auth.user.id){invalidate();return null;}userId=auth.user.id;
 const {data,error}=await request(signal=>client.rpc('aqari_tenant_portal_snapshot').abortSignal(signal));if(!current(e)||version!==readVersion)return null;
 if(error)throw Error('تعذر فتح ملف المستأجر. تأكد من تأكيد بريدك وربطه بملفك لدى الإدارة.');
 const verified=await session();if(!current(e)||version!==readVersion)return null;
 if(verified?.user.id!==auth.user.id){invalidate();return null;}
 if(data?.account?.user_id!==auth.user.id||data.account.is_active!==true||!data.account.workspace_id||data.tenant?.id!==data.account.tenant_id||data.tenant.workspace_id!==data.account.workspace_id||!['leases','payments','maintenance'].every(k=>Array.isArray(data[k])))throw Error('تعذر تأكيد ارتباط الملف بحسابك.');
 bindLocale({user:data.account.user_id,workspace:data.account.workspace_id});updateLanguage();snapshot=data;$('tenantLogout').hidden=false;$('auth').hidden=true;$('content').hidden=false;$('tenantName').textContent=data.tenant.full_name;
 items('tenantLeases',data.leases,l=>[uiText('span','العقد {contract} • الوحدة {unit} • {property}\nالإيجار {amount} د.ك • من {start} إلى {end}',{contract:l.contract_no,unit:l.snapshot.unit,property:l.snapshot.property,amount:Number(l.monthly_rent).toFixed(3),start:l.start_date,end:l.end_date})]);
 releaseReceipts();items('tenantPayments',data.payments,p=>[uiText('span','وصل إيجار {reference} • {amount} د.ك • {date}',{reference:p.reference,amount:Number(p.amount).toFixed(3),date:p.paid_at})]);
 for(const [i,payment] of data.payments.entries()){const button=uiText('button','فتح وصل الإيجار');button.type='button';button.className='secondary';button.onclick=()=>receipt(payment,button);$('tenantPayments').children[i].append(button);}
 const states={received:'تم الاستلام',assigned:'تم التكليف',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى'};
 items('tenantRequests',data.maintenance,m=>{const description=document.createElement('span');description.textContent='\n'+m.description;return [uiText('span','طلب {number} • ',{number:m.request_no}),uiText('span',states[m.status]||'غير معروف'),description];});
 for(const [i,record] of data.maintenance.entries()){const button=uiText('button','صور البلاغ ومرفقاته');button.type='button';button.className='secondary';button.onclick=()=>maintenanceFiles(record,button);$('tenantRequests').children[i].append(button);}
 $('maintenanceLease').replaceChildren();const today=new Date(Date.now()+10800000).toISOString().slice(0,10);
 for(const l of data.leases.filter(l=>l.status==='signed'&&l.start_date<=today&&l.end_date>=today)){const option=uiText('option','العقد {contract} • الوحدة {unit}',{contract:l.contract_no,unit:l.snapshot.unit});option.value=l.id;$('maintenanceLease').append(option);}
 $('maintenanceForm').hidden=!$('maintenanceLease').options.length;loadNotices();loadEngagement();return data;
}
async function maintenanceFiles(record,button){
 if(busy||!snapshot)return;const e=epoch,account=snapshot.account,token=start();
 const check=()=>{if(!current(e)||snapshot?.account!==account)throw Error('تغيرت الجلسة. أعد الدخول إلى حسابك.');};
 try{
  const auth=await session();check();if(auth?.user.id!==account.user_id){invalidate();return;}
  if(!snapshot.maintenance.some(row=>row.id===record.id))throw Error('البلاغ غير متاح لهذا الحساب.');
  const {mountMaintenanceAttachments}=await import('./src/v267/components/maintenance-attachment-panel.js');check();
  const container=document.createElement('div');button.replaceWith(container);
  const unpack=async work=>{check();const response=await request(work);check();if(response.error){const error=Error(response.error.message||'تعذر قراءة المرفقات.');error.status=Number(response.error.status??response.error.statusCode)||undefined;error.code=response.error.code;throw error;}return response.data;};
  await mountMaintenanceAttachments(container,{workspaceId:account.workspace_id,requestId:record.id,userId:account.user_id,check,onDispose:fn=>attachmentDisposers.add(fn),
   rpc:(name,args)=>unpack(signal=>client.rpc(name,args).abortSignal(signal)),
   storage:(method,path,blob,bucket)=>unpack(()=>method==='POST'?client.storage.from(bucket).upload(path,blob,{contentType:blob.type,upsert:false}):client.storage.from(bucket).download(path))});
 }catch(error){if(current(e))notice(safeError(error));}finally{finish(token);}
}
async function loadEngagement(){
 if(!snapshot)return null;const e=epoch,version=++engagementVersion,account=snapshot.account;let box=$('tenantEngagement');
 if(!box){box=document.createElement('section');box.id='tenantEngagement';box.setAttribute('aria-label','التواصل والتقييم');$('content').append(box);}
 box.replaceChildren(uiText('h2','التواصل والتقييم'));
 try{const auth=await session();if(!current(e)||version!==engagementVersion)return null;if(auth?.user.id!==account.user_id){invalidate();return null;}
  const {data,error}=await request(signal=>client.rpc('aqari_tenant_engagement_feed').abortSignal(signal));if(!current(e)||version!==engagementVersion)return null;if(error||!data||!Array.isArray(data.channels)||!Array.isArray(data.ratings))throw Error('تعذر تحميل التواصل والتقييم.');
  box.append(uiText('p','وسيلة التواصل المفضلة: {channel}',{channel:data.preference?.preferred_channel||'غير محددة'}));
  const links=document.createElement('div');for(const c of data.channels){const a=document.createElement('a');a.href=c.public_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=c.kind;links.append(a);}box.append(links);
  for(const r of data.ratings){const line=document.createElement('p');line.textContent=`${r.year}: ${'★'.repeat(r.stars)}${'☆'.repeat(4-r.stars)} — ${r.rating}`;box.append(line);}
 }catch(error){if(current(e)&&version===engagementVersion)box.append(uiText('p','تعذر تحميل التواصل والتقييم.'));}
}
const noticeDate=value=>new Date(value).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'});
async function loadNotices(){
 if(!snapshot)return null;const e=epoch,version=++noticeVersion,account=snapshot.account;
 const fresh=()=>current(e)&&version===noticeVersion&&snapshot?.account===account;
 setText($('tenantNoticesStatus'),'جارٍ تحميل إعلانات عقارك…');
 try{
  const auth=await session();if(!fresh())return null;if(auth?.user.id!==account.user_id){invalidate();return null;}
  const {data,error}=await request(signal=>client.rpc('aqari_property_notices',{p_workspace_id:account.workspace_id,p_action:'feed',p_data:{}}).abortSignal(signal));if(!fresh())return null;
  if(error)throw Error('تعذر تحميل إعلانات العقار. يمكنك متابعة استخدام حسابك والمحاولة مجدداً.');
  const verified=await session();if(!fresh())return null;if(verified?.user.id!==account.user_id){invalidate();return null;}
  if(!Array.isArray(data)||data.some(record=>!record?.id||!Number.isInteger(record.revision)||record.status!=='published'||typeof record.title!=='string'||typeof record.body!=='string'))throw Error('تعذر تأكيد بيانات إعلانات العقار.');
  $('tenantNotices').replaceChildren();if(!data.length)$('tenantNotices').append(uiText('p','لا توجد إعلانات أو إرشادات منشورة لعقارك حالياً.'));
  const types={notice:'إعلان العقار',guidance:'إرشاد للمستأجر',circular:'تعميم إداري'};
  for(const record of data){
   const card=document.createElement('article'),title=document.createElement('h3'),body=document.createElement('p'),property=document.createElement('p');card.className='item';title.textContent=record.title;body.textContent=record.body;property.textContent=record.property_name||'';
   card.append(uiText('span',types[record.kind]||'إعلان العقار'),title,property,body,uiText('p','تاريخ النشر: {date} • النسخة {revision}',{date:noticeDate(record.published_at),revision:record.revision}));
   if(record.expires_at)card.append(uiText('p','نهاية العرض: {date}',{date:noticeDate(record.expires_at)}));
   if(record.acknowledged_at)card.append(uiText('p','تم تسجيل اطلاعك في {date}',{date:noticeDate(record.acknowledged_at)}));
   else{const button=uiText('button','أقر بأنني اطلعت على هذه النسخة');button.type='button';button.className='secondary';button.disabled=busy;button.onclick=()=>acknowledgeNotice(record);card.append(button);}
   $('tenantNotices').append(card);
  }
  setText($('tenantNoticesStatus'),'تُعرض أحدث ٥٠ مادة متاحة لك. لا يسجل الاطلاع إلا عند ضغط زر الإقرار.');return data;
 }catch(error){if(fresh()){ $('tenantNotices').replaceChildren();setText($('tenantNoticesStatus'),safeError(error));}return null;}
}
async function acknowledgeNotice(record){
 if(busy||!snapshot)return;const token=start(),e=epoch,account=snapshot.account;
 try{
  const auth=await session();if(!current(e)||snapshot?.account!==account)return;if(auth?.user.id!==account.user_id){invalidate();return;}
  const {data,error}=await request(signal=>client.rpc('aqari_property_notices',{p_workspace_id:account.workspace_id,p_action:'ack',p_data:{id:record.id,revision:record.revision}}).abortSignal(signal));if(!current(e)||snapshot?.account!==account)return;
  if(error||!data?.acknowledged_at)throw Error('لم يتأكد تسجيل الاطلاع. حدّث الإعلانات للتحقق.');
  const verified=await session();if(!current(e)||snapshot?.account!==account)return;if(verified?.user.id!==account.user_id){invalidate();return;}
  const rows=await loadNotices();if(!current(e)||snapshot?.account!==account)return;
  if(!rows?.some(row=>row.id===record.id&&row.revision===record.revision&&row.acknowledged_at))throw Error('لم يتأكد ظهور الإقرار في السجل الحالي. حدّث الإعلانات للتحقق.');
  setText($('tenantNoticesStatus'),'تم حفظ إقرار اطلاعك على هذه النسخة والتحقق منه.');
 }catch(error){if(current(e)&&snapshot?.account===account)setText($('tenantNoticesStatus'),safeError(error));}finally{finish(token);}
}
$('tenantNoticesRefresh').onclick=async()=>{if(busy||!snapshot)return;const token=start();try{await loadNotices();}finally{finish(token);}};
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
  const view=document.createElement('a');view.href=url;view.target='_blank';view.rel='noopener';setText(view,'عرض الوصل وطباعته');view.style.display='block';view.style.padding='12px';
  const download=document.createElement('a');download.href=url;download.download='rent-receipt.pdf';setText(download,'تحميل PDF');download.style.display='block';download.style.padding='12px';
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
$('tenantLogout').onclick=async()=>{invalidate();const e=epoch,token=start();try{const {error}=await bounded(client.auth.signOut());if(!current(e))return;if(error)throw error;notice('تم تسجيل الخروج.');}catch{if(current(e)){$('tenantLogout').hidden=false;notice('تعذر تأكيد تسجيل الخروج؛ أعد المحاولة.');}}finally{finish(token);}};
$('maintenanceForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!snapshot||saveUncertain)return;const token=start(),e=epoch,account=snapshot.account;let sent=false,confirmed=false;
 try{
  const id=crypto.randomUUID(),lease=snapshot.leases.find(l=>l.id===$('maintenanceLease').value),description=$('maintenanceDescription').value.trim(),today=new Date(Date.now()+10800000).toISOString().slice(0,10);
  if(!lease||lease.status!=='signed'||lease.start_date>today||lease.end_date<today)throw Error('اختر عقداً فعالاً.');if(description.length<5||description.length>3000)throw Error('أدخل وصفاً من ٥ إلى ٣٠٠٠ حرف.');
  const auth=await session();if(!current(e))return;if(auth?.user.id!==account.user_id){invalidate();return;}
  sent=true;const {error}=await request(signal=>client.from('aqari_maintenance_requests').insert({id,workspace_id:account.workspace_id,tenant_id:account.tenant_id,lease_id:lease.id,description}).abortSignal(signal));if(!current(e))return;if(error)throw error;
  const data=await refresh();if(!current(e))return;if(!data?.maintenance.some(m=>m.id===id))throw Error('READBACK_REQUIRED');
  confirmed=true;$('maintenanceDescription').value='';notice('تم حفظ طلب الصيانة وظهوره في سجلك. افتح «صور البلاغ ومرفقاته» لإضافة صور العطل أو استرجاعها.');
 }catch(error){if(current(e))notice(sent?'لم يتأكد الحفظ. أعد تحميل الصفحة وتحقق من الطلب قبل إرساله مرة أخرى.':safeError(error));}
 finally{if(current(e)&&sent&&!confirmed)saveUncertain=true;finish(token);}
});
accountRecovery=mountPortalAccountRecovery({container:$('tenantRecovery'),button:$('tenantForgotPassword'),config:cfg,portal:'tenant',location:window.location,createClient:window.supabase.createClient,fetcher:(...args)=>window.fetch(...args),getLocale,getEmail:()=>$('tenantEmail').value,onEnter(){const locale=getLocale();invalidate();setLocale(locale);updateLanguage();$('auth').hidden=true;notice('');},async onExit({verified}){if(verified){const result=await bounded(client.auth.signOut({scope:'local'}));if(result.error)throw result.error;}},onClosed(){invalidate();}});
// Supabase callbacks must stay synchronous; reads happen after the auth callback returns.
client.auth.onAuthStateChange((event,auth)=>{
 if(recoveryCallback)return;
 if(event==='PASSWORD_RECOVERY'){userId=null;invalidate();window.location.replace('/reset-password.html'+String(window.location.hash||''));return;}
 const next=auth?.user.id||null;
 if(event==='SIGNED_OUT'||next!==userId){userId=next;invalidate();if(!next)notice('تم تسجيل الخروج.');else{const e=epoch;setTimeout(()=>{if(current(e))reload();},0);}}
});
window.addEventListener('pagehide',()=>{accountRecovery.close();invalidate();client.auth.stopAutoRefresh();});
window.addEventListener('pageshow',event=>{if(event.persisted){client.auth.startAutoRefresh();reload();}});
reload();
