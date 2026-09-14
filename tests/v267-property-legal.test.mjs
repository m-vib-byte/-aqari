import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/property-legal-file.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-legal.js',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/v267/pages/property-hub.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build-vercel.mjs',import.meta.url),'utf8');
const verify=readFileSync(new URL('../scripts/verify-staging-runtime.mjs',import.meta.url),'utf8');

test('legal records are private, scoped and non-deletable',()=>{
 assert.match(sql,/private\.aqari_property_legal_cases/);
 assert.match(sql,/private\.aqari_property_legal_events/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on private\.aqari_property_legal_cases,private\.aqari_property_legal_events from public,anon,authenticated,service_role/);
 assert.match(sql,/PROPERTY_LEGAL_DELETE_FORBIDDEN/);
 assert.match(sql,/PROPERTY_LEGAL_EVENT_IMMUTABLE/);
});

test('legal RPC fails closed and audits mutable case changes through immutable events',()=>{
 assert.match(sql,/public\.aqari_property_legal_file/);
 assert.match(sql,/private\.aqari_can_property\(w,p,'properties','read'\)/);
 assert.match(sql,/private\.aqari_can\(w,'contracts','read'\)/);
 assert.match(sql,/private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(sql,/LEGAL_REASON_REQUIRED/);
 assert.match(sql,/LEGAL_CASE_SCOPE_MISMATCH/);
 assert.match(sql,/LEGAL_TENANT_SCOPE_MISMATCH/);
 assert.match(sql,/LEGAL_CASE_REVISION_CONFLICT/);
 assert.match(sql,/insert into private\.aqari_property_legal_events/);
 assert.match(sql,/grant execute on function public\.aqari_property_legal_file\(uuid,uuid,text,jsonb\) to authenticated/);
});

test('legal UI verifies scope and exposes case plus immutable history workflows',()=>{
 assert.match(page,/aqari_property_legal_file/);
 assert.match(page,/ctx\?\.workspace_id!==d\.session\.bound\.workspace/);
 assert.match(page,/ctx\?\.propertyId!==propertyId/);
 assert.match(page,/ctx\?\.user_id!==d\.session\.bound\.user/);
 assert.match(page,/p_action:'save_case'/);
 assert.match(page,/p_action:'add_event'/);
 assert.match(page,/الملف القانوني للعقار/);
 assert.match(page,/لا يوجد حذف فعلي بعد الحفظ/);
 assert.doesNotMatch(page,/innerHTML/);
});

test('Property Hub opens the legal file without replacing the property scope',()=>{
 assert.match(hub,/import\('\.\/property-legal\.js'\)/);
 assert.match(hub,/openPropertyLegalFile\(propertyId\)/);
 assert.match(hub,/الملف القانوني/);
});

test('exact Preview build syntax-checks and executes the legal slice',()=>{
 assert.match(verify,/src\/v267\/pages\/property-legal\.js/);
 assert.match(build,/tests\/v267-property-legal\.test\.mjs/);
});
