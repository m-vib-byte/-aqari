import test from 'node:test';
import assert from 'node:assert/strict';
import {bindLocale,setLocale,getLocale,direction,dateLocale,t,LANGUAGES} from '../src/v267/components/locale.js';
import {MESSAGES} from '../src/v267/components/translations.js';
import {label} from '../src/v267/components/catalog.js';
import {safeError} from '../src/v267/api/session.js';

const values=new Map();
const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
const a={user:'user-a',workspace:'workspace-a'},b={user:'user-b',workspace:'workspace-a'};

test('language persists on reload and stays separate for each account and workspace',()=>{
 bindLocale(null,storage);bindLocale(a,storage);setLocale('ml',storage);
 bindLocale(null,storage);assert.equal(bindLocale(a,storage),'ml');
 assert.equal(bindLocale(b,storage),'ar');setLocale('ur',storage);
 assert.equal(bindLocale({...a,workspace:'workspace-b'},storage),'ar');
 assert.equal(bindLocale(a,storage),'ml');assert.equal(bindLocale(b,storage),'ur');
 assert.deepEqual([...values.values()].sort(),['ml','ur']);
 bindLocale(null,storage);assert.equal(getLocale(),'ar');
});
test('invalid or unavailable storage cannot break navigation or leak another account preference',()=>{
 const unavailable={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 bindLocale(null);assert.equal(bindLocale(a,unavailable),'ar');
 assert.equal(setLocale('hi',unavailable),'hi');
 bindLocale(null);assert.equal(bindLocale(a,{getItem:()=>'<script>'}),'ar');
 assert.throws(()=>setLocale('fr'),RangeError);assert.equal(getLocale(),'ar');
 assert.throws(()=>setLocale('__proto__'),RangeError);
 bindLocale(null);
});
test('five languages use correct direction, navigation labels and date locales',()=>{
 for(const locale of Object.keys(LANGUAGES)){
  setLocale(locale,null);
  assert.equal(direction(),['ar','ur'].includes(locale)?'rtl':'ltr');
  assert.equal(label('home'),label('home',locale));
  assert.ok(new Intl.DateTimeFormat(dateLocale()).format(new Date('2026-09-08T12:00:00Z')));
 }
 bindLocale(a,storage);bindLocale(null);
});
test('every translated interface message has all four translations and Arabic fallback',()=>{
 for(const [source,translations] of Object.entries(MESSAGES)){
  assert.equal(t(source,'ar'),source);
  for(const locale of ['en','hi','ur','ml']){
   assert.ok(translations[locale]?.trim(),source+' / '+locale);
   assert.equal(t(source,locale),translations[locale]);
   assert.ok(!/[<>\x00-\x08]/.test(translations[locale]));
  }
 }
 assert.equal(t('مستأجر اختبار <سجل>', 'en'),'مستأجر اختبار <سجل>');
 assert.equal(t('إغلاق','fr'),'إغلاق');
});
test('provider failures are sanitized before translated status text is displayed',()=>{
 for(const locale of Object.keys(LANGUAGES)){
  const result=t(safeError(Error('provider_token=private')),locale);
  assert.ok(!result.includes('private'));
  assert.equal(t(safeError(Error('ACCESS_DENIED')),locale),t('لا تملك صلاحية هذه العملية.',locale));
 }
});

test('all translations preserve template placeholders, including counts and financial values',()=>{
 const slots=text=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(x=>x[1]).sort();
 for(const [source,translations]of Object.entries(MESSAGES))for(const [locale,translated]of Object.entries(translations))assert.deepEqual(slots(translated),slots(source),locale+' / '+source);
});
test('interpolation preserves stored names, decimal precision and literal markup without recursive substitutions',async()=>{
 const {message}=await import('../src/v267/components/locale.js');
 const source='الوحدة {unit} — {tenant} — {rent} د.ك';
 for(const locale of Object.keys(LANGUAGES)){
  const output=message(source,{unit:'٠١',tenant:'إغلاق <اسم> {rent} $&',rent:'125.750'},locale);
  assert.ok(output.includes('إغلاق <اسم> {rent} $&'),'stored value is not translated or re-interpolated');
  assert.ok(output.includes('٠١'));assert.ok(output.includes('125.750'));
 }
 assert.equal(message('{missing} / {empty}',{empty:null},'en'),'{missing} / ');
});
