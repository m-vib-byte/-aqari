import test from 'node:test';
import assert from 'node:assert/strict';
import {SUPABASE_PUBLIC_CONFIG} from '../lib/release-config.js';
import {openSecurityCenter} from '../src/v267/pages/security-center.js';

const tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
async function fixture(overrides={}){
 const original={window:globalThis.window,document:globalThis.document},created=[],calls=[];
 class Element{
  constructor(tag,text=''){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.value='';this.disabled=false;this.hidden=false;this.style={};this.textContent=String(text??'');this.classList={add(){},remove(){}};created.push(this);}
  get isConnected(){return this.parent?this.parent.isConnected:this.connected===true;}
  append(...nodes){for(const n of nodes){n.remove?.();this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.textContent='';this.append(...nodes);}
  querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll()]);return selector?all.filter(n=>selector.split(',').includes(n.tagName)):all;}
  setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];if(k==='src')delete this.src;}
  addEventListener(){}showModal(){}close(){}focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
 }
 const mfa={
  getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal2'}}),
  listFactors:async()=>({data:{totp:[{id:'factor-a',status:'verified',factor_type:'totp',friendly_name:'جهاز محفوظ'}],phone:[]}}),
  enroll:async()=>({data:{id:'new-factor',totp:{secret:'TEST-SECRET',qr_code:'data:image/svg+xml,test'}}}),
  challenge:async()=>({data:{id:'challenge-a'}}),verify:async()=>({data:{}}),unenroll:async()=>({data:{}}),...overrides
 };
 for(const method of Object.keys(mfa)){const fn=mfa[method];mfa[method]=(...args)=>{calls.push({method,args});return fn(...args);};}
 const client={auth:{mfa}},body=new Element('body');body.connected=true;
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag),documentElement:{lang:'ar',classList:{contains:()=>true}}};
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:SUPABASE_PUBLIC_CONFIG.url},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){},confirm:()=>true};
 openSecurityCenter();await tick();
 const dialog=body.children.find(x=>x.tagName==='dialog'),elements=()=>dialog.querySelectorAll();
 const button=label=>elements().find(x=>x.tagName==='button'&&x.textContent===label);
 return {dialog,created,calls,elements,button,close:()=>dialog.children[0].onclick(),status:()=>dialog.children[2].textContent,
  switchAccount(){window.AQARI_SUPABASE.context.user.id='different';},
  cleanup(){if(dialog.isConnected)dialog.children[0].onclick();Object.assign(globalThis,original);}};
}

test('factor challenge failure stays inside the dialog error path',async()=>{
 const f=await fixture({challenge:async()=>({error:Error('تعذر الاتصال بجهاز المصادقة.')})});
 try{await assert.doesNotReject(Promise.resolve(f.button('التحقق بهذا الجهاز').onclick()));assert.match(f.status(),/تعذر الاتصال بجهاز المصادقة/);assert.equal(f.dialog.attributes['aria-busy'],'false');}
 finally{f.cleanup();}
});

test('repeated factor clicks cannot start competing challenges',async()=>{
 const pending=deferred(),f=await fixture({challenge:()=>pending.promise});
 try{const button=f.button('التحقق بهذا الجهاز'),first=button.onclick();await tick();const second=button.onclick();await tick();assert.equal(f.calls.filter(x=>x.method==='challenge').length,1);pending.resolve({data:{id:'challenge-a'}});await Promise.all([first,second]);assert.equal(f.elements().filter(x=>x.tagName==='form').length,1);}
 finally{pending.resolve({data:{id:'challenge-a'}});f.cleanup();}
});

test('late enrollment after close never recreates QR or secret DOM',async()=>{
 const pending=deferred(),f=await fixture({enroll:()=>pending.promise});
 try{const run=f.button('إضافة تطبيق مصادقة').onclick();await tick();await f.close();pending.resolve({data:{id:'late-factor',totp:{secret:'LATE-SECRET',qr_code:'data:image/svg+xml,late'}}});await run;await tick();assert.equal(f.created.some(x=>x.tagName==='img'||x.textContent.includes('LATE-SECRET')),false);assert.equal(f.dialog.isConnected,false);}
 finally{pending.resolve({data:{}});f.cleanup();}
});

