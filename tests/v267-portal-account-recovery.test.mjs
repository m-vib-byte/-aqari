import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPortalAccountRecovery,portalRecoveryCallback,recoveryRedirect,recoveryOtpEnabled,recoveryText} from '../src/v267/components/portal-account-recovery.js';

const event={preventDefault(){}},tick=()=>new Promise(r=>setTimeout(r,0));
class Element{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this[key]=value;}focus(){this.focused=true;}
}
function fixture(options={}){
 const doc={createElement:tag=>new Element(tag,doc)},container=doc.createElement('section'),button=doc.createElement('button'),calls=[],callbacks=new Set();
 let locale='ar',identity='account-a',entered=0,exited=0,closed=0,clock=1000;
 const emit=(event,user=identity)=>{for(const fn of callbacks)fn(event,user?{user:{id:user}}:null);};
 const auth={
  onAuthStateChange(fn){callbacks.add(fn);return {data:{subscription:{unsubscribe(){callbacks.delete(fn);}}}};},
  async resetPasswordForEmail(email,values){calls.push(['request',email,values]);return options.request?options.request():{};},
  async verifyOtp(values){calls.push(['verify',values]);if(options.verify)return options.verify(emit);emit('PASSWORD_RECOVERY');return {data:{session:{user:{id:identity}}}};},
  async getSession(){calls.push(['session']);return {data:{session:{user:{id:identity}}}};},
  async getUser(){calls.push(['user']);return {data:{user:{id:identity}}};},
  async updateUser(values){calls.push(['update',values]);return options.update?options.update():{data:{user:{id:identity}}};},
  async signOut(values){calls.push(['signout',values]);emit('SIGNED_OUT',null);return {};}
 };
 const api=mountPortalAccountRecovery({container,button,portal:options.portal||'tenant',config:{supabaseUrl:'https://isolated.example',supabasePublishableKey:'synthetic',supabaseAuthStorageKey:'isolated',...(options.otp?{supabaseRecovery:{mode:'email_otp',templateVerified:true}}:{})},location:{origin:'https://current-preview.example',hash:''},createClient(url,key,settings){calls.push(['client',settings]);return {auth};},fetcher:async()=>{throw Error('NO_REAL_NETWORK');},getLocale:()=>locale,getEmail:()=> ' account@example.test ',onEnter(){entered++;},async onExit(value){calls.push(['exit',value]);exited++;if(options.exitError)throw Error('PRIVATE_PROVIDER');},onClosed(){closed++;},timeoutMs:options.timeout||200,cooldownMs:options.cooldownMs||60000,now:options.now||(()=>clock)});
 const [heading,help,requestForm,codeForm,passwordForm,status,back]=container.children;
 const email=requestForm.children[1],code=codeForm.children[1],password=passwordForm.children[1],confirmation=passwordForm.children[3];
 return {api,container,button,heading,help,requestForm,codeForm,passwordForm,status,back,email,code,password,confirmation,calls,auth,emit,get entered(){return entered;},get exited(){return exited;},get closed(){return closed;},advance(){clock+=60001;},locale(value){locale=value;api.refresh();},identity(value){identity=value;}};
}
async function requested(f){f.button.onclick();await f.requestForm.onsubmit(event);}
async function verified(f){await requested(f);f.code.value='123456';await f.codeForm.onsubmit(event);}

