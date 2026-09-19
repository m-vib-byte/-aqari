import test from 'node:test';
import assert from 'node:assert/strict';
import {OPERATIONAL_MESSAGES} from '../src/v267/components/operational-translations.js';
import {ARABIC_UI_ALIASES} from '../src/v267/components/arabic-ui-aliases.js';
import {t,hasTranslation,message} from '../src/v267/components/locale.js';

test('operational UI messages have complete translations without accidental cross-language scripts',()=>{
 const foreign={en:/[\u0600-\u06ff\u0900-\u097f\u0d00-\u0d7f]/u,hi:/[\u0600-\u06ff\u0d00-\u0d7f]/u,ur:/[\u0900-\u097f\u0d00-\u0d7f]/u,ml:/[\u0600-\u06ff\u0900-\u097f]/u};
 for(const [source,values] of Object.entries(OPERATIONAL_MESSAGES)){
  assert.equal(t(source,'ar'),ARABIC_UI_ALIASES[source]||source);
  for(const language of ['en','hi','ur','ml']){
   const value=values[language];assert.equal(typeof value,'string',source+' '+language);assert.ok(value.trim(),source+' '+language);
   assert.equal(hasTranslation(source,language),true);assert.doesNotMatch(value,foreign[language],source+' '+language);
   assert.deepEqual([...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(x=>x[1]).sort(),[...source.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(x=>x[1]).sort());
   if(/\s$/.test(source))assert.match(value,/\s$/,source+' '+language);
  }
 }
});

test('record values and unsupported messages remain literal, including translated label collisions',()=>{
 for(const language of ['ar','en','hi','ur','ml']){
  assert.equal(message('{name}',{name:'المبلغ'},language),'المبلغ');
  assert.equal(message('{name}',{name:'<strong>{amount}</strong>'},language),'<strong>{amount}</strong>');
  assert.equal(hasTranslation('A record outside the message catalog',language),language==='ar');
  assert.equal(t('A record outside the message catalog',language),'A record outside the message catalog');
 }
});
