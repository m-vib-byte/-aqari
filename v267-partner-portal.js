import {LANGUAGES,bindLocale,getLocale,setLocale,direction,t} from './src/v267/components/locale.js';
import {uiText,setText,refreshText} from './src/v267/components/ui-text.js';
import {createPartnerSession} from './src/v267/api/partner-session.js';
const cfg=window.AQARI_PUBLIC_CONFIG,$=id=>document.getElementById(id),notice=source=>setText($('notice'),source);
if(cfg?.supabaseUrl!=='https://ofgmcsmxmdswlovsckqs.supabase.co'||cfg.releaseStage!=='preview')throw Error('STAGING_REQUIRED');
const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:cfg.supabaseAuthStorageKey+'-partner'}});
let properties=[],operation=0,busy=false;
function language(){document.documentElement.lang=getLocale();document.documentElement.dir=direction();document.title=t('حساب الشريك')+' | AQARI V267';$('partnerLanguage').value=getLocale();for(const el of document.querySelectorAll('[data-aq267-text]'))refreshText(el);}
function controls(value){busy=value;for(const el of document.querySelectorAll('button,input,select'))el.disabled=el.id==='partnerLogout'||el.id==='partnerLanguage'?false:value;}
function clear(){properties=[];$('partnerProperty').replaceChildren();$('partnerSummary').replaceChildren();$('partnerContent').hidden=true;$('partnerAuth').hidden=false;$('partnerPassword').value='';$('partnerLogout').hidden=true;}
const session=createPartnerSession(client,()=>{operation++;clear();controls(false);bindLocale(null);language();notice('تغيرت الجلسة. سجّل الدخول أو حدّث البيانات.');});
bindLocale(null);for(const [value,label]of Object.entries(LANGUAGES)){const o=document.createElement('option');o.value=value;o.textContent=label;$('partnerLanguage').append(o);}
$('partnerLanguage').onchange=()=>{setLocale($('partnerLanguage').value);language();};language();
const now=new Date();$('partnerMonth').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
async function bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('AUTH_TIMEOUT')),20000);})]);}finally{clearTimeout(timer);}}
async function run(task){if(busy)return;const ticket=++operation;controls(true);notice('جارٍ الاتصال…');try{await task(ticket);}catch(error){if(ticket===operation){$('partnerSummary').replaceChildren();const anonymous=error?.message==='PARTNER_SIGN_IN_REQUIRED';$('partnerLogout').hidden=anonymous;notice(anonymous?'أدخل البريد وكلمة المرور للدخول إلى حساب الشريك.':'تعذر إكمال العملية. تحقق من تأكيد بريدك وصلاحية العقار ثم أعد المحاولة.');}}finally{if(ticket===operation)controls(false);}}
async function detail(ticket){
 $('partnerSummary').replaceChildren();const property=properties.find(p=>p.id===$('partnerProperty').value),month=$('partnerMonth').value;
 if(!property||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('INVALID_SELECTION');
 const data=await session.read({propertyId:property.id,workspaceId:property.workspace_id,month:month+'-01'});if(ticket!==operation)return;
 bindLocale({user:data.user_id,workspace:data.workspace_id});language();
 const heading=document.createElement('h2');heading.textContent=data.name;const list=document.createElement('dl');
 for(const [label,value]of [['عدد الوحدات',data.unit_count],['عقود مسودة',data.draft_leases],['عدد الوصول المسجلة',data.receipt_count],['المقبوضات المسجلة — د.ك',Number(data.recorded_receipts).toFixed(3)]]){const dd=document.createElement('dd');dd.textContent=String(value);list.append(uiText('dt',label),dd);}
 $('partnerSummary').append(heading,list);notice('تمت قراءة البيانات المصرح بها من قاعدة البيانات.');
}
async function load(ticket){
 const selected=$('partnerProperty').value;clear();const data=await session.read();if(ticket!==operation)return;properties=data.properties;$('partnerLogout').hidden=false;
 if(!properties.length){notice('لا توجد عقارات مصرح بها لهذا الحساب. راجع الإدارة.');return;}
 for(const p of properties){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('partnerProperty').append(o);}
 if(properties.some(p=>p.id===selected))$('partnerProperty').value=selected;
 $('partnerAuth').hidden=true;$('partnerContent').hidden=false;await detail(ticket);
}
$('partnerLogin').onsubmit=event=>{event.preventDefault();if(!$('partnerLogin').reportValidity())return;const credentials={email:$('partnerEmail').value.trim(),password:$('partnerPassword').value};$('partnerPassword').value='';run(async ticket=>{const r=await bounded(client.auth.signInWithPassword(credentials));if(r.error)throw r.error;if(ticket===operation)await load(ticket);});};
$('partnerSignup').onclick=()=>{if(!$('partnerLogin').reportValidity()||busy)return;const email=$('partnerEmail').value.trim(),password=$('partnerPassword').value;if(password.length<10){notice('استخدم كلمة مرور لا تقل عن 10 أحرف.');return;}$('partnerPassword').value='';run(async ticket=>{
 const redirect=cfg.supabaseAuthRedirectUrl;if(redirect!=='https://aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app/login.html?release=V267')throw Error('INVALID_REDIRECT');
 const r=await bounded(client.auth.signUp({email,password,options:{emailRedirectTo:redirect}}));if(r.error)throw r.error;if(ticket!==operation)return;if(r.data?.session)await load(ticket);else notice('تحقق من بريدك لتأكيد الحساب، ثم ارجع إلى دخول الشريك.');
});};
$('partnerProperty').onchange=()=>run(detail);$('partnerMonth').onchange=()=>run(detail);$('partnerRefresh').onclick=()=>run(load);
$('partnerLogout').onclick=()=>{session.invalidate();$('partnerLogout').hidden=false;run(async ticket=>{const r=await bounded(client.auth.signOut({scope:'local'}));if(r.error)throw r.error;if(ticket===operation)notice('تم تسجيل الخروج.');});};
window.addEventListener('pagehide',()=>session.invalidate());window.addEventListener('pageshow',event=>{if(event.persisted)run(load);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)session.invalidate();else run(load);});
window.AQARI_PARTNER_READY=true;run(load);
