import test from 'node:test';
import assert from 'node:assert/strict';
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
 globalThis.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{getClient:async()=>client,context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}}},addEventListener(){},removeEventListener(){},confirm:()=>true};
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
