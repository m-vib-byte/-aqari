import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('final owner runtime rechecks permissions and owns real section navigation without top-scroll fallback',()=>{
 const runtime=read('src/v267/owner-final-runtime.js');assert.match(runtime,/aqari_workspace_access/);assert.match(runtime,/routeAllowed/);assert.match(runtime,/document\.addEventListener\('click',captureNavigation,true\)/);assert.match(runtime,/main\.w > \.p/);assert.match(runtime,/scrollIntoView/);assert.doesNotMatch(runtime,/scrollTo\(\{top:0/);assert.match(runtime,/permissions\?\.\[section\]\?\.read===true/);
});

test('final visual identity is warm beige brown and gold with semantic green/red only',()=>{
 const css=read('src/v267/styles/owner-final-beige.css'),login=read('src/v267/styles/owner-final-login.css');assert.match(css,/--aq-cream:#f6efe4/);assert.match(css,/--aq-brown:#5c4435/);assert.match(css,/--aq-gold:#b5893f/);assert.match(css,/--aq-success:#2e7455/);assert.match(css,/--aq-danger:#a6463d/);assert.match(css,/@media \(min-width:700px\) and \(max-width:1179px\)/);assert.match(css,/@media \(max-width:699px\)/);assert.match(login,/linear-gradient\(155deg,#f7f0e6,#eadbc7/);assert.match(login,/\.status\.ready/);assert.match(login,/\.status\.bad/);
});

test('OpenAI assistant uses Responses API and stays read only behind live access',()=>{
 const api=read('api/owner-assistant.js');assert.match(api,/api\.openai\.com\/v1\/responses/);assert.match(api,/OPENAI_API_KEY/);assert.match(api,/gpt-5\.6-sol/);assert.match(api,/aqari_workspace_access/);assert.match(api,/store:false/);assert.match(api,/read_only:true/);assert.doesNotMatch(api,/tools\s*:/);
});

test('general manager controls owner account property groups WhatsApp Email and Kuwait timing',()=>{
 const ui=read('src/v267/pages/owner-experience-settings.js'),sql=read('staging-database/sql/owner-report-targets-v3.sql');assert.match(ui,/حساب المالك المرتبط/);assert.match(ui,/العقار أو مجموعة العقارات/);assert.match(ui,/Meta Cloud API/);assert.match(ui,/Email/);assert.match(ui,/ساعة الإرسال بتوقيت الكويت/);assert.match(ui,/aqari_owner_report_targets/);assert.match(sql,/aqari_require_sensitive_aal2/);assert.match(sql,/general_manager/);assert.match(sql,/private\.aqari_partner_access/);assert.match(sql,/report_targets_revision/);assert.match(sql,/owner_user_id/);assert.match(sql,/property_ids/);assert.match(sql,/aqari_owner_report_delivery_targets_v3/);assert.match(sql,/aqari_owner_report_service_v3/);
});

test('automatic owner report contains payer status arrears collection and important alerts',()=>{
 const api=read('api/owner-report-delivery.js'),sql=read('staging-database/sql/owner-report-targets-v3.sql'),vercel=JSON.parse(read('vercel.json'));assert.match(api,/من دفع/);assert.match(api,/من لم يسدد بالكامل/);assert.match(api,/المتأخرات السابقة/);assert.match(api,/maintenance_open/);assert.match(api,/leases_expiring_30/);assert.match(sql,/paid_count/);assert.match(sql,/partial_count/);assert.match(sql,/unpaid_count/);assert.match(sql,/arrears_count/);assert.match(sql,/tenant_name/);assert.ok(vercel.crons.some(c=>c.path==='/api/owner-report-delivery'&&c.schedule==='0 * * * *'));
});

test('Meta and Email secrets remain server-only and delivery is idempotent',()=>{
 const api=read('api/owner-report-delivery.js'),sql=read('staging-database/sql/owner-report-targets-v3.sql');for(const name of ['META_WHATSAPP_ACCESS_TOKEN','META_WHATSAPP_PHONE_NUMBER_ID','AQARI_EMAIL_PROVIDER_TOKEN','CRON_SECRET'])assert.ok(api.includes(name));assert.doesNotMatch(api,/(META_WHATSAPP_ACCESS_TOKEN|AQARI_EMAIL_PROVIDER_TOKEN|CRON_SECRET)\s*[:=]\s*['"][^'"]+['"]/);assert.match(sql,/primary key\(target_id,channel,dispatch_key\)/);assert.match(sql,/aqari_owner_report_delivery_claim/);assert.match(sql,/aqari_owner_report_delivery_complete/);
});
