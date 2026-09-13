import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../tenant.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/v267/tenant-maintenance-category.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../staging-database/sql/maintenance-request-category.sql',import.meta.url),'utf8');

const categories=['electrical','plumbing','air_conditioning','elevator','doors_windows','cleaning','other'];

test('tenant maintenance form exposes an explicit required category selector',()=>{
 assert.match(html,/id="maintenanceCategory" required/);
 for(const code of categories)assert.match(html,new RegExp(`value="${code}"`));
 assert.ok(html.indexOf('/src/v267/tenant-maintenance-category.js')<html.indexOf('/v267-tenant-portal.js'));
});

test('category layer intercepts the old submit path and writes the selected category',()=>{
 assert.match(ui,/stopImmediatePropagation\(\)/);
 assert.match(ui,/category_code:categoryCode/);
 assert.match(ui,/value!=='legacy_unclassified'/);
 assert.match(ui,/saved\.category_code!==categoryCode/);
 assert.match(ui,/detectSessionInUrl:false/);
});

test('existing maintenance rows remain visibly distinguishable from newly classified requests',()=>{
 assert.match(ui,/legacy_unclassified:'قديم — غير مصنف'/);
 assert.match(ui,/maintenance-category-label/);
 assert.match(ui,/النوع:/);
});

test('database source rejects unclassified new requests while preserving legacy rows',()=>{
 assert.match(sql,/update public\.aqari_maintenance_requests set category_code='legacy_unclassified'/);
 assert.match(sql,/MAINTENANCE_CATEGORY_REQUIRED/);
 assert.match(sql,/before insert or update of category_code on public\.aqari_maintenance_requests/);
 assert.match(sql,/tg_op='INSERT'/);
});

test('classified requests cannot be downgraded to the legacy sentinel',()=>{
 assert.match(sql,/old\.category_code is distinct from new\.category_code/);
 assert.match(sql,/new\.category_code='legacy_unclassified'/);
 assert.match(sql,/Ordinary status\/cost edits on untouched legacy rows/);
});
