import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('unified layout preserves authoritative business routes and opens actual pages only after visibility',()=>{
 const source=read('src/v267/unified-layout-runtime.js');
 for(const route of ['home','properties','tenants','collectionProPage','maintenanceProPage','reports','documentsHub','settingsCenterPage'])assert.ok(source.includes(route),route);
 assert.match(source,/aqari_workspace_access/);
 assert.match(source,/AQARI_OWNER_FINAL/);
 assert.match(source,/AQARI_V199_BASE_GO/);
 assert.match(source,/AQARI_V205/);
 assert.match(source,/if\(!visible\(page\)\)throw Error\('تعذر فتح صفحة القسم الفعلية/);
 assert.match(source,/page\.scrollIntoView\?\.\(\{block:'start',behavior:'auto'\}\)/);
 assert.doesNotMatch(source,/scrollTo\(\{top:0/);
});

test('all owner requested operating domains have real unified destinations without replacing existing workflows',()=>{
 const source=read('src/v267/unified-layout-runtime.js');
 for(const key of ['properties','units','tenants','contracts','receipts','maintenance','documents','expenses','staff','reports','owners','manager','settings','tenantPortal'])assert.match(source,new RegExp(`key:'${key}'`));
 for(const service of ['unit_readiness','rental_contracts','contract_scan','financial_register','maintenance_utilities','employees_payroll','staff_access','partner_access','partner_distributions','property_statements','official_documents','financial_archive'])assert.ok(source.includes(service),service);
 assert.match(source,/فتح الوظيفة الأصلية دون إنشاء نسخة مكررة من البيانات/);
 assert.match(source,/جميع الأزرار في هذه الصفحة تفتح مسارات AQARI الأصلية/);
});

test('dashboard is operational and AI stays subordinate to management information',()=>{
 const source=read('src/v267/unified-layout-runtime.js');
 for(const label of ['تحصيل اليوم','المستحق هذا الشهر','المحصل','المتبقي / المتأخر','العقارات والوحدات','العقود والصيانة والتنبيهات','آخر العمليات','المصروفات وصافي التشغيل','إجراءات سريعة','مساعد AQARI الذكي'])assert.ok(source.includes(label),label);
 const ai=source.indexOf('مساعد AQARI الذكي');
 const collection=source.indexOf('تحصيل اليوم');
 assert.ok(collection>=0&&ai>collection,'AI must appear after primary operating data in dashboard markup');
 assert.match(source,/قراءة فقط/);
});

test('visual system is iPhone-first with dedicated iPad and desktop compositions',()=>{
 const css=read('src/v267/styles/unified-layout.css');
 assert.match(css,/--aq-u-bg:#f3eadf/);
 assert.match(css,/--aq-u-brown:#5b4233/);
 assert.match(css,/--aq-u-gold:#b88a3e/);
 assert.match(css,/--aq-u-success:#2f7855/);
 assert.match(css,/--aq-u-danger:#aa433b/);
 assert.match(css,/\.aq-unified-board\{display:grid;grid-template-columns:1fr/);
 assert.match(css,/@media\(max-width:699px\)/);
 assert.match(css,/@media\(min-width:700px\) and \(max-width:1179px\)/);
 assert.match(css,/@media\(min-width:1180px\)/);
 assert.match(css,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
 assert.match(css,/\.aq-unified-mobile-nav/);
});

test('every actual internal page receives the same structural surface and form/table identity',()=>{
 const css=read('src/v267/styles/unified-layout.css');
 const source=read('src/v267/unified-layout-runtime.js');
 assert.match(source,/document\.querySelectorAll\('main\.w > \.p'\).*aq-unified-page-surface/);
 assert.match(css,/main\.w>\.p\.aq-unified-page-surface\.on:not\(#home\)/);
 assert.match(css,/main\.w>\.p\.on:not\(#home\) :is\(input,select,textarea\)/);
 assert.match(css,/main\.w>\.p\.on:not\(#home\) :is\(table\)/);
 assert.match(css,/\.aq-unified-page-head/);
});

test('external portals share final beige brown gold system',()=>{
 const css=read('src/v267/styles/unified-portal.css');
 assert.match(css,/--aqp-bg:#f3eadf/);assert.match(css,/--aqp-brown:#5b4233/);assert.match(css,/--aqp-gold:#b88a3e/);
 assert.match(css,/@media\(max-width:699px\)/);assert.match(css,/@media\(min-width:700px\) and \(max-width:1179px\)/);assert.match(css,/@media\(min-width:1180px\)/);
});

test('unified batch does not weaken OpenAI Meta guest or owner report controls',()=>{
 const ai=read('api/owner-assistant.js'),delivery=read('api/owner-report-delivery.js'),settings=read('src/v267/pages/owner-experience-settings.js');
 assert.match(ai,/https:\/\/api\.openai\.com\/v1\/responses/);assert.match(ai,/read_only:true/);assert.doesNotMatch(ai,/tools\s*:/);
 assert.match(delivery,/graph\.facebook\.com/);assert.match(delivery,/META_WHATSAPP_ACCESS_TOKEN/);assert.match(delivery,/AQARI_EMAIL_PROVIDER_/);
 assert.match(settings,/وضع الضيف الاختياري/);assert.match(settings,/WhatsApp — Meta Cloud API/);assert.match(settings,/العقار أو مجموعة العقارات/);
});
