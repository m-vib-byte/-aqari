import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('exact-reference runtime owns navigation without scroll-only fallback',()=>{
 const source=read('src/v267/owner-feedback-runtime.js');
 assert.match(source,/async function navigateRoute\(route\)/);
 assert.match(source,/AQARI_V205/);
 assert.match(source,/AQARI_V199_BASE_GO/);
 assert.match(source,/if\(!exactRouteReady\(route\)\).*return false/s);
 assert.match(source,/page\?\.scrollIntoView\?\.\(\{block:'start',behavior:'auto'\}\)/);
 assert.doesNotMatch(source,/scrollTo\(\{top:0/);
 assert.match(source,/document\.addEventListener\('click',interceptLegacy,true\)/);
});

test('reference shell follows black-gold layout across desktop iPad and iPhone',()=>{
 const css=read('src/v267/styles/owner-feedback-reference.css');
 const runtime=read('src/v267/owner-feedback-runtime.js');
 assert.match(css,/--aq-black:#080b09/);assert.match(css,/--aq-gold:#e7bd55/);
 assert.match(css,/\.aq-exact-rail\{position:fixed/);assert.match(css,/grid-template-columns:repeat\(6/);
 assert.match(css,/@media screen and \(min-width:740px\) and \(max-width:1180px\)/);
 assert.match(css,/@media screen and \(max-width:739px\)/);assert.match(css,/\.aq-exact-bottom\{position:fixed/);
 for(const key of ['الرئيسية','العقارات','الوحدات','المستأجرون','العقود','التحصيل','المصروفات','الصيانة','الموظفون والرواتب','الفواتير والخدمات','التقارير والإحصائيات','المستندات','التنبيهات','الإعدادات'])assert.ok(runtime.includes(key),key);
 assert.match(runtime,/aq-exact-hero/);assert.match(runtime,/aq-exact-kpis/);assert.match(runtime,/aq-exact-property-grid/);
});

test('owner shell stays behind authenticated data and storage boundaries',()=>{
 const source=read('src/v267/owner-feedback-runtime.js');
 assert.match(source,/aqari-auth-unlocked/);assert.match(source,/AQARI_DATA_GATE/);assert.match(source,/AQARI_EARLY_STORAGE_GATE/);
 assert.match(source,/m\.user_id!==c\?\.user\?\.id/);assert.match(source,/m\.workspace_id!==c\?\.workspace\?\.id/);
 assert.match(source,/if\(!scope\(\)\|\|document\.getElementById\(ROOT_ID\)\)return/);
});

test('generative assistant is server-authorized, read-only and permission scoped',()=>{
 const api=read('api/owner-assistant.js');
 assert.match(api,/Authorization/);assert.match(api,/aqari_workspace_access/);assert.match(api,/aqari_owner_experience_status/);
 assert.match(api,/AI_PROVIDER_NOT_CONFIGURED/);assert.match(api,/AQARI_AI_PROVIDER_TOKEN/);assert.match(api,/read_only:true/);
 assert.match(api,/Only discuss sections the authenticated user is allowed to read/);
 assert.doesNotMatch(api,/AQARI_AI_PROVIDER_TOKEN\s*[:=]\s*['"][^'"]+['"]/);
});

test('guest mode is manager controlled and fails closed without a public flag',()=>{
 const login=read('src/v267/login-owner-reference.js'),sql=read('staging-database/sql/owner-experience-settings.sql');
 assert.match(login,/aqari_guest_mode_status/);assert.match(login,/return false/);assert.match(login,/data_access===false/);
 assert.match(sql,/guest_enabled boolean not null default false/);assert.match(sql,/r is distinct from 'general_manager'/);assert.match(sql,/aqari_require_sensitive_aal2/);
 assert.match(sql,/aqari_guest_mode_status/);assert.match(sql,/'data_access',false/);
 assert.doesNotMatch(sql,/delete\s+from\s+(public|private)\.aqari_/i);
});

test('automatic owner report delivery is server-only and not enabled by client code',()=>{
 const api=read('api/owner-report-delivery.js'),sql=read('staging-database/sql/owner-experience-settings.sql'),settings=read('src/v267/pages/owner-experience-settings.js');
 assert.match(api,/AQARI_OWNER_REPORT_CRON_SECRET/);assert.match(api,/AQARI_SUPABASE_SERVICE_ROLE_KEY/);assert.match(api,/AQARI_NOTIFICATION_PROVIDER_TOKEN/);
 assert.match(api,/aqari_owner_report_delivery_settings/);assert.match(api,/aqari_owner_report_service/);
 assert.match(sql,/grant execute on function public\.aqari_owner_report_delivery_settings\(\) to service_role/);
 assert.match(settings,/report_enabled/);assert.match(settings,/report_recipient/);assert.match(settings,/email/);assert.match(settings,/whatsapp/);
});

test('feedback installer remains layered after the existing navigation and owner package',()=>{
 const installer=read('scripts/install-v267-owner-feedback.mjs'),build=read('scripts/build-vercel.mjs'),vercel=JSON.parse(read('vercel.json'));
 assert.match(build,/install-v267-section-target-navigation\.mjs/);
 assert.match(installer,/owner-feedback-runtime\.js/);assert.match(installer,/v267-owner-feedback-batch\.test\.mjs/);
 assert.equal(vercel.buildCommand,'node scripts/build-vercel.mjs && node scripts/install-v267-owner-reference-package.mjs && node scripts/install-v267-owner-feedback.mjs');
});
