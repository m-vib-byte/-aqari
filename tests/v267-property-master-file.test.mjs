import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/property-master-file.sql',import.meta.url),'utf8');
const scoped=readFileSync(new URL('../staging-database/sql/property-master-file-permissions.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-master-file.js',import.meta.url),'utf8');
const foundation=readFileSync(new URL('../src/v267/pages/contract-foundation.js',import.meta.url),'utf8');
const propertyExperience=readFileSync(new URL('../src/v267/components/property-experience.js',import.meta.url),'utf8');

test('property and unit master are authoritative, revisioned and not hard deleted',()=>{
 assert.match(sql,/create table if not exists private\.aqari_property_master\(/);
 assert.match(sql,/create table if not exists private\.aqari_unit_master\(/);
 assert.match(sql,/create table if not exists private\.aqari_property_master_audit\(/);
 assert.match(sql,/aqari_property_master_no_delete[\s\S]*aqari_reject_immutable_change/);
 assert.match(sql,/aqari_unit_master_no_delete[\s\S]*aqari_reject_immutable_change/);
 assert.match(sql,/aqari_property_master_audit_immutable[\s\S]*aqari_reject_immutable_change/);
 assert.match(sql,/PROPERTY_MASTER_REVISION_CONFLICT/);
 assert.match(sql,/UNIT_MASTER_REVISION_CONFLICT/);
});

test('unit number is independent, unique within property, and automatic reference is separate',()=>{
 assert.match(sql,/aqari_units_property_unit_no_ci_uq[\s\S]*workspace_id,property_id,lower\(btrim\(unit_no\)\)/);
 assert.match(sql,/automatic_ref text not null/);
 assert.match(sql,/UNIT_NUMBER_ALREADY_EXISTS/);
 assert.match(page,/الرقم الآلي \/ المرجع الحكومي — مستقل عن رقم الوحدة والعقد/);
});

test('owners use basis points and must total 100 percent when present',()=>{
 assert.match(sql,/aqari_property_owners_valid/);
 assert.match(sql,/sum\(\(x->>'bps'\)::integer\)/);
 assert.match(sql,/=10000/);
 assert.match(page,/مجموع حصص الملاك يجب أن يساوي 100%/);
});

test('legacy complete-property finance remains conservative until official allocation RPC is available',()=>{
 assert.match(sql,/public\.aqari_rent_payments/);
 assert.match(sql,/private\.aqari_receipt_cancellations/);
 assert.match(sql,/private\.aqari_financial_expenses/);
 assert.match(sql,/e\.state='approved'/);
 assert.match(sql,/private\.aqari_rent_due_periods/);
 assert.match(sql,/public\.aqari_utility_entries/);
 assert.match(sql,/private\.aqari_hr_payroll/);
 assert.match(sql,/'payrollIncludedInNet',false/);
 assert.match(sql,/prevents double counting employees linked to multiple properties/);
 assert.match(page,/توزيع الرواتب والخدمات الرسمي غير مفعّل/);
 assert.match(page,/لا تُخصم هذه البنود بالتخمين/);
});

test('Complete Property File enforces each sensitive section permission independently',()=>{
 for(const [flag,section] of [
  ['can_contracts','contracts'],['can_collections','collections'],['can_finance','finance'],
  ['can_employees','employees'],['can_maintenance','maintenance'],['can_documents','documents'],['can_notifications','notifications']
 ]) assert.match(scoped,new RegExp(`${flag}:=private\\.aqari_can\\(p_workspace_id,'${section}','read'\\)`));
 assert.match(scoped,/if can_contracts then[\s\S]*public\.aqari_leases/);
 assert.match(scoped,/if can_collections then[\s\S]*public\.aqari_rent_payments/);
 assert.match(scoped,/if can_finance then[\s\S]*private\.aqari_financial_expenses/);
 assert.match(scoped,/if can_employees then[\s\S]*private\.aqari_hr_payroll/);
 assert.match(scoped,/if can_documents then[\s\S]*public\.aqari_documents/);
 assert.match(scoped,/if can_notifications then[\s\S]*private\.aqari_property_channels/);
 assert.match(scoped,/'finance',case when can_collections and can_finance/);
 assert.match(scoped,/'permissions',jsonb_build_object/);
 assert.match(page,/propertyWritable\(\)/);
 assert.match(page,/documentsWritable\(\)/);
 assert.match(page,/contractWritable\(\)/);
 assert.match(page,/financeWritable\(\)/);
});

test('permission-hidden property sections are distinct from genuinely empty datasets',()=>{
 assert.match(page,/غير متاح حسب الصلاحية/);
 assert.match(page,/const count=value=>value==null\?'غير متاح'/);
 assert.match(page,/renderPermissionRows\(contracts,permissions\.contracts/);
 assert.match(page,/renderPermissionRows\(collections,permissions\.collections/);
 assert.match(page,/renderPermissionRows\(expenses,permissions\.finance/);
 assert.match(page,/renderPermissionRows\(docs,permissions\.documents/);
 assert.match(page,/permissions\.notifications===false/);
 assert.match(page,/permissions\.collections===false\|\|permissions\.finance===false/);
});

test('property card and name helper use the secure Supabase client with session scope recheck',()=>{
 assert.match(propertyExperience,/ملف كامل/);
 assert.match(propertyExperience,/getClient/);
 assert.doesNotMatch(propertyExperience,/AQARI_SUPABASE\?\.client/);
 assert.match(propertyExperience,/property-master-file\.js/);
 assert.match(page,/getClient/);
 assert.doesNotMatch(page,/AQARI_SUPABASE\?\.client/);
 assert.match(page,/initialUser/);
 assert.match(page,/initialWorkspace/);
 assert.match(page,/assertSameScope/);
 assert.match(page,/aqari_property_full_file/);
 assert.match(page,/إبرام عقد من هذه الوحدة/);
 assert.match(page,/propertyId,unitId:unit\.id/);
 assert.match(page,/aqari_property_contract_context/);
});

test('complete property file can add a new unit then persist floor and independent master fields',()=>{
 assert.match(page,/\+ إضافة وحدة وربط الدور/);
 assert.match(page,/aqari_unit_readiness_register/);
 assert.match(page,/expected_revision:0/);
 assert.match(page,/aqari_unit_master_save/);
 assert.match(page,/p_unit_id:readinessRow\.unit_id/);
 assert.match(page,/floor:floorInput\.value\.trim\(\)/);
 assert.match(page,/automaticRef:automaticRef\.value\.trim\(\)/);
 assert.match(page,/saved\.unit\.floor!==floorInput\.value\.trim\(\)/);
});

test('complete property file can archive later property assets without deleting prior evidence',()=>{
 assert.match(page,/createOriginalDocumentUpload/);
 assert.match(page,/\+ رفع وأرشفة مرفق/);
 assert.match(page,/property_logo/);
 assert.match(page,/property_photo/);
 assert.match(page,/title_deed/);
 assert.match(page,/site_plan/);
 assert.match(page,/property_other/);
 assert.match(page,/aqari_property_master_save/);
 assert.match(page,/المرفق مؤرشف لكنه لم يظهر في الملف الكامل/);
 assert.doesNotMatch(page,/\.storage\.from\([^)]*\)\.remove\(/);
 assert.doesNotMatch(page,/\.from\([^)]*\)\.delete\(/);
});

test('complete property file exposes staff and maintenance detail through permission-scoped server paths',()=>{
 assert.match(page,/p_action:'list'/);
 assert.match(page,/aqari_hr/);
 assert.match(page,/row\.property_ids\.includes\(propertyId\)/);
 assert.match(page,/aqari_maintenance_requests/);
 assert.match(page,/\.in\('lease_id',leaseIds\)/);
 assert.match(page,/الموظفون والرواتب المرتبطة/);
 assert.match(page,/الصيانة/);
});

test('allocated finance is preferred only when its server RPC exists and validates scope',()=>{
 assert.match(page,/aqari_property_financial_summary/);
 assert.match(page,/financialSummary\?\.available\?financialSummary:legacyFinance/);
 assert.match(page,/missingRpc\(error\)/);
 assert.match(page,/unallocatedSharedPayroll/);
 assert.match(page,/توزيع الرواتب والمصاريف على العقارات/);
 assert.match(page,/property-cost-allocation\.js/);
});

test('contract foundation stores stable ids and rereads unit-property-floor binding before save',()=>{
 assert.match(foundation,/propertyId:launch\?\.property\?\.id/);
 assert.match(foundation,/unitId:launch\?\.unit\?\.id/);
 assert.match(foundation,/propertyAddress:launch\?\.property\?\.address/);
 assert.match(foundation,/async function verifyBinding/);
 assert.match(foundation,/await verifyBinding\(floor\.value\)/);
 assert.match(foundation,/UNIT|unitId/);
 assert.match(foundation,/automaticUnitRef:fresh\.unit\.automaticRef/);
 assert.match(foundation,/معرف العقار والوحدة والدور/);
 assert.doesNotMatch(foundation,/b\[k\]/,'object equality helper must compare by the current key');
 assert.match(foundation,/b\[key\]/);
});
