import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const text=(tag,value)=>node(tag,String(value??''));
function codeInput(){const input=node('input');input.type='text';input.inputMode='numeric';input.autocomplete='one-time-code';input.pattern='[0-9]{6}';input.maxLength=6;input.required=true;return input;}
function result(value){if(value?.error)throw value.error;return value?.data;}

export function openSecurityCenter(){
 const d=createDialog(translateStatic('الأمان والتوثيق الثنائي'));if(!d)return;
 let factorId=null,challengeId=null,qr=null,secret=null,disposed=false;
 const state=text('section',''),actions=node('section'),factors=node('section');
 d.body.append(text('p','التوثيق الثنائي مطلوب للمالك والمدير العام والمحاسب قبل العمليات الحساسة. لا تحفظ المنصة سر المصادقة داخل قاعدة بيانات الأعمال.'),state,actions,factors);
 const auth=()=>d.session.client.auth.mfa;
 function clearEnrollment(){factorId=null;challengeId=null;secret=null;if(qr){qr.removeAttribute('src');qr.remove();qr=null;}}
 async function assurance(){
  const data=result(await auth().getAuthenticatorAssuranceLevel());
  if(!data||!['aal1','aal2'].includes(data.currentLevel)||!['aal1','aal2'].includes(data.nextLevel))throw Error('تعذر التحقق من مستوى أمان الجلسة.');
  return data;
 }
 async function list(){
  const [level,listed]=await Promise.all([assurance(),auth().listFactors().then(result)]);
  if(disposed)return;
  state.replaceChildren(text('h2','حالة الجلسة'),text('p',level.currentLevel==='aal2'?'الجلسة محمية بعاملين.':'الجلسة الحالية بعامل واحد.'),text('p',level.nextLevel==='aal2'&&level.currentLevel!=='aal2'?'يوجد عامل موثق؛ أدخل الرمز لترقية الجلسة قبل العمليات الحساسة.':''));
  factors.replaceChildren(text('h2','أجهزة المصادقة'));
  const verified=[...(listed?.totp||[]),...(listed?.phone||[])].filter(item=>item.status==='verified');
  if(!verified.length)factors.append(text('p','لا يوجد عامل ثانٍ موثق لهذا الحساب.'));
  for(const factor of verified){
   const card=node('article'),verify=node('button',translateStatic('التحقق بهذا الجهاز')),remove=node('button',translateStatic('إزالة الجهاز'));
   verify.type=remove.type='button';card.append(text('h3',factor.friendly_name||'تطبيق المصادقة'),text('p',factor.factor_type==='totp'?'رمز من تطبيق المصادقة':'رمز الهاتف'),verify,remove);
   verify.onclick=()=>challenge(factor.id);remove.onclick=()=>d.run(async()=>{const current=await assurance();if(current.currentLevel!=='aal2')throw Error('يجب ترقية الجلسة إلى عاملين قبل إزالة جهاز مصادقة.');if(!window.confirm('هل تؤكد إزالة جهاز المصادقة المحدد؟'))return;result(await auth().unenroll({factorId:factor.id}));await list();d.status.textContent=translateStatic('تمت إزالة جهاز المصادقة.');});factors.append(card);
  }
 }
 async function challenge(id){
  clearEnrollment();factorId=id;const challenged=result(await auth().challenge({factorId:id}));challengeId=challenged?.id;if(!challengeId)throw Error('تعذر إنشاء تحدي التوثيق.');
  const form=node('form'),code=codeInput();form.append(field(translateStatic('رمز التحقق المكون من 6 أرقام'),code),Object.assign(node('button',translateStatic('تحقق من الرمز')),{type:'submit'}));
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{if(!/^\d{6}$/.test(code.value))throw Error('أدخل رمز تحقق صحيحاً من 6 أرقام.');result(await auth().verify({factorId,challengeId,code:code.value}));clearEnrollment();await list();d.status.textContent=translateStatic('تم توثيق العامل الثاني وترقية الجلسة.');});};actions.replaceChildren(text('h2','التحقق من الجلسة'),form);code.focus();
 }
 async function enroll(){
  clearEnrollment();const enrolled=result(await auth().enroll({factorType:'totp',friendlyName:'AQARI V267'}));
  factorId=enrolled?.id;secret=enrolled?.totp?.secret;const qrCode=enrolled?.totp?.qr_code;
  if(!factorId||!qrCode)throw Error('تعذر بدء تسجيل تطبيق المصادقة.');
  qr=node('img');qr.alt='رمز QR لإضافة AQARI V267 إلى تطبيق المصادقة';qr.src=qrCode;qr.width=220;qr.height=220;
  const form=node('form'),code=codeInput(),cancel=node('button',translateStatic('إلغاء التسجيل'));cancel.type='button';
  form.append(text('h2','إضافة تطبيق مصادقة'),text('p','امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدوياً ثم اكتب الرمز المؤقت.'),qr,text('p','المفتاح اليدوي: '+secret),field(translateStatic('رمز التحقق'),code),Object.assign(node('button',translateStatic('تفعيل التوثيق الثنائي')),{type:'submit'}),cancel);
  cancel.onclick=()=>d.run(async()=>{if(factorId)result(await auth().unenroll({factorId}));clearEnrollment();actions.replaceChildren();await list();});
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{if(!/^\d{6}$/.test(code.value))throw Error('أدخل رمز تحقق صحيحاً من 6 أرقام.');const challenged=result(await auth().challenge({factorId}));result(await auth().verify({factorId,challengeId:challenged.id,code:code.value}));clearEnrollment();actions.replaceChildren();await list();d.status.textContent=translateStatic('تم تفعيل التوثيق الثنائي للحساب.');});};actions.replaceChildren(form);code.focus();
 }
 const add=node('button',translateStatic('إضافة تطبيق مصادقة'));add.type='button';add.onclick=()=>d.run(enroll);actions.append(add);
 d.onDispose(()=>{disposed=true;clearEnrollment();state.replaceChildren();actions.replaceChildren();factors.replaceChildren();});
 d.run(list);
}

