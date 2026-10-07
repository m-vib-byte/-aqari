import {t as visibleText} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';

const text=(tag,value)=>node(tag,String(value??''));
function codeInput(){const input=node('input');input.type='text';input.inputMode='numeric';input.autocomplete='one-time-code';input.pattern='[0-9]{6}';input.maxLength=6;input.required=true;return input;}
function result(value){
 if(value?.error){
  const messages={insufficient_aal:'يلزم التحقق بالجهاز المسجل قبل إضافة جهاز مصادقة جديد. إذا فقدت تطبيق المصادقة، يلزم استعادة الوصول عبر مسؤول الحساب؛ لا يمكن استخراج الرمز القديم أو تجاوز التحقق.',mfa_factor_name_conflict:'يوجد تسجيل مصادقة سابق بهذا الاسم. أغلق النافذة وافتح مركز الأمان لاستكماله أو إلغاء التسجيل غير المكتمل.',mfa_verification_failed:'رمز التحقق غير صحيح أو انتهت صلاحيته. أدخل الرمز الحالي من تطبيق المصادقة المرتبط بهذا التسجيل.'};
  if(messages[value.error.code])throw Error(messages[value.error.code]);
  throw value.error;
 }
 return value?.data;
}
const allFactors=listed=>Array.isArray(listed?.all)?listed.all:[...(listed?.totp||[]),...(listed?.phone||[])];
const pendingFactors=listed=>allFactors(listed).filter(f=>f.factor_type==='totp'&&f.status==='unverified'&&f.id);

