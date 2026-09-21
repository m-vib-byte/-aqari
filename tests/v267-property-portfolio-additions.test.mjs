import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../staging-database/supabase/migrations/20260921123000_v267_property_portfolio_additions.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-portfolio-additions.js',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/v267/pages/property-hub.js',import.meta.url),'utf8');

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
});
