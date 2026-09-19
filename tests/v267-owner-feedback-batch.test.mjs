import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('exact-reference runtime owns navigation without scroll-only fallback',()=>{
 const source=read('src/v267/owner-feedback-runtime.js');
 assert.match(source,/async function navigateRoute\(route\)/);assert.match(source,/AQARI_V205/);assert.match(source,/AQARI_V199_BASE_GO/);
 assert.match(source,/if\(!exactRouteReady\(route\)\).*return false/s);assert.match(source,/scrollIntoView/);assert.doesNotMatch(source,/scrollTo\(\{top:0/);assert.match(source,/document\.addEventListener\('click',interceptLegacy,true\)/);
});

test('reference shell compatibility remains below final beige visual layer',()=>{
 const css=read('src/v267/styles/owner-feedback-reference.css'),runtime=read('src/v267/owner-feedback-runtime.js');assert.match(css,/\.aq-exact-rail/);
 for(const key of ['الرئيسية','العقارات','الوحدات','المستأجرون','العقود','التحصيل','المصروفات','الصيانة','الموظفون والرواتب','الفواتير والأرشيف','التقارير والإحصائيات','المستندات','التنبيهات','الإعدادات'])assert.ok(runtime.includes(key),key);
});

test('owner shell stays behind authenticated data and storage boundaries',()=>{
 const source=read('src/v267/owner-feedback-runtime.js');assert.match(source,/aqari-auth-unlocked/);assert.match(source,/AQARI_DATA_GATE/);assert.match(source,/AQARI_EARLY_STORAGE_GATE/);assert.match(source,/m\.user_id!==c\?\.user\?\.id/);assert.match(source,/m\.workspace_id!==c\?\.workspace\?\.id/);
});

test('generative assistant is OpenAI Responses API server-authorized read-only and permission scoped',()=>{
 const api=read('api/owner-assistant.js');assert.match(api,/https:\/\/api\.openai\.com\/v1\/responses/);assert.match(api,/OPENAI_API_KEY/);assert.match(api,/OPENAI_MODEL/);assert.match(api,/aqari_workspace_access/);assert.match(api,/aqari_owner_experience_status/);assert.match(api,/read_only:true/);assert.match(api,/store:false/);assert.doesNotMatch(api,/OPENAI_API_KEY\s*[:=]\s*['"][^'"]+['"]/);assert.doesNotMatch(api,/tools\s*:/);
});

test('guest mode is manager controlled and fails closed without a public flag',()=>{
 const login=read('src/v267/login-owner-reference.js'),sql=read('staging-database/sql/owner-experience-settings.sql');assert.match(login,/aqari_guest_mode_status/);assert.match(login,/data_access===false/);assert.match(sql,/guest_enabled boolean not null default false/);assert.match(sql,/r is distinct from 'general_manager'/);assert.match(sql,/aqari_require_sensitive_aal2/);
});

test('owner delivery is direct Meta WhatsApp plus independent Email and live owner-property scoped',()=>{
 const api=read('api/owner-report-delivery.js'),sql=read('staging-database/sql/owner-report-targets-v3.sql'),settings=read('src/v267/pages/owner-experience-settings.js');
 assert.match(api,/graph\.facebook\.com/);assert.match(api,/META_WHATSAPP_ACCESS_TOKEN/);assert.match(api,/META_WHATSAPP_PHONE_NUMBER_ID/);assert.match(api,/AQARI_EMAIL_PROVIDER_URL/);assert.match(api,/AQARI_EMAIL_PROVIDER_TOKEN/);assert.match(api,/aqari_owner_report_delivery_targets_v3/);assert.match(api,/aqari_owner_report_service_v3/);assert.match(api,/aqari_owner_report_delivery_claim/);assert.match(api,/aqari_owner_report_delivery_complete/);
 assert.match(sql,/private\.aqari_partner_access/);assert.match(sql,/owner_user_id/);assert.match(sql,/property_ids/);assert.match(sql,/aqari_rent_due_periods/);assert.match(sql,/tenant_name/);assert.match(sql,/maintenance_open/);assert.match(sql,/arrears/);
 assert.match(settings,/Meta Cloud API/);assert.match(settings,/العقار أو مجموعة العقارات/);assert.match(settings,/owner_user_id/);assert.match(settings,/property_ids/);
});

test('feedback installer runs direct provider functional test after existing navigation and owner layers',()=>{
 const installer=read('scripts/install-v267-owner-feedback.mjs'),build=read('scripts/build-vercel.mjs'),vercel=JSON.parse(read('vercel.json'));assert.match(build,/install-v267-section-target-navigation\.mjs/);assert.match(installer,/owner-final-runtime\.js/);assert.match(installer,/v267-owner-delivery-meta\.test\.mjs/);assert.equal(vercel.buildCommand,'node scripts/build-vercel.mjs && node scripts/install-v267-owner-reference-package.mjs && node scripts/install-v267-owner-feedback.mjs');
});


test('mobile and iPad navigation expose touch-safe controls with exactly five bottom actions',()=>{
 const runtime=read('src/v267/owner-feedback-runtime.js'),css=read('src/v267/styles/owner-feedback-reference.css');
 assert.match(runtime,/\[\['home','الرئيسية'\],\['collections','التحصيل'\],\['properties','العقارات'\],\['maintenance','الصيانة'\],\['services','المزيد'\]\]/);
 assert.doesNotMatch(runtime,/\['home','collections','properties','maintenance','settings','services'\]/);
 assert.match(css,/touch-action:manipulation!important/);
 assert.match(css,/-webkit-tap-highlight-color:transparent/);
 assert.match(css,/pointer-events:auto!important/);
 assert.match(css,/grid-template-columns:repeat\(5,1fr\)/);
});
