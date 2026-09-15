import {createDialog,node,field} from '../components/dialog.js';

const text=(tag,value)=>node(tag,String(value??''));
function codeInput(){const input=node('input');input.type='text';input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=12;input.required=true;return input;}
function result(value){if(value?.error)throw value.error;return value?.data;}
function normalizeOtp(value){
 const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
 return String(value??'').trim()
  .replace(/[٠-٩]/g,ch=>String(arabic.indexOf(ch)))
  .replace(/[۰-۹]/g,ch=>String(persian.indexOf(ch)))
  .replace(/[\s\u00a0\u200e\u200f-]/g,'');
}
function factorDisplayName(factor){const name=String(factor?.friendly_name||'').trim();return name.startsWith('AQARI V267')?'AQARI V267':(name||'تطبيق المصادقة');}
function newEnrollmentName(){
 const random=globalThis.crypto?.randomUUID?.().replace(/-/g,'').slice(0,12)||String(Date.now());
 return 'AQARI V267 '+random;
}

export function openSecurityCenter(){
 const d=createDialog('الأمان والتوثيق الثنائي');if(!d)return;
 let factorId=null,qr=null,secret=null,disposed=false;
 const state=text('section',''),actions=node('section'),factors=node('section');
 d.body.append(text('p','التوثيق الثنائي مطلوب للمالك والمدير العام والمحاسب قبل العمليات الحساسة. لا تحفظ المنصة سر المصادقة داخل قاعدة بيانات الأعمال.'),state,actions,factors);
 const auth=()=>d.session.client.auth.mfa;
 function clearEnrollment(){factorId=null;secret=null;if(qr){qr.removeAttribute('src');qr.remove();qr=null;}}
 function factorList(listed){return [...(listed?.totp||[]),...(listed?.phone||[])];}
 async function assurance(){
  const data=result(await auth().getAuthenticatorAssuranceLevel());
  if(!data||!['aal1','aal2'].includes(data.currentLevel)||!['aal1','aal2'].includes(data.nextLevel))throw Error('تعذر التحقق من مستوى أمان الجلسة.');
  return data;
 }
 async function verifyCode(id,rawCode){
  const code=normalizeOtp(rawCode);
  if(!/^\d{6}$/.test(code))throw Error('أدخل رمز تحقق صحيحاً من 6 أرقام.');
  try{return result(await auth().challengeAndVerify({factorId:id,code}));}
  catch(error){
   const raw=String(error?.message||'');
   if(/invalid totp|token has expired|invalid.*code|otp/i.test(raw))throw Error('رمز المصادقة غير مطابق أو انتهت صلاحيته. استخدم الرمز الحالي الظاهر في تطبيق المصادقة، وتأكد أن ضبط الوقت في الجهاز تلقائي.');
   throw error;
  }
 }
 async function list(){
  const [level,listed]=await Promise.all([assurance(),auth().listFactors().then(result)]);
  if(disposed)return;
  state.replaceChildren(text('h2','حالة الجلسة'),text('p',level.currentLevel==='aal2'?'الجلسة محمية بعاملين.':'الجلسة الحالية بعامل واحد.'),text('p',level.nextLevel==='aal2'&&level.currentLevel!=='aal2'?'يوجد عامل موثق؛ أدخل الرمز لترقية الجلسة قبل العمليات الحساسة.':''));
  factors.replaceChildren(text('h2','أجهزة المصادقة'));
  const all=factorList(listed),verified=all.filter(item=>item.status==='verified'),pending=all.filter(item=>item.factor_type==='totp'&&item.status==='unverified');
  if(!verified.length)factors.append(text('p','لا يوجد عامل ثانٍ موثق لهذا الحساب.'));
  if(pending.length)factors.append(text('p','يوجد تسجيل تطبيق مصادقة غير مكتمل. عند إضافة تطبيق جديد سيُلغى التسجيل غير المكتمل تلقائياً ويبدأ ربط جديد.'));
  for(const factor of verified){
   const card=node('article'),verify=node('button','التحقق بهذا الجهاز'),remove=node('button','إزالة الجهاز');
   verify.type=remove.type='button';card.append(text('h3',factorDisplayName(factor)),text('p',factor.factor_type==='totp'?'رمز من تطبيق المصادقة':'رمز الهاتف'),verify,remove);
   verify.onclick=()=>d.run(()=>challenge(factor.id));remove.onclick=()=>d.run(async()=>{const current=await assurance();if(current.currentLevel!=='aal2')throw Error('يجب ترقية الجلسة إلى عاملين قبل إزالة جهاز مصادقة.');if(!window.confirm('هل تؤكد إزالة جهاز المصادقة المحدد؟'))return;result(await auth().unenroll({factorId:factor.id}));await list();d.status.textContent='تمت إزالة جهاز المصادقة.';});factors.append(card);
  }
 }
 async function challenge(id){
  clearEnrollment();factorId=id;
  const form=node('form'),code=codeInput();form.append(field('رمز التحقق المكون من 6 أرقام',code),Object.assign(node('button','تحقق من الرمز'),{type:'submit'}));
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{await verifyCode(factorId,code.value);clearEnrollment();await list();d.status.textContent='تم توثيق العامل الثاني وترقية الجلسة.';});};actions.replaceChildren(text('h2','التحقق من الجلسة'),form);code.focus();
 }
 async function removePendingTotp(){
  const listed=result(await auth().listFactors());
  const pending=factorList(listed).filter(item=>item.factor_type==='totp'&&item.status==='unverified');
  for(const factor of pending){
   try{result(await auth().unenroll({factorId:factor.id}));}
   catch(_){throw Error('تعذر إلغاء تسجيل المصادقة غير المكتمل. حدّث الصفحة ثم أعد المحاولة.');}
  }
  return pending.length;
 }
 async function enroll(){
  clearEnrollment();
  const removed=await removePendingTotp();
  const enrollmentName=newEnrollmentName();
  const enrolled=result(await auth().enroll({factorType:'totp',friendlyName:enrollmentName}));
  factorId=enrolled?.id;secret=enrolled?.totp?.secret;const qrCode=enrolled?.totp?.qr_code;
  if(!factorId||!qrCode)throw Error('تعذر بدء تسجيل تطبيق المصادقة.');
  qr=node('img');qr.alt='رمز QR لإضافة AQARI V267 إلى تطبيق المصادقة';qr.src=qrCode;qr.width=220;qr.height=220;
  const form=node('form'),code=codeInput(),cancel=node('button','إلغاء التسجيل');cancel.type='button';
  form.append(text('h2','إضافة تطبيق مصادقة'),removed?text('p','تم إلغاء التسجيل غير المكتمل السابق وبدء ربط جديد.'):text('p','بدأ ربط جديد وآمن لتطبيق المصادقة.'),text('p','امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدوياً ثم اكتب الرمز المؤقت.'),qr,text('p','المفتاح اليدوي: '+secret),field('رمز التحقق',code),Object.assign(node('button','تفعيل التوثيق الثنائي'),{type:'submit'}),cancel);
  cancel.onclick=()=>d.run(async()=>{if(factorId)result(await auth().unenroll({factorId}));clearEnrollment();actions.replaceChildren();await list();});
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{await verifyCode(factorId,code.value);clearEnrollment();actions.replaceChildren();await list();d.status.textContent='تم تفعيل التوثيق الثنائي للحساب.';});};actions.replaceChildren(form);code.focus();
 }
 const add=node('button','إضافة تطبيق مصادقة');add.type='button';add.onclick=()=>d.run(enroll);actions.append(add);
 d.onDispose(()=>{disposed=true;clearEnrollment();state.replaceChildren();actions.replaceChildren();factors.replaceChildren();});
 d.run(list);
}
