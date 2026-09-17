import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('final owner runtime rechecks permissions and owns real section navigation without top-scroll fallback',()=>{
 const runtime=read('src/v267/owner-final-runtime.js');
 assert.match(runtime,/aqari_workspace_access/);
 assert.match(runtime,/routeAllowed/);
 assert.match(runtime,/document\.addEventListener\('click',captureNavigation,true\)/);
 assert.match(runtime,/main\.w > \.p/);
 assert.match(runtime,/scrollIntoView/);
 assert.match(runtime,/data-aqari-final-route|aqariFinalRoute/);
 assert.doesNotMatch(runtime,/scrollTo\(\{top:0/);
 assert.match(runtime,/permissions\?\.\[section\]\?\.read===true/);
});

test('final visual identity is warm beige brown and gold with semantic green/red only',()=>{
 const css=read('src/v267/styles/owner-final-beige.css');
 assert.match(css,/--aq-cream:#f6efe4/);
 assert.match(css,/--aq-brown:#5c4435/);
 assert.match(css,/--aq-gold:#b5893f/);
 assert.match(css,/--aq-success:#2e7455/);
 assert.match(css,/--aq-danger:#a6463d/);
 assert.match(css,/\.aq-exact-rail/);
 assert.match(css,/main\.w>\.p\.on:not\(#home\)/);
 assert.match(css,/@media \(min-width:700px\) and \(max-width:1179px\)/);
 assert.match(css,/@media \(max-width:699px\)/);
 const login=read('src/v267/styles/owner-final-login.css');
 assert.match(login,/linear-gradient\(155deg,#f7f0e6,#eadbc7/);
 assert.match(login,/\.status\.ready/);assert.match(login,/\.status\.bad/);
});

test('OpenAI assistant uses official Responses API and stays read only behind live access',()=>{
 const api=read('api/owner-assistant.js');
 assert.match(api,/https:\/\/api\.openai\.com\/v1\/responses/);
 assert.match(api,/OPENAI_API_KEY/);assert.match(api,/OPENAI_MODEL/);
 assert.match(api,/aqari_workspace_access/);assert.match(api,/aqari_owner_experience_status/);
 assert.match(api,/store:false/);assert.match(api,/read_only:true/);
 assert.match(api,/لا تدّع مطلقًا أنك حفظت أو عدلت أو حذفت أو اعتمدت أو دفعت أو أرسلت/);
 assert.doesNotMatch(api,/tools\s*:/);
});

test('general manager controls report owners properties WhatsApp email and timing',()=>{
 const ui=read('src/v267/pages/owner-experience-settings.js');
 const sql=read('staging-database/sql/owner-report-targets-v2.sql');
 assert.match(ui,/اسم المالك \/ المستلم/);assert.match(ui,/كل العقارات/);assert.match(ui,/WhatsApp/);assert.match(ui,/Email/);assert.match(ui,/ساعة الإرسال بتوقيت الكويت/);
 assert.match(ui,/aqari_owner_report_targets/);
 assert.match(sql,/aqari_require_sensitive_aal2/);assert.match(sql,/general_manager/);assert.match(sql,/report_targets_revision/);
 assert.match(sql,/aqari_owner_report_delivery_targets/);assert.match(sql,/aqari_owner_report_service_v2/);
 assert.match(sql,/p_property_id is null or u\.property_id=p_property_id/);
});

test('automatic owner report cron supports WhatsApp first and Email additional channel',()=>{
 const api=read('api/owner-report-delivery.js'),vercel=JSON.parse(read('vercel.json'));
 assert.match(api,/CRON_SECRET/);assert.match(api,/aqari_owner_report_delivery_targets/);assert.match(api,/aqari_owner_report_service_v2/);
 assert.match(api,/channel==='whatsapp'/);assert.match(api,/channel==='email'/);
 assert.ok(vercel.crons.some(c=>c.path==='/api/owner-report-delivery'&&c.schedule==='0 * * * *'));
});

test('final installer layers beige runtime after compatibility layers and skins standalone login',()=>{
 const installer=read('scripts/install-v267-owner-feedback.mjs');
 assert.match(installer,/aqari-v267-owner-final-js/);assert.match(installer,/owner-final-runtime\.js/);
 assert.match(installer,/aqari-v267-owner-final-login-css/);assert.match(installer,/owner-final-login\.css/);
 assert.match(installer,/v267-owner-final-batch\.test\.mjs/);
});
