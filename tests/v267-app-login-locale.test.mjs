import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAppLoginLocale} from '../src/v267/app-login-locale.js';
import {bindLocale,getLocale,setLocale,t} from '../src/v267/components/locale.js';

function fixture({on=true,hidden=false,unlocked=false,hasForm=true}={}){
 const attrs=new Map(),picker={value:'',getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v)},caption={textContent:''};
 const credential={get value(){throw Error('Credential value must not be read');},set value(_){throw Error('Credential value must not be changed');}};
 const status={nodeValue:'أدخل البريد الإلكتروني وكلمة المرور للدخول.',parentElement:{closest:()=>null}};
 const root={classList:{contains:name=>name==='aqari-auth-unlocked'&&unlocked}};
 const gate={hidden,classList:{contains:()=>on},querySelector:s=>s.includes('cloud')?(hasForm?credential:null):s==='[data-app-login-language]'?picker:caption,querySelectorAll:()=>[],getAttribute:k=>attrs.get('gate:'+k)??null,setAttribute:(k,v)=>attrs.set('gate:'+k,v),closest:()=>null};
 const doc={documentElement:root,getElementById:()=>gate,createTreeWalker:()=>{let done=false;return {nextNode:()=>done?null:(done=true,status)};}};
 return {doc,status,root,picker};
}
function environment(fn){
 const previousObserver=globalThis.MutationObserver,previousStorage=globalThis.localStorage;
 let disconnected=false;
 globalThis.MutationObserver=class{observe(){}disconnect(){disconnected=true;}};
 globalThis.localStorage={getItem:()=> 'ur',setItem(){}};
 try{fn(()=>disconnected);}finally{globalThis.MutationObserver=previousObserver;globalThis.localStorage=previousStorage;bindLocale(null);}
}
test('a dormant gate never resets the verified workspace preference',()=>environment(()=>{
 for(const flags of [{on:false},{hidden:true},{unlocked:true}]){
  bindLocale(null);setLocale('ml');const {doc}=fixture(flags);const mounted=mountAppLoginLocale(doc);
  assert.equal(getLocale(),'ml');mounted.refresh();assert.equal(getLocale(),'ml');mounted.dispose();
 }
}));
test('visible login translates status and direction while leaving credentials untouched',()=>environment(disconnected=>{
 bindLocale(null);const {doc,status,root,picker}=fixture();const mounted=mountAppLoginLocale(doc);
 assert.equal(getLocale(),'ur');assert.equal(root.dir,'rtl');assert.equal(picker.value,'ur');
 assert.equal(status.nodeValue,t('أدخل البريد الإلكتروني وكلمة المرور للدخول.','ur'));
 setLocale('ml');mounted.refresh();assert.equal(root.dir,'ltr');assert.equal(picker.value,'ml');
 assert.equal(status.nodeValue,t('أدخل البريد الإلكتروني وكلمة المرور للدخول.','ml'));
 mounted.dispose();assert.equal(disconnected(),true);
}));
test('session, connectivity and access errors render in each selected login language',()=>environment(()=>{
 const messages=['انتهت جلسة الدخول. أعد تسجيل الدخول.','تعذر تأكيد صلاحية الوصول لهذا الحساب.','تعثر الاتصال الآمن مؤقتاً. أعد المحاولة بعد لحظات.','تعذر تحميل الاتصال الآمن. تحقق من الإنترنت ثم أعد المحاولة.'];
 for(const source of messages){
  bindLocale(null);const {doc,status,root}=fixture();status.nodeValue=source;
  const mounted=mountAppLoginLocale(doc);
  for(const language of ['ar','en','hi','ur','ml']){
   setLocale(language);mounted.refresh();
   assert.equal(status.nodeValue,t(source,language));
   if(language!=='ar')assert.notEqual(status.nodeValue,source,language+' '+source);
   assert.equal(root.dir,['ar','ur'].includes(language)?'rtl':'ltr');
  }
  mounted.dispose();
 }
}));

test('session restoration translates before credential inputs exist',()=>environment(()=>{
 bindLocale(null);const {doc,status,root}=fixture({hasForm:false});
 status.nodeValue='جاري استعادة الجلسة وفتح الصفحة الرئيسية…';
 const mounted=mountAppLoginLocale(doc);
 for(const language of ['ar','en','hi','ur','ml']){
  setLocale(language);mounted.refresh();
  assert.equal(status.nodeValue,t('جاري استعادة الجلسة وفتح الصفحة الرئيسية…',language));
  if(language!=='ar')assert.notEqual(status.nodeValue,'جاري استعادة الجلسة وفتح الصفحة الرئيسية…');
  assert.equal(root.dir,['ar','ur'].includes(language)?'rtl':'ltr');
 }
 mounted.dispose();
}));
