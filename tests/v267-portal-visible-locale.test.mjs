import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PORTAL_MESSAGES} from '../src/v267/components/portal-translations.js';
import {restorePortalLocale,savePortalLocale} from '../src/v267/components/portal-locale.js';
import {bindLocale,getLocale,direction} from '../src/v267/components/locale.js';
const tokens=s=>[...s.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)].map(m=>m[0]).sort();
test('portal templates cover all four target languages and preserve record placeholders',()=>{
 assert.equal(Object.keys(PORTAL_MESSAGES).length,106);
 for(const [source,row] of Object.entries(PORTAL_MESSAGES))for(const lang of ['en','hi','ur','ml']){
  assert.equal(typeof row[lang],'string',`${source}: ${lang}`);assert.ok(row[lang].trim());
  assert.deepEqual(tokens(row[lang]),tokens(source),`${source}: ${lang}`);
 }
});
test('anonymous portal preference survives return and storage denial does not block it',()=>{
 bindLocale(null);const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 savePortalLocale('hi',storage);bindLocale(null);restorePortalLocale(storage);
 assert.equal(getLocale(),'hi');assert.equal(direction(),'ltr');
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.doesNotThrow(()=>savePortalLocale('ur',denied));assert.doesNotThrow(()=>restorePortalLocale(denied));assert.equal(getLocale(),'ur');
});
test('login restores and changes language without modifying entered credentials',()=>{
 const handlers={};const elements={loginLanguage:{append(){},addEventListener(type,fn){handlers[type]=fn;}},status:{textContent:'تسجيل الدخول'},password:{value:'unchanged'},loginLanguageControl:{hidden:true}};
 const storage=new Map([['aqari_login_language','ur']]);const doc={documentElement:{},getElementById:id=>elements[id],querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>({})};
 vm.runInNewContext(fs.readFileSync(new URL('../v267-login-locale.js',import.meta.url),'utf8'),{document:doc,window:{localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}}});
 assert.equal(doc.documentElement.dir,'rtl');assert.equal(doc.documentElement.lang,'ur');
 elements.loginLanguage.value='ml';handlers.change();assert.equal(doc.documentElement.dir,'ltr');assert.equal(storage.get('aqari_login_language'),'ml');assert.equal(elements.password.value,'unchanged');
});
