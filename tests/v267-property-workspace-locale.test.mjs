import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {t,setLocale,getLocale} from '../src/v267/components/locale.js';
import {summaryMarkup} from '../src/v267/domain/property-presentation.js';
const source=fs.readFileSync(new URL('../src/v267/platform-locale-runtime.js',import.meta.url),'utf8');
const start=source.indexOf('function translate(source){'),end=source.indexOf('\nfunction applyDirection(',start);
const runtime={t,getLocale,EXTRA_EN:{}};vm.runInNewContext(source.slice(start,end),runtime);

test('property counts retain exact values across the five interface languages',()=>{
 for(const language of ['ar','en','hi','ur','ml']){
  setLocale(language);
  for(const [input,template] of [['12 عقد موقّع سارٍ','{count} عقد موقّع سارٍ'],['12 عقد مرتبط يحتاج تحقق','{count} عقد مرتبط يحتاج تحقق'],['12 عملية','{count} عملية'],['12 بند مسجل','{count} بند مسجل']])
   assert.equal(runtime.translate(input),t(template,language).replace('{count}','12'));
  assert.equal(runtime.translate('12 من 24'),t('{count} من {total}',language).replace('{count}','12').replace('{total}','24'));
  assert.equal(runtime.translate('عمارة 12 عقد موقّع سارٍ'),'عمارة 12 عقد موقّع سارٍ');
 }
 setLocale('ar');
});
test('property locations remain record values even when they match an interface label',()=>{
 const html=summaryMarkup(['Record','Owner',1,100,{aqariPropertyPresentation:1,location:'الرئيسية',purpose:'rent',photos:[]}]);
 assert.ok(html.includes('<p data-aq-record>الرئيسية</p>'));
 const empty=summaryMarkup(['Record','Owner',1,100]);
 assert.ok(empty.includes('<p>الموقع غير مضاف</p>'));
 const property=fs.readFileSync(new URL('../v202-property-os.js',import.meta.url),'utf8');
 assert.ok(property.includes('<h2 id="v202PropertyTitle" data-aq-record>'));
 assert.ok(property.includes('<dt>المالك</dt><dd data-aq-record>'));
});
test('property financial captions localize currency and month without changing precision',()=>{
 for(const [language,locale] of Object.entries({ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'})){
  setLocale(language);
  assert.equal(runtime.translate('١٬٢٣٤٫١٢٥ د.ك'),new Intl.NumberFormat(locale,{style:'currency',currency:'KWD',minimumFractionDigits:0,maximumFractionDigits:3}).format(1234.125));
  const month=new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(2026,8,1)));
  assert.equal(runtime.translate('12 دفعة معتمدة • سبتمبر ٢٠٢٦'),t('{count} دفعة معتمدة',language).replace('{count}','12')+' • '+month);
 }
 setLocale('ar');
});

test('unit summaries localize counts and dates without treating identifiers as translated text',()=>{
 for(const [language,locale] of Object.entries({ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'})){
  setLocale(language);
  assert.equal(runtime.translate('عرض 1 من 24 وحدة'),t('عرض {count} من {total} وحدة',language).replace('{count}','1').replace('{total}','24'));
  assert.equal(runtime.translate('3 بلا بيانات تفصيلية'),t('{count} بلا بيانات تفصيلية',language).replace('{count}','3'));
  const contract='TEST-{value}-01';
  assert.equal(runtime.translate('عقد '+contract),t('عقد {value}',language).replace('{value}',contract));
  assert.equal(runtime.translate('١٠ سبتمبر ٢٠٢٦'),new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(2026,8,10))));
 }
 setLocale('ar');
});
test('unit fields protect saved names and notes even when their content matches UI messages',()=>{
 const property=fs.readFileSync(new URL('../v202-property-os.js',import.meta.url),'utf8');
 const start=property.indexOf('  function unitField('),end=property.indexOf('  function unitMoneyField(',start);
 const ctx={escapeHtml:value=>String(value)};vm.runInNewContext(property.slice(start,end),ctx);
 for(const label of ['المستأجر','رقم العقد','الهاتف / Phone','الجنسية / Nationality','المحاسب / Accountant','ملاحظات'])assert.ok(ctx.unitField(label,'الرئيسية').includes('<dd data-aq-record>الرئيسية</dd>'));
 assert.ok(ctx.unitField('المستأجر','').includes('<dd>غير مسجل</dd>'));
 assert.ok(ctx.unitField('حالة العقد','موقّع').includes('<dd>موقّع</dd>'));
});
