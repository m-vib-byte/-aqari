import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../staging-database/supabase/migrations/20260921123000_v267_property_portfolio_additions.sql',import.meta.url),'utf8');
const liveMigration=readFileSync(new URL('../staging-database/supabase/migrations/20260921143000_v267_property_portfolio_live_ui.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-portfolio-additions.js',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/v267/pages/property-hub.js',import.meta.url),'utf8');
const tenantEditor=readFileSync(new URL('../src/v267/pages/imported-tenant.js',import.meta.url),'utf8');
const rentalRecords=readFileSync(new URL('../v267-rental-records.js',import.meta.url),'utf8');

test('property responsibility and tenant family records are additive, scoped and audited',()=>{
 assert.match(migration,/create table if not exists private\.aqari_property_responsibles/);
 assert.match(migration,/create table if not exists private\.aqari_tenant_family_details/);
 assert.match(migration,/before update or delete[\s\S]*aqari_reject_immutable_change/);
 assert.match(migration,/private\.aqari_can_property\(p_workspace_id,p_property_id,'properties'/);
 assert.match(migration,/TENANT_PROPERTY_SCOPE_MISMATCH/);
 assert.doesNotMatch(migration,/\b(drop table|truncate|delete from public\.aqari_|update public\.aqari_(properties|units|leases|tenants|rent_payments))\b/i);
});

test('tenant complete file remains bound to one property and includes linked leases and documents',()=>{
 assert.match(migration,/public\.aqari_tenant_complete_file/);
 assert.match(migration,/u\.property_id=p_property_id/);
 assert.match(migration,/d\.entity_type='tenant'/);
 assert.match(migration,/d\.entity_type='lease'/);
 assert.match(page,/هذا الملف مقصور على العقار المحدد/);
 assert.match(page,/الجوازات وعقد الزواج والاستلام والإخلاء/);
 assert.match(liveMigration,/public\.aqari_tenant_portfolio_context/);
 assert.match(liveMigration,/public\.aqari_rent_payments/);
 assert.match(liveMigration,/'receipts',receipts/);
 assert.match(page,/الوصولات والتحصيلات المرتبطة/);
});

test('historical lease upload is archive-only and mobile choices are explicit',()=>{
 assert.match(page,/رفع عقد قديم للأرشفة فقط/);
 assert.match(page,/category:'lease_contract'/);
 assert.match(page,/مسح\/تصوير مستند/);
 assert.match(page,/رفع ملف/);
 assert.doesNotMatch(page,/createContract|saveLease|renew/);
});

test('monthly property statement exposes paid, unpaid, discount and reason',()=>{
 assert.match(migration,/public\.aqari_property_monthly_rent/);
 assert.match(migration,/discount_reason/);
 assert.match(page,/المدفوع/);
 assert.match(page,/غير المدفوع/);
 assert.match(page,/سبب الخصم/);
});

test('property hub mounts the additions and verifies persistent save readback',()=>{
 assert.match(hub,/mountPropertyPortfolioAdditions/);
 assert.match(hub,/لم تثبت تعديلات العقار بعد إعادة القراءة/);
 assert.match(hub,/لم تثبت تعديلات الوحدة بعد إعادة القراءة/);
 assert.match(hub,/ملف المستأجر الكامل/);
 assert.match(hub,/مسح\/تصوير مستند للعقار/);
 assert.match(hub,/رفع عقد قديم للأرشفة فقط/);
});

test('legacy tenant screen exposes the complete property-scoped file and upload actions',()=>{
 assert.match(tenantEditor,/aqari_tenant_portfolio_context/);
 assert.match(tenantEditor,/العقود والمستندات والوصولات/);
 assert.match(tenantEditor,/مسح\/تصوير مستند/);
 assert.match(tenantEditor,/رفع ملف/);
 assert.match(tenantEditor,/openTenantCompleteFile/);
 assert.ok(tenantEditor.indexOf('body.append(portfolio)')<tenantEditor.indexOf('for(const [key,label]of fields()'));
 assert.match(tenantEditor,/سبب التعديل أو مرجع التصحيح \(اختياري\)/);
 assert.match(tenantEditor,/reason\.value\.trim\(\)\|\|'تحديث بيانات المستأجر'/);
 assert.doesNotMatch(tenantEditor,/أدخل سبب التعديل أو مرجع التصحيح/);
});

test('property save does not reject its own intended local edit before authoritative compare',()=>{
 assert.match(rentalRecords,/async change\(keys,mutate,verify,\{compare=keys\}=\{\}\)/);
 assert.match(rentalRecords,/module==='properties'\?\{compare:\[\]\}/);
 assert.doesNotMatch(rentalRecords,/onSaved:async\(\)=>\{[^}]*persist\(\)/);
});
