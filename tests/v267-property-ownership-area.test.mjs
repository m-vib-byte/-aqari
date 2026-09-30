import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/property-ownership-area.sql',import.meta.url),'utf8');
const guard=readFileSync(new URL('../staging-database/sql/property-ownership-area-evidence-guard.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-ownership.js',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/v267/pages/property-hub.js',import.meta.url),'utf8');

test('ownership area is revisioned and protected from hard delete',()=>{
 assert.match(sql,/aqari_property_ownership_heads/);
 assert.match(sql,/aqari_property_ownership_versions/);
 assert.match(sql,/aqari_property_ownership_version_immutable/);
 assert.match(sql,/aqari_property_ownership_head_no_delete/);
 assert.match(sql,/total_area_sqm numeric\(18,3\)/);
});

test('every owner or heir needs a property-scoped supporting document',()=>{
 assert.match(guard,/supportingDocumentId/);
 assert.match(guard,/d\.entity_type='property'/);
 assert.match(guard,/d\.status='uploaded'/);
 assert.match(guard,/pr\.id=p/);
 assert.match(sql,/private\.aqari_property_owners_valid/);
});

test('ownership save keeps core Property Master owners and appends ownership history',()=>{
 assert.match(sql,/public\.aqari_property_master_save/);
 assert.match(sql,/r\.value-'supportingDocumentId'/);
 assert.match(sql,/insert into private\.aqari_property_ownership_versions/);
 assert.match(sql,/PROPERTY_OWNERSHIP_REVISION_CONFLICT/);
 assert.match(sql,/PROPERTY_MASTER_REVISION_CONFLICT/);
});

test('UI shows official area, share area, evidence, unlimited add rows and readback',()=>{
 assert.match(page,/إجمالي المساحة الرسمية/);
 assert.match(page,/المساحة المقابلة/);
 assert.match(page,/المستند المؤيد/);
 assert.match(page,/\+ إضافة مالك \/ وارث/);
 assert.match(page,/crypto\.randomUUID/);
 assert.match(page,/owners\.reduce\(\(s,o\)=>s\+o\.bps,0\)!==10000/);
 assert.match(page,/فشل Readback للملكية والمساحة/);
 assert.doesNotMatch(page,/slice\(0,\s*\d+\)/);
});

test('Property Hub exposes ownership entry after bounded build install',()=>{
 assert.match(hub,/الملكية والمساحات والورثة/);
 assert.match(hub,/openPropertyPage\(d,[^;]+'openPropertyOwnership',propertyId\)/);
});
