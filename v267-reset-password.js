import {createPasswordRecovery,createRecoveryTransport} from './src/v267/api/password-recovery.js';
const $=id=>document.getElementById(id);
const messages={
 loading:'جاري التحقق من رابط الاستعادة…',
 ready:'أدخل كلمة مرور جديدة من 10 إلى 128 حرفًا وأعد كتابتها للتأكيد.',
 validation:'تأكد من تطابق كلمتي المرور وأن الطول من 10 إلى 128 حرفًا.',
 saving:'جارٍ حفظ كلمة المرور الجديدة…',
 'signing-out':'تم حفظ كلمة المرور. جارٍ إنهاء الجلسات السابقة…',
 complete:'تم تغيير كلمة المرور وإنهاء الجلسات. سجل الدخول بكلمة المرور الجديدة.',
 expired:'رابط الاستعادة غير صالح أو انتهت الجلسة. اطلب رابطًا جديدًا من صفحة الدخول.',
 uncertain:'تعذر تأكيد نتيجة الحفظ. لا تكرر الطلب هنا؛ جرّب الدخول بكلمة المرور الجديدة أو اطلب رابط استعادة جديدًا.',
 'saved-signout-failed':'تم حفظ كلمة المرور، لكن تعذر تأكيد إنهاء الجلسات السابقة. سجّل الدخول وراجع الجلسات.'
};
let recovery;
function render(phase){
 const ready=phase==='ready'||phase==='validation';
 for(const id of ['password','confirmation','savePassword'])$(id).disabled=!ready;
 if(!ready){$('password').value='';$('confirmation').value='';}
 const status=$('status');status.aqariSource=messages[phase]||messages.expired;
 status.textContent=window.AQARI_LOGIN_TRANSLATE?.(status.aqariSource)||status.aqariSource;
}
window.AQARI_RESET_READY=true;
const cfg=window.AQARI_PUBLIC_CONFIG;
const hash=new URLSearchParams(location.hash.slice(1));
const valid=hash.get('type')==='recovery'&&hash.has('access_token')&&hash.has('refresh_token')&&!hash.has('error')&&!hash.has('error_code');
if(!valid||cfg?.releaseStage!=='preview'||cfg?.supabaseUrl!=='https://djkpkkgoibruaezdrchb.supabase.co'||!window.supabase?.createClient){
 history.replaceState(null,'','/reset-password.html');render('expired');
}else{
 const transport=createRecoveryTransport(window.fetch.bind(window));
 const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:true,storageKey:cfg.supabaseAuthStorageKey+'-password-recovery'},
  global:{fetch:transport.fetch}
 });
 recovery=createPasswordRecovery(client,transport,render);
 render('loading');
 // SDK consumes the callback; strip the fragment on success or failure, never log it.
 recovery.initialize().finally(()=>history.replaceState(null,'','/reset-password.html'));
}
$('resetForm').onsubmit=event=>{event.preventDefault();if(!recovery||!$('resetForm').reportValidity())return;recovery.save($('password').value,$('confirmation').value);};
window.addEventListener('pagehide',()=>recovery?.close());
window.addEventListener('pageshow',event=>{if(event.persisted){recovery?.close();render('expired');}});
