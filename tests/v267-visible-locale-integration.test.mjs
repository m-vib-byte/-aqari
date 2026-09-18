import test from 'node:test';
import assert from 'node:assert/strict';
import {t,message,bindLocale,setLocale,getLocale} from '../src/v267/components/locale.js';
import {safeError} from '../src/v267/api/session.js';
import {uiError} from '../src/v267/components/ui-error.js';
import {VISIBLE_MESSAGES_A} from '../src/v267/components/visible-translations-a.js';
import {VISIBLE_MESSAGES_A2} from '../src/v267/components/visible-translations-a2.js';
import {VISIBLE_MESSAGES_B} from '../src/v267/components/visible-translations-b.js';
import {VISIBLE_MESSAGES_B2} from '../src/v267/components/visible-translations-b2.js';
import {VISIBLE_MESSAGES_GUIDE} from '../src/v267/components/visible-translations-guide.js';
import {PORTAL_MESSAGES} from '../src/v267/components/portal-translations.js';

test('all classified UI catalogs have complete language values and preserve record placeholders',()=>{
 const foreign={en:/[\u0600-\u06ff\u0900-\u097f\u0d00-\u0d7f]/u,hi:/[\u0600-\u06ff\u0d00-\u0d7f]/u,ur:/[\u0900-\u097f\u0d00-\u0d7f]/u,ml:/[\u0600-\u06ff\u0900-\u097f]/u};
 const slots=s=>[...s.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(x=>x[1]).sort();
 for(const catalog of [VISIBLE_MESSAGES_A,VISIBLE_MESSAGES_A2,VISIBLE_MESSAGES_B,VISIBLE_MESSAGES_B2,VISIBLE_MESSAGES_GUIDE,PORTAL_MESSAGES])for(const [source,values] of Object.entries(catalog)){
  for(const language of ['en','hi','ur','ml']){
   const value=values[language];assert.ok(typeof value==='string'&&value.trim(),language+' '+source);
   assert.doesNotMatch(value,foreign[language],language+' '+source);assert.deepEqual(slots(value),slots(source),language+' '+source);
   const replacements=Object.fromEntries(slots(source).map(key=>[key,'Record {untouched} 12.345']));
   if(slots(source).length)assert.ok(message(source,replacements,language).includes('Record {untouched} 12.345'));
  }
 }
});

test('translated local validation errors stay precise while provider errors remain sanitized',()=>{
 for(const language of ['en','hi','ur','ml']){
  const text=message('راجع {v0}.',{v0:'Record name'},language);
  assert.equal(safeError(uiError(text)),text);
 }
 const remote={message:'private provider details',localized:true,uiError:true};
 assert.notEqual(safeError(remote),remote.message);
});

test('login choice is inherited only without a saved account preference',()=>{
 const values=new Map([['aqari_login_language','ur']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 bindLocale({workspace:'integration-test',user:'one'},storage);assert.equal(getLocale(),'ur');setLocale('ml',storage);
 bindLocale({workspace:'integration-test',user:'two'},storage);assert.equal(getLocale(),'ur');
 bindLocale({workspace:'integration-test',user:'one'},storage);assert.equal(getLocale(),'ml');
});
