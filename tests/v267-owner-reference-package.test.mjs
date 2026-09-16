import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('owner reference runtime keeps existing routes and delegates real workflows',()=>{
 const runtime=read('src/v267/owner-reference-runtime.js');
 assert.match(runtime,/route:'properties'/);
 assert.match(runtime,/route:'collectionProPage'/);
 assert.match(runtime,/route:'maintenanceProPage'/);
 assert.match(runtime,/service:'rental_contracts'/);
 assert.match(runtime,/\.\/pages\/bank-reconciliation\.js/);
 assert.match(runtime,/\.\/pages\/vacating-settlement\.js/);
 assert.match(runtime,/\.\/pages\/owner-report\.js/);
 assert.match(runtime,/\.\/pages\/approval-center\.js/);
 assert.match(runtime,/\.\/pages\/tenant-timeline\.js/);
 assert.match(runtime,/معاينة كضيف — بدون بيانات/);
 assert.match(runtime,/لا يرسل بياناتك إلى مزود ذكاء خارجي/);
 assert.doesNotMatch(runtime,/service_role|SUPABASE_SERVICE|secret|password\s*=/i);
});

test('new centers reuse authoritative data and approval surfaces',()=>{
 const tasks=read('src/v267/pages/owner-task-center.js');
 const report=read('src/v267/pages/owner-report.js');
 const approvals=read('src/v267/pages/approval-center.js');
 const timeline=read('src/v267/pages/tenant-timeline.js');
 assert.match(tasks,/readManagementCounters/);
 assert.match(tasks,/openLeaseExpiryReport/);
 assert.match(report,/aqari_kpi_dashboard/);
 assert.match(report,/readManagementCounters/);
 assert.match(approvals,/openLeaseReview/);
 assert.match(approvals,/openFinancialRegister/);
 assert.match(approvals,/openPartnerDistributions/);
 assert.match(approvals,/openVacatingReview/);
 assert.match(timeline,/aqari_workspace_access/);
 assert.match(timeline,/aqari_tenants/);
 assert.match(timeline,/aqari_leases/);
 assert.match(timeline,/aqari_rent_payments/);
 assert.match(timeline,/aqari_maintenance_requests/);
 assert.match(timeline,/aqari_documents/);
 assert.doesNotMatch(timeline,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('black gold visual layer is responsive and does not rewrite data rules',()=>{
 const css=read('src/v267/styles/owner-reference.css');
 assert.match(css,/--aq-bg:#070805/);
 assert.match(css,/--aq-gold:#c79b45/);
 assert.match(css,/\.aq-owner-rail/);
 assert.match(css,/@media screen and \(min-width:1180px\)/);
 assert.match(css,/@media screen and \(min-width:700px\) and \(max-width:1179px\)/);
 assert.match(css,/@media screen and \(max-width:699px\)/);
 assert.match(css,/#aqariCloudGateV168/);
 assert.match(css,/@media print/);
 assert.doesNotMatch(css,/service_role|SUPABASE_SERVICE|api[_-]?key/i);
});

test('owner package installs after the fixed navigation build without replacing it',()=>{
 const installer=read('scripts/install-v267-owner-reference-package.mjs');
 const build=read('scripts/build-vercel.mjs');
 const vercel=JSON.parse(read('vercel.json'));
 assert.match(installer,/aqari-v267-owner-reference-js/);
 assert.match(installer,/type='module'/);
 assert.match(installer,/owner-reference-runtime\.js/);
 assert.ok(build.includes("scripts/install-v267-section-target-navigation.mjs"),'navigation blocker installer must remain in build');
 assert.equal(vercel.buildCommand,'node scripts/build-vercel.mjs && node scripts/install-v267-owner-reference-package.mjs');
});
