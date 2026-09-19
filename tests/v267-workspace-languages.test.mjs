import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACE_MESSAGES} from '../src/v267/components/workspace-translations.js';
import {LANGUAGES,t,direction,bindLocale,setLocale,message} from '../src/v267/components/locale.js';
test('workspace strings have all five languages and retain record interpolation',()=>{
 assert.deepEqual(Object.keys(LANGUAGES),['ar','en','hi','ur','ml']);
 for(const [source,values] of Object.entries(WORKSPACE_MESSAGES)){
  assert.equal(t(source,'ar'),source);
  for(const language of ['en','hi','ur','ml']){assert.ok(values[language]?.trim(),source+' '+language);assert.notEqual(t(source,language),source);}
 }
 assert.equal(message('{name}',{name:'العقارات'},'en'),'العقارات');
});
test('language is scoped per account and both Arabic and Urdu use RTL',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 bindLocale({user:'one',workspace:'w'},storage);setLocale('ml',storage);
 bindLocale({user:'two',workspace:'w'},storage);assert.equal(t('الرئيسية'),'الرئيسية');
 bindLocale({user:'one',workspace:'w'},storage);assert.equal(t('الرئيسية'),'മുഖ്യപേജ്');
 assert.equal(direction('ar'),'rtl');assert.equal(direction('ur'),'rtl');
 for(const l of ['en','hi','ml'])assert.equal(direction(l),'ltr');
});
test('new dashboard UI literals are covered in every locale',()=>{
 const source=readFileSync(new URL('../src/v267/live-stability-runtime.js',import.meta.url),'utf8');
 const strings=[...source.matchAll(/(?:ui|makeMetric|panel)\('([^']+)'/g)].map(m=>m[1]);
 for(const value of strings)assert.ok(WORKSPACE_MESSAGES[value],value);
});