test('OTP requires explicit verified email-template configuration and defaults to recovery links',()=>{
 for(const config of [{},{supabaseRecovery:true},{supabaseRecovery:{mode:'email_otp'}},{supabaseRecovery:{mode:'email_otp',templateVerified:'true'}},{supabaseRecovery:{mode:'link',templateVerified:true}}])assert.equal(recoveryOtpEnabled(config),false);
 assert.equal(recoveryOtpEnabled({supabaseRecovery:{mode:'email_otp',templateVerified:true}}),true);
});
test('recovery redirect stays on the current HTTPS preview and drops untrusted query/fragment',()=>{
 assert.equal(recoveryRedirect({origin:'https://current-preview.example',search:'?redirect=https://evil.invalid',hash:'#token=secret'}),'https://current-preview.example/reset-password.html');
 assert.throws(()=>recoveryRedirect({origin:'http://public.example'}));
 assert.equal(portalRecoveryCallback({hash:'#type=recovery&access_token=synthetic'}),'/reset-password.html#type=recovery&access_token=synthetic');
 assert.equal(portalRecoveryCallback({hash:'#error_code=otp_expired'}),'/reset-password.html#error_code=otp_expired');
 assert.equal(portalRecoveryCallback({hash:'#type=signup'}),null);
});
test('standard link request uses an isolated memory client and does not read ordinary sessions',async t=>{
 const f=fixture();t.after(()=>f.api.close());await requested(f);
 assert.equal(f.entered,1);assert.equal(f.email.value,'account@example.test');assert.equal(f.codeForm.hidden,true);assert.equal(f.passwordForm.hidden,true);
 assert.deepEqual(f.calls.find(c=>c[0]==='request'),['request','account@example.test',{redirectTo:'https://current-preview.example/reset-password.html'}]);
 const settings=f.calls.find(c=>c[0]==='client')[1];assert.deepEqual(settings.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'isolated-tenant-recovery'});
 assert.equal(f.calls.some(c=>['session','user','verify','update','signout'].includes(c[0])),false);assert.match(f.status.textContent,/إذا كان الحساب موجودًا/);
});
test('invalid email never contacts Auth and duplicate requests are throttled without revealing existence',async t=>{
 const f=fixture();t.after(()=>f.api.close());f.api.open();f.email.value='not-email';await f.requestForm.onsubmit(event);assert.equal(f.calls.length,0);
 f.email.value='account@example.test';await f.requestForm.onsubmit(event);await f.requestForm.onsubmit(event);assert.equal(f.calls.filter(c=>c[0]==='request').length,1);
 f.advance();await f.requestForm.onsubmit(event);assert.equal(f.calls.filter(c=>c[0]==='request').length,2);
});
test('failed email request hides provider details and does not claim delivery',async t=>{
 const f=fixture({request:async()=>({error:{message:'PRIVATE_PROVIDER/account@example.test'}})});t.after(()=>f.api.close());await requested(f);
 assert.match(f.status.textContent,/تعذر تأكيد/);assert.equal(f.status.textContent.includes('PRIVATE_PROVIDER'),false);assert.equal(f.codeForm.hidden,true);
});
test('returning while request is pending clears fields and ignores a late response',async t=>{
 let resolve;const f=fixture({request:()=>new Promise(r=>resolve=r)});t.after(()=>f.api.close());f.api.open();const work=f.requestForm.onsubmit(event);await tick();await f.back.onclick();assert.equal(f.api.active,false);assert.equal(f.email.value,'');resolve({});await work;assert.equal(f.container.hidden,true);assert.equal(f.closed,1);
});
test('unconfigured OTP cannot invoke verification even if a handler is called directly',async t=>{
 const f=fixture();t.after(()=>f.api.close());await requested(f);f.code.value='123456';await f.codeForm.onsubmit(event);assert.equal(f.calls.some(c=>c[0]==='verify'),false);
});
test('OTP recovery verifies identity before password update, clears secrets and ends sessions',async t=>{
 const f=fixture({otp:true,portal:'partner'});t.after(()=>f.api.close());await requested(f);assert.equal(f.codeForm.hidden,false);assert.equal(f.email.readOnly,true);
 f.code.value='١٢٣٤٥٦';await f.codeForm.onsubmit(event);assert.equal(f.code.value,'');assert.equal(f.passwordForm.hidden,false);assert.equal(f.password.disabled,false);
 assert.deepEqual(f.calls.find(c=>c[0]==='verify'),['verify',{email:'account@example.test',token:'123456',type:'recovery'}]);
 f.password.value='new-password-123';f.confirmation.value='new-password-123';const saved=f.passwordForm.onsubmit(event);assert.equal(f.password.value,'');assert.equal(f.confirmation.value,'');await saved;
 assert.deepEqual(f.calls.filter(c=>c[0]==='update'),[['update',{password:'new-password-123'}]]);assert.deepEqual(f.calls.find(c=>c[0]==='signout'),['signout',{scope:'global'}]);assert.match(f.status.textContent,/تم تغيير كلمة المرور/);
 await f.back.onclick();assert.equal(f.api.active,false);assert.deepEqual(f.calls.at(-1),['exit',{verified:true}]);
});
test('invalid or expired OTP never enables password save and may retry explicitly',async t=>{
 const f=fixture({otp:true,verify:async()=>({error:{message:'PRIVATE_PROVIDER'}})});t.after(()=>f.api.close());await requested(f);f.code.value='12';await f.codeForm.onsubmit(event);assert.equal(f.calls.some(c=>c[0]==='verify'),false);
 f.code.value='123456';await f.codeForm.onsubmit(event);assert.equal(f.passwordForm.hidden,true);assert.match(f.status.textContent,/الرمز غير صالح/);assert.equal(f.status.textContent.includes('PRIVATE_PROVIDER'),false);assert.equal(f.calls.some(c=>c[0]==='update'),false);
});
test('ordinary sign-in event and session cannot authorize an OTP recovery password form',async t=>{
 const f=fixture({otp:true,timeout:15,verify:async emit=>{emit('SIGNED_IN');return {data:{session:{user:{id:'account-a'}}}};}});t.after(()=>f.api.close());await verified(f);assert.equal(f.password.disabled,true);assert.match(f.status.textContent,/انتهت جلسة/);assert.equal(f.calls.some(c=>c[0]==='update'),false);
});
test('identity switch after verified recovery closes the form without updating a different user',async t=>{
 const f=fixture({otp:true});t.after(()=>f.api.close());await verified(f);f.identity('account-b');f.emit('SIGNED_IN');f.password.value='new-password-123';f.confirmation.value='new-password-123';await f.passwordForm.onsubmit(event);assert.equal(f.calls.some(c=>c[0]==='update'),false);assert.equal(f.password.disabled,true);
});
test('uncertain password write cannot be repeated and keeps provider details private',async t=>{
 const f=fixture({otp:true,update:async()=>({error:{message:'PRIVATE_PROVIDER'}})});t.after(()=>f.api.close());await verified(f);f.password.value=f.confirmation.value='new-password-123';await f.passwordForm.onsubmit(event);assert.match(f.status.textContent,/تعذر تأكيد نتيجة الحفظ/);assert.equal(f.password.disabled,true);await f.passwordForm.onsubmit(event);assert.equal(f.calls.filter(c=>c[0]==='update').length,1);
});
test('all five current interface languages cover request, verification and recovery outcomes',async t=>{
 const keys=['forgot','title','email','help','otpHelp','send','sent','sending','sendFailed','wait','emailInvalid','code','verify','verifying','codeInvalid','verifyFailed','password','confirm','save','ready','validation','saving','signingOut','complete','expired','uncertain','signoutFailed','back','closing','closeFailed'];
 for(const locale of ['ar','en','hi','ur','ml'])for(const key of keys){assert.ok(recoveryText(key,locale));if(locale!=='ar')assert.notEqual(recoveryText(key,locale),recoveryText(key,'ar'));}
 const f=fixture();t.after(()=>f.api.close());await requested(f);f.locale('en');assert.equal(f.button.textContent,'Forgot password');assert.match(f.status.textContent,/If the account exists/);assert.equal(f.email.value,'account@example.test');
});

test('returning and reopening during cooldown enables another request after the remaining delay',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let clock=1000;
 const advance=milliseconds=>{clock+=milliseconds;t.mock.timers.tick(milliseconds);};
 const f=fixture({now:()=>clock});t.after(()=>f.api.close());
 await requested(f);advance(10000);await f.back.onclick();advance(5000);f.api.open();
 assert.equal(f.requestForm.children.at(-1).disabled,true);
 advance(44999);
 assert.equal(f.requestForm.children.at(-1).disabled,true,'the original one-minute cooldown must not end early');
 advance(2);
 assert.equal(f.requestForm.children.at(-1).disabled,false,'reopening must schedule only the remaining delay');
 await f.requestForm.onsubmit(event);
 assert.equal(f.calls.filter(call=>call[0]==='request').length,2);
});