test('account change during enrollment challenge prevents verification against the new account',async()=>{
 const pending=deferred(),f=await fixture({challenge:()=>pending.promise});
 try{await f.button('إضافة تطبيق مصادقة').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';const run=form.onsubmit({preventDefault(){}});await tick();f.switchAccount();pending.resolve({data:{id:'stale-challenge'}});await run;await tick();assert.equal(f.calls.some(x=>x.method==='verify'),false);assert.match(f.status(),/تغيرت جلسة الدخول/);}
 finally{pending.resolve({data:{}});f.cleanup();}
});

test('cancelled enrollment clears its secret and restores the add action',async()=>{
 const f=await fixture();
 try{await f.button('إضافة تطبيق مصادقة').onclick();assert.ok(f.elements().some(x=>x.tagName==='img'));await f.button('إلغاء التسجيل').onclick();assert.ok(f.button('إضافة تطبيق مصادقة'));assert.equal(f.elements().some(x=>x.tagName==='img'||x.textContent.includes('TEST-SECRET')),false);assert.equal(f.calls.filter(x=>x.method==='unenroll').length,1);}
 finally{f.cleanup();}
});

test('successful factor verification removes the consumed code form',async()=>{
 const f=await fixture();
 try{await f.button('التحقق بهذا الجهاز').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';await form.onsubmit({preventDefault(){}});assert.equal(f.elements().some(x=>x.tagName==='form'),false);assert.ok(f.button('إضافة تطبيق مصادقة'));assert.equal(f.calls.filter(x=>x.method==='verify').length,1);}
 finally{f.cleanup();}
});

test('successful aal1 to aal2 token refresh keeps the same account session valid',async()=>{
 const f=await fixture({
  getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:globalThis.window.AQARI_SUPABASE.context.session?.aal||'aal1',nextLevel:'aal2'}}),
  verify:async()=>{window.AQARI_SUPABASE.context.session={access_token:'renewed-test-token',aal:'aal2'};return {data:{}};}
 });
 try{await f.button('التحقق بهذا الجهاز').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';await form.onsubmit({preventDefault(){}});assert.ok(f.dialog.isConnected);assert.match(f.status(),/تم توثيق العامل الثاني/);assert.ok(f.elements().some(x=>x.textContent==='الجلسة محمية بعاملين.'));assert.equal(f.calls.filter(x=>x.method==='verify').length,1);}
 finally{f.cleanup();}
});

