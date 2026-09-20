import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/supabase/migrations/20260920193000_v267_contract_template_studio.sql',import.meta.url),'utf8');
test('template studio migration separates draft writes from manager-only publication',()=>{
 assert.match(sql,/act='save_draft'/);assert.match(sql,/act not in\('save_draft','publish'\)/);assert.match(sql,/perform private\.aqari_require_sensitive_aal2\(w\)/);assert.match(sql,/d->'approved' is distinct from 'true'/);assert.match(sql,/status='published'/);
});
test('custom kinds and fields are validated and published snapshots remain immutable',()=>{
 assert.match(sql,/kind ~ '\^\[a-z0-9\]/);assert.match(sql,/jsonb_array_elements\(field_list\)/);assert.match(sql,/add column if not exists fields jsonb/);assert.doesNotMatch(sql,/insert into private\.aqari_system_rental_template_versions/);
});
