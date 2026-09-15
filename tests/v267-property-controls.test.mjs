import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const sql=readFileSync(new URL('../staging-database/sql/property-owner-controls.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-controls.js',import.meta.url),'utf8');
const experience=readFileSync(new URL('../src/v267/components/property-experience.js',import.meta.url),'utf8');

for(const file of ['src/v267/pages/property-controls.js','src/v267/components/property-experience.js']){
 const checked=spawnSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
}

assert.match(sql,/aqari_property_custom_fields/);
assert.match(sql,/boolean','percentage','money','text','document/);
assert.match(sql,/visibility in\('internal','owner','both'\)/);
assert.match(sql,/aqari_property_feature_settings/);
assert.match(sql,/copy_features/);
assert.match(sql,/aqari_property_technicians/);
assert.match(sql,/public_to_tenant/);
assert.match(sql,/aqari_property_public_technicians/);
assert.match(sql,/aqari_property_template_scopes/);
assert.match(sql,/CONTRACT_TEMPLATE_NOT_ALLOWED_FOR_PROPERTY/);
assert.match(sql,/PROPERTY_CONTROL_DELETE_FORBIDDEN/);
assert.match(sql,/PROPERTY_CONTROL_AUDIT_IMMUTABLE/);
assert.match(sql,/private\.aqari_require_sensitive_aal2/);

assert.match(page,/إدارة خصائص العقارات — المدير العام/);
assert.match(page,/save_field/);
assert.match(page,/save_value/);
assert.match(page,/save_features/);
assert.match(page,/copy_features/);
assert.match(page,/save_technician/);
assert.match(page,/save_template_scope/);
assert.match(page,/mountRentalTemplateManager/);
assert.match(page,/إضافة خاصية مخصصة/);
assert.match(page,/يظهر للمستأجر/);
assert.match(page,/كل عقار من نفس النوع/);

assert.match(experience,/إدارة خصائص العقارات/);
assert.match(experience,/openPropertyControls/);
assert.match(experience,/role==='general_manager'/);

console.log('V267 property controls contract: PASS');