test('unfinished enrollment is visible from all and blocks duplicate enrollment',async()=>{
 const f=await fixture({listFactors:async()=>({data:{all:[{id:'pending',status:'unverified',factor_type:'totp',friendly_name:'AQARI V267'}],totp:[],phone:[]}})});
 try{assert.ok(f.button('استكمال التفعيل'));await f.button('إضافة تطبيق مصادقة').onclick();assert.equal(f.calls.some(x=>x.method==='enroll'),false);assert.match(f.status(),/غير مكتمل/);await f.button('استكمال التفعيل').onclick();assert.deepEqual(f.calls.find(x=>x.method==='challenge').args,[{factorId:'pending'}]);}
 finally{f.cleanup();}
});
test('cancel pending enrollment rechecks state and preserves verified factors',async()=>{
 let pending=true;
 const f=await fixture({listFactors:async()=>({data:{all:[{id:'verified',status:'verified',factor_type:'totp'},...(pending?[{id:'pending',status:'unverified',factor_type:'totp'}]:[])]}}),unenroll:async()=>{pending=false;return {data:{}};}});
 try{await f.button('إلغاء التسجيل غير المكتمل').onclick();assert.deepEqual(f.calls.filter(x=>x.method==='unenroll').map(x=>x.args),[[{factorId:'pending'}]]);assert.ok(f.button('التحقق بهذا الجهاز'));assert.equal(f.button('استكمال التفعيل'),undefined);}
 finally{f.cleanup();}
});
test('a pending factor verified elsewhere is not removed by stale cancellation',async()=>{
 let status='unverified';const f=await fixture({listFactors:async()=>({data:{all:[{id:'pending',status,factor_type:'totp'}]}})});
 try{status='verified';await f.button('إلغاء التسجيل غير المكتمل').onclick();assert.equal(f.calls.some(x=>x.method==='unenroll'),false);assert.match(f.status(),/تغيرت حالة التسجيل/);}
 finally{f.cleanup();}
});
test('invalid TOTP leaves the form available and reports a useful error',async()=>{
 const f=await fixture({verify:async()=>({error:{code:'mfa_verification_failed',message:'Invalid TOTP'}})});
 try{await f.button('التحقق بهذا الجهاز').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';await form.onsubmit({preventDefault(){}});assert.match(f.status(),/رمز التحقق غير صحيح/);assert.ok(form.isConnected);}
 finally{f.cleanup();}
});


test('enrollment requiring higher assurance explains recovery without dismissing security center',async()=>{
 const f=await fixture({enroll:async()=>({error:{status:403,code:'insufficient_aal',message:'AAL2 required'}})});
 try{await f.button('إضافة تطبيق مصادقة').onclick();assert.ok(f.dialog.isConnected);assert.match(f.status(),/استعادة الوصول عبر مسؤول الحساب/);assert.ok(f.button('التحقق بهذا الجهاز'));assert.equal(f.calls.some(x=>['verify','unenroll'].includes(x.method)),false);assert.equal(f.elements().some(x=>x.tagName==='img'),false);}
 finally{f.cleanup();}
});
test('unrecognized enrollment authorization denial still disposes security center',async()=>{
 const f=await fixture({enroll:async()=>({error:{status:403,code:'unexpected_denial',message:'denied'}})});
 try{await f.button('إضافة تطبيق مصادقة').onclick();assert.equal(f.dialog.isConnected,false);}
 finally{f.cleanup();}
});

test('TOTP submission and retry replace the challenge created when opening the form',async()=>{
 let next=0,attempt=0;
 const f=await fixture({challenge:async()=>({data:{id:`challenge-${++next}`}}),verify:async()=>++attempt===1?{error:{code:'mfa_verification_failed'}}:{data:{}}});
 try{
  await f.button('التحقق بهذا الجهاز').onclick();
  const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';
  await form.onsubmit({preventDefault(){}});
  assert.ok(form.isConnected);assert.match(f.status(),/رمز التحقق غير صحيح/);
  await form.onsubmit({preventDefault(){}});
  assert.deepEqual(f.calls.filter(x=>x.method==='verify').map(x=>x.args[0].challengeId),['challenge-2','challenge-3']);
  assert.equal(form.isConnected,false);
 }finally{f.cleanup();}
});

test('phone verification uses its original challenge without sending a replacement code',async()=>{
 const f=await fixture({listFactors:async()=>({data:{all:[{id:'phone-a',status:'verified',factor_type:'phone'}]}})});
 try{
  await f.button('التحقق بهذا الجهاز').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';
  await form.onsubmit({preventDefault(){}});
  assert.equal(f.calls.filter(x=>x.method==='challenge').length,1);
  assert.deepEqual(f.calls.find(x=>x.method==='verify').args[0],{factorId:'phone-a',challengeId:'challenge-a',code:'123456'});
 }finally{f.cleanup();}
});

test('failed fresh TOTP challenge does not verify using the previous challenge',async()=>{
 let count=0;const f=await fixture({challenge:async()=>++count===1?{data:{id:'old'}}:{error:Error('challenge unavailable')}});
 try{
  await f.button('التحقق بهذا الجهاز').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';
  await form.onsubmit({preventDefault(){}});
  assert.equal(f.calls.some(x=>x.method==='verify'),false);assert.ok(form.isConnected);assert.match(f.status(),/تعذر إكمال العملية/);
 }finally{f.cleanup();}
});

test('account change during a fresh TOTP challenge prevents verification',async()=>{
 const pending=deferred();let count=0;const f=await fixture({challenge:()=>++count===1?Promise.resolve({data:{id:'old'}}):pending.promise});
 try{
  await f.button('التحقق بهذا الجهاز').onclick();const form=f.elements().find(x=>x.tagName==='form');form.querySelectorAll('input')[0].value='123456';
  const run=form.onsubmit({preventDefault(){}});await tick();f.switchAccount();pending.resolve({data:{id:'fresh'}});await run;
  assert.equal(f.calls.some(x=>x.method==='verify'),false);assert.match(f.status(),/تغيرت جلسة الدخول/);
 }finally{pending.resolve({data:{}});f.cleanup();}
});
