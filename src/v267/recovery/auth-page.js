import {RECOVERY_URL,allowedRecoveryHost,createRecoveryAuth} from './auth-core.js';
import {RECOVERY_PUBLIC_KEY} from './public-key.js';
const $=id=>document.getElementById(id);
let core,busy=false,pendingFactor=null;
function message(text,type=''){$('status').textContent=text;$('status').className=type;}
function clearSetup(){$('qr').removeAttribute('src');$('secret').textContent='';$('setupPanel').hidden=true;$('code').value='';}
function clearPanels(){for(const id of ['loginPanel','mfaPanel','readyPanel','successPanel'])$(id).hidden=true;clearSetup();}
function errorText(e){
 if(e?.message==='RECOVERY_OWNER_REQUIRED')return 'هذا الحساب لا يطابق حساب المالك في بيئة التعافي. سجّل الدخول بالحساب المعتمد.';
 if(e?.code==='invalid_credentials'||e?.code==='invalid_login_credentials')return 'تعذّر تسجيل الدخول. تأكد من البريد وكلمة المرور الخاصين بالحساب.';
 if(e?.code==='mfa_verification_failed'||e?.message==='RECOVERY_CODE_INVALID')return 'رمز التحقق غير صحيح أو انتهت صلاحيته. أدخل الرمز الجديد من تطبيقك.';
 if(e?.message==='RECOVERY_ACCESS_MISMATCH')return 'نجح الدخول، لكن صلاحية مساحة التعافي لم تتأكد بعد.';
 return 'لم تكتمل الخطوة. تأكد من الاتصال وأعد المحاولة. إذا استمرت المشكلة، أخبرني بنص هذه الرسالة فقط.';
}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await fn();}catch(e){message(errorText(e),'error');}finally{busy=false;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);}}
function showState(state){
 clearPanels();$('logout').hidden=false;
 if(state.aal2){$('readyPanel').hidden=false;message('تم تأكيد التحقق الثنائي. يمكنك الآن فحص الاتصال.','success');return;}
 $('mfaPanel').hidden=false;$('enrollPanel').hidden=state.verified.length>0;$('verifyForm').hidden=state.verified.length===0;
 $('factor').replaceChildren();for(const f of state.verified){const option=document.createElement('option');option.value=f.id;option.textContent=f.friendly_name||'تطبيق المصادقة';$('factor').append(option);}
 message(state.verified.length?'أدخل رمز التحقق من تطبيق المصادقة.':'تم الدخول. فعّل تطبيق المصادقة لبيئة التعافي.');
}
async function init(){
 if(!allowedRecoveryHost(location.hostname)){clearPanels();message('هذه الصفحة مخصصة لرابط اختبار بيئة التعافي المعتمد فقط.','error');return;}
 if(!window.supabase?.createClient){message('تعذّر تحميل الاتصال. حدّث الصفحة لإعادة المحاولة.','error');return;}
 const transport=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.origin!==RECOVERY_URL)throw Error('RECOVERY_ORIGIN_REQUIRED');
  const timeout=AbortSignal.timeout(25000),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  return fetch(input,{...options,signal,cache:'no-store',credentials:'omit',redirect:'error'});
 };
 const client=window.supabase.createClient(RECOVERY_URL,RECOVERY_PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'aqari-isolated-recovery-auth-20261005'},global:{fetch:transport}});
 core=createRecoveryAuth(client);$('loginPanel').hidden=false;message('سجّل الدخول لبدء اختبار الهوية.');
 $('loginForm').onsubmit=event=>{event.preventDefault();if(busy)return;const email=$('email').value.trim(),password=$('password').value;$('password').value='';run(async()=>{message('جارٍ تسجيل الدخول…');showState(await core.signIn(email,password));});};
 $('enroll').onclick=()=>run(async()=>{
  message('جارٍ إعداد تطبيق المصادقة…');const data=await core.enroll();pendingFactor=data.id;
  const qr=data.totp.qr_code;$('qr').src=qr.startsWith('data:image/svg+xml')?qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr);
  $('secret').textContent=data.totp.secret;$('setupPanel').hidden=false;$('enrollPanel').hidden=true;$('verifyForm').hidden=false;
  const option=document.createElement('option');option.value=data.id;option.textContent='MyAqari Recovery';$('factor').replaceChildren(option);
  message('أضف الحساب إلى تطبيق المصادقة، ثم أدخل الرمز الذي يظهر فيه.');
 });
 $('verifyForm').onsubmit=event=>{event.preventDefault();if(busy)return;const code=$('code').value.trim(),factorId=$('factor').value;$('code').value='';run(async()=>{message('جارٍ التحقق…');const state=await core.verify(factorId,code);pendingFactor=null;showState(state);});};
 $('cancel').onclick=()=>run(async()=>{clearSetup();await core.cancelEnrollment();pendingFactor=null;showState(await core.status());});
 $('check').onclick=()=>run(async()=>{message('جارٍ فحص اتصال الحساب…');await core.readCheck();clearPanels();$('successPanel').hidden=false;message('نجح فحص الدخول والتحقق الثنائي وصلاحية الحساب.','success');});
 $('logout').onclick=()=>run(async()=>{clearSetup();if(pendingFactor){await core.cancelEnrollment();pendingFactor=null;}await core.signOut();clearPanels();$('logout').hidden=true;$('loginPanel').hidden=false;message('تم تسجيل الخروج من بيئة التعافي.');});
 window.addEventListener('pagehide',()=>{clearSetup();$('password').value='';});
}
if(document.readyState==='complete')init();else window.addEventListener('load',init,{once:true});
