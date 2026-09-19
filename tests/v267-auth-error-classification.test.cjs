const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','secure-auth-bridge.js'),'utf8');
const start=source.indexOf('  function errorText(error){');
const end=source.indexOf('\n  function setBusy(',start);
assert.ok(start>=0&&end>start);
const context={};vm.runInNewContext(source.slice(start,end),context);
const errorText=context.errorText;

test('expired authentication is not reported as an inactive workspace membership',()=>{
 for(const error of [{status:401,message:'AQARI workspace access could not be verified'},{status:403,code:'session_not_found',message:'Session missing'},{status:403,code:'session_expired',message:'AQARI workspace access could not be verified'},{code:'refresh_token_not_found',message:'Token missing'}])
  assert.equal(errorText(error),'انتهت جلسة الدخول. أعد تسجيل الدخول.');
});
test('network and server errors take precedence over workspace wording',()=>{
 assert.equal(errorText({status:503,message:'workspace unavailable'}),'تعثر الاتصال الآمن مؤقتاً. أعد المحاولة بعد لحظات.');
 assert.equal(errorText({message:'Failed to fetch workspace'}),'تعذر تحميل الاتصال الآمن. تحقق من الإنترنت ثم أعد المحاولة.');
});
test('forbidden access does not invent an inactive-account diagnosis or expose details',()=>{
 for(const error of [{status:403,message:'private provider details'},{message:'active workspace membership required'}])
  assert.equal(errorText(error),'تعذر تأكيد صلاحية الوصول لهذا الحساب.');
 assert.equal(errorText({status:400,message:'Invalid login credentials'}),'البريد أو كلمة المرور غير صحيحة.');
});
