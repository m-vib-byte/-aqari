import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../login.html',import.meta.url),'utf8');
const start=source.indexOf('function friendlyError(error){');
const end=source.indexOf('async function loadCore',start);
assert.ok(start>=0 && end>start);
const friendly=runInNewContext('('+source.slice(start,end)+')');
const cases=[
 ['wrong password',{message:'Invalid login credentials'},'البريد أو كلمة المرور غير صحيحة.'],
 ['unconfirmed email',{message:'Email not confirmed'},'أكد البريد الإلكتروني أولاً ثم حاول الدخول.'],
 ['session expiry',{code:'session_expired',message:'AQARI workspace access could not be verified'},'انتهت جلسة الدخول. سجل الدخول من جديد.'],
 ['superseded context',{reason:'AQARI_CONTEXT_SUPERSEDED',code:'AQARI_ACCESS_CHANGED'},'تغيرت محاولة التحقق من الجلسة. أعد محاولة الدخول.'],
 ['startup timeout',{code:'AQARI_STARTUP_TIMEOUT'},'تعذر الاتصال الآن. اضغط «إعادة محاولة الاتصال».'],
 ['network workspace error',{message:'workspace network timeout'},'تعذر الاتصال الآن. اضغط «إعادة محاولة الاتصال».'],
 ['unverified workspace',{code:'AQARI_ACCESS_CHANGED',message:'AQARI workspace access could not be verified'},'تعذر تأكيد صلاحية الوصول لهذا الحساب. لم يتأكد أن الحساب غير مفعّل.'],
 ['denied access is not proof of inactivity',{code:'AQARI_ACCESS_DENIED'},'تعذر تأكيد صلاحية الوصول لهذا الحساب. لم يتأكد أن الحساب غير مفعّل.'],
 ['unknown error contains no raw text',{message:'private diagnostic'},'تعذر إكمال الطلب. أعد المحاولة.'],
 ['login deadline',{code:'AQARI_TIMEOUT',stage:'التحقق من الحساب'},'انتهت مهلة التحقق من الحساب والصلاحيات. لم يتأكد اكتمال الدخول.']
];
for(const [name,error,expected] of cases)test(name,()=>assert.equal(friendly(error),expected));