export function openSecurityCenter(){
 const d=createDialog(translateStatic('الأمان والتوثيق الثنائي'));if(!d)return;
 let factorId=null,challengeId=null,qr=null,secret=null,disposed=false;
 const state=text('section',''),actions=node('section'),factors=node('section');
 d.body.append(text('p',visibleText('التوثيق الثنائي مطلوب للمالك والمدير العام والمحاسب قبل العمليات الحساسة. لا تحفظ المنصة سر المصادقة داخل قاعدة بيانات الأعمال.')),state,actions,factors);
 const auth=()=>d.session.client.auth.mfa;
 const authRequest=task=>d.session.operation(task).then(result);
 const showEnrollmentAction=()=>actions.replaceChildren(add);
 function clearEnrollment(){factorId=null;challengeId=null;secret=null;if(qr){qr.removeAttribute('src');qr.remove();qr=null;}actions.replaceChildren();if(!disposed)showEnrollmentAction();}
 async function assurance(){
  const data=await authRequest(()=>auth().getAuthenticatorAssuranceLevel());
  if(!data||!['aal1','aal2'].includes(data.currentLevel)||!['aal1','aal2'].includes(data.nextLevel))throw Error('تعذر التحقق من مستوى أمان الجلسة.');
  return data;
 }
 async function list(){
  const [level,listed]=await Promise.all([assurance(),authRequest(()=>auth().listFactors())]);
  if(disposed)return;
  state.replaceChildren(text('h2',visibleText('حالة الجلسة')),text('p',level.currentLevel==='aal2'?visibleText('الجلسة محمية بعاملين.'):visibleText('الجلسة الحالية بعامل واحد.')),text('p',level.nextLevel==='aal2'&&level.currentLevel!=='aal2'?visibleText('يوجد عامل موثق؛ أدخل الرمز لترقية الجلسة قبل العمليات الحساسة.'):''));
  factors.replaceChildren(text('h2',visibleText('أجهزة المصادقة')));
  const verified=allFactors(listed).filter(item=>item.status==='verified');
  for(const factor of pendingFactors(listed)){
   const card=node('article'),resume=node('button',translateStatic('استكمال التفعيل')),cancel=node('button',translateStatic('إلغاء التسجيل غير المكتمل'));
   resume.type=cancel.type='button';
   card.append(text('h3',factor.friendly_name||visibleText('تطبيق المصادقة')),text('p',visibleText('تسجيل غير مكتمل. إذا أضفته إلى تطبيق المصادقة، استكمل التفعيل بالرمز الحالي. إذا لم تحتفظ بالربط، ألغ هذا التسجيل ثم أضف التطبيق من جديد.')),resume,cancel);
   resume.onclick=()=>d.run(()=>challenge(factor.id));
   cancel.onclick=()=>d.run(async()=>{
    if(!window.confirm(visibleText('إلغاء تسجيل المصادقة غير المكتمل؟ لن تتم إزالة أي جهاز موثق.')))return;
    const latest=await authRequest(()=>auth().listFactors());
    if(!pendingFactors(latest).some(item=>item.id===factor.id))throw Error('تغيرت حالة التسجيل. أغلق النافذة وافتحها من جديد.');
    await authRequest(()=>auth().unenroll({factorId:factor.id}));await list();d.status.textContent=translateStatic('تم إلغاء التسجيل غير المكتمل. يمكنك إضافة تطبيق مصادقة من جديد.');
   });factors.append(card);
  }
  if(!verified.length)factors.append(text('p',visibleText('لا يوجد عامل ثانٍ موثق لهذا الحساب.')));
  for(const factor of verified){
   const card=node('article'),verify=node('button',translateStatic('التحقق بهذا الجهاز')),remove=node('button',translateStatic('إزالة الجهاز'));
   verify.type=remove.type='button';card.append(text('h3',factor.friendly_name||visibleText('تطبيق المصادقة')),text('p',factor.factor_type==='totp'?visibleText('رمز من تطبيق المصادقة'):visibleText('رمز الهاتف')),verify,remove);
   verify.onclick=()=>d.run(()=>challenge(factor.id));remove.onclick=()=>d.run(async()=>{const current=await assurance();if(current.currentLevel!=='aal2')throw Error('يجب ترقية الجلسة إلى عاملين قبل إزالة جهاز مصادقة.');if(!window.confirm(visibleText('هل تؤكد إزالة جهاز المصادقة المحدد؟')))return;await authRequest(()=>auth().unenroll({factorId:factor.id}));await list();d.status.textContent=translateStatic('تمت إزالة جهاز المصادقة.');});factors.append(card);
  }
 }
 async function challenge(id){
  clearEnrollment();factorId=id;const challenged=await authRequest(()=>auth().challenge({factorId:id}));challengeId=challenged?.id;if(!challengeId)throw Error('تعذر إنشاء تحدي التوثيق.');
  const form=node('form'),code=codeInput();form.append(field(translateStatic('رمز التحقق المكون من 6 أرقام'),code),Object.assign(node('button',translateStatic('تحقق من الرمز')),{type:'submit'}));
  form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{if(!/^\d{6}$/.test(code.value))throw Error('أدخل رمز تحقق صحيحاً من 6 أرقام.');await authRequest(()=>auth().verify({factorId,challengeId,code:code.value}));clearEnrollment();await list();showEnrollmentAction();d.status.textContent=translateStatic('تم توثيق العامل الثاني وترقية الجلسة.');});};actions.replaceChildren(text('h2',visibleText('التحقق من الجلسة')),form);code.focus();
 }
 async function enroll(){
  clearEnrollment();
  const listed=await authRequest(()=>auth().listFactors());
  if(pendingFactors(listed).length){await list();d.status.textContent=translateStatic('يوجد تسجيل مصادقة غير مكتمل. اختر استكمال التفعيل أو إلغاء التسجيل غير المكتمل أدناه.');return;}
  const enrolled=await authRequest(()=>auth().enroll({factorType:'totp',friendlyName:'AQARI V267'}));
  factorId=enrolled?.id;secret=enrolled?.totp?.secret;const qrCode=enrolled?.totp?.qr_code;
  if(!factorId||!qrCode)throw Error('تعذر بدء تسجيل تطبيق المصادقة.');
  qr=node('img');qr.alt=visibleText('رمز QR لإضافة AQARI V267 إلى تطبيق المصادقة');qr.src=qrCode;qr.width=220;qr.height=220;
  const form=node('form'),code=codeInput(),cancel=node('button',translateStatic('إلغاء التسجيل'));cancel.type='button';
  form.append(text('h2',visibleText('إضافة تطبيق مصادقة')),text('p',visibleText('امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدوياً ثم اكتب الرمز المؤقت.')),qr,text('p',visibleText('المفتاح اليدوي: ')+secret),field(translateStatic('رمز التحقق'),code),Object.assign(node('button',translateStatic('تفعيل التوثيق الثنائي')),{type:'submit'}),cancel);
  cancel.onclick=()=>d.run(async()=>{if(factorId)await authRequest(()=>auth().unenroll({factorId}));clearEnrollment();await list();showEnrollmentAction();});
  form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{if(!/^\d{6}$/.test(code.value))throw Error('أدخل رمز تحقق صحيحاً من 6 أرقام.');const challenged=await authRequest(()=>auth().challenge({factorId}));await authRequest(()=>auth().verify({factorId,challengeId:challenged.id,code:code.value}));clearEnrollment();await list();showEnrollmentAction();d.status.textContent=translateStatic('تم تفعيل التوثيق الثنائي للحساب.');});};actions.replaceChildren(form);code.focus();
 }
 const add=node('button',translateStatic('إضافة تطبيق مصادقة'));add.type='button';add.onclick=()=>d.run(enroll);actions.append(add);
 d.onDispose(()=>{disposed=true;clearEnrollment();state.replaceChildren();actions.replaceChildren();factors.replaceChildren();});
 d.run(list);
}

