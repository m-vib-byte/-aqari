import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../tenant.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/v267/tenant-maintenance-category.js',import.meta.url),'utf8');
const portal=readFileSync(new URL('../v267-tenant-portal.js',import.meta.url),'utf8');
const desk=readFileSync(new URL('../v267-service-desk.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../staging-database/sql/maintenance-request-category.sql',import.meta.url),'utf8');
const executorSql=readFileSync(new URL('../staging-database/sql/maintenance-executor-summary.sql',import.meta.url),'utf8');
const timingSql=readFileSync(new URL('../staging-database/sql/work-order-execution-timestamps.sql',import.meta.url),'utf8');

const categories=['electrical','plumbing','air_conditioning','elevator','doors_windows','cleaning','other'];

test('tenant maintenance form exposes an explicit required category selector',()=>{
 assert.match(html,/id="maintenanceCategory" required/);
 for(const code of categories)assert.match(html,new RegExp(`value="${code}"`));
 assert.ok(html.indexOf('/v267-tenant-portal.js')<html.indexOf('/src/v267/tenant-maintenance-category.js'));
});

test('category layer intercepts the old submit path and writes the selected category',()=>{
 assert.match(ui,/stopImmediatePropagation\(\)/);
 assert.match(ui,/category_code:categoryCode/);
 assert.match(ui,/value!=='legacy_unclassified'/);
 assert.match(ui,/saved\.category_code!==categoryCode/);
 assert.match(ui,/import \{client\} from '\.\.\/\.\.\/v267-tenant-portal\.js'/);
 assert.doesNotMatch(ui,/supabase\.createClient/);
 assert.match(ui,/production:'https:\/\/djkpkkgoibruaezdrchb\.supabase\.co'/);
 assert.match(portal,/export const client=window\.supabase\.createClient/);
});

test('tenant history distinguishes old unclassified requests',()=>{
 assert.match(ui,/legacy_unclassified:'قديم — غير مصنف'/);
 assert.match(ui,/maintenance-category-label/);
 assert.match(ui,/النوع:/);
});

test('admin maintenance desk reads category executor invoice expense and execution timeline',()=>{
 assert.match(desk,/workspace_id,category_code,description,status,cost,revision/);
 assert.match(desk,/const maintenanceCategories=/);
 for(const code of categories)assert.match(desk,new RegExp(`${code}:`));
 assert.match(desk,/نوع العطل: /);
 assert.match(desk,/maintenanceCategories\[row\.category_code\]/);
 assert.match(desk,/aqari_maintenance_executor_summary/);
 assert.match(desk,/الجهة المنفذة: /);
 assert.match(desk,/أمر الشغل: /);
 assert.match(desk,/المبلغ المعتمد لأمر الشغل:/);
 assert.match(desk,/فاتورة المورد:/);
 assert.match(desk,/المصروف المالي:/);
 assert.match(desk,/expense_linked/);
 assert.match(desk,/وقت التكليف:/);
 assert.match(desk,/بدء العمل:/);
 assert.match(desk,/الإنجاز:/);
 assert.match(desk,/timeZone:'Asia\/Kuwait'/);
 assert.match(desk,/:'غير موثق'/);
});

test('executor summary is narrow and property scoped with accounting and timing state only',()=>{
 assert.match(executorSql,/private\.aqari_can\(w,'maintenance','read'\)/);
 assert.match(executorSql,/private\.aqari_can_property\(w,u\.property_id,'maintenance','read'\)/);
 assert.match(executorSql,/left join private\.aqari_work_orders/);
 assert.match(executorSql,/left join private\.aqari_vendors/);
 assert.match(executorSql,/'assigned_at',o\.assigned_at/);
 assert.match(executorSql,/'started_at',o\.started_at/);
 assert.match(executorSql,/'completed_at',o\.completed_at/);
 assert.match(executorSql,/'invoice_id',o\.invoice_id/);
 assert.match(executorSql,/'expense_linked',\(o\.expense_key is not null\)/);
 assert.doesNotMatch(executorSql,/civil_or_license_no|phone|email|rating_basis/);
 assert.match(executorSql,/requested_count>50/);
});

test('work order execution times are server managed immutable and preserve historical unknowns',()=>{
 assert.match(timingSql,/add column if not exists assigned_at timestamptz/);
 assert.match(timingSql,/add column if not exists started_at timestamptz/);
 assert.match(timingSql,/WORK_ORDER_ASSIGNED_AT_IMMUTABLE/);
 assert.match(timingSql,/WORK_ORDER_STARTED_AT_IMMUTABLE/);
 assert.match(timingSql,/WORK_ORDER_COMPLETED_AT_IMMUTABLE/);
 assert.match(timingSql,/old\.status='approved' and new\.status='assigned'/);
 assert.match(timingSql,/old\.status='assigned' and new\.status='in_progress'/);
 assert.match(timingSql,/old\.status='in_progress' and new\.status='completed'/);
 assert.match(timingSql,/pg_catalog\.clock_timestamp\(\)/);
 assert.doesNotMatch(timingSql,/update private\.aqari_work_orders set assigned_at|update private\.aqari_work_orders set started_at/);
});

test('database source rejects unclassified new requests while preserving historical rows',()=>{
 assert.match(sql,/update public\.aqari_maintenance_requests set category_code='legacy_unclassified'/);
 assert.match(sql,/MAINTENANCE_CATEGORY_REQUIRED/);
 assert.match(sql,/before insert or update of category_code on public\.aqari_maintenance_requests/);
 assert.match(sql,/tg_op='INSERT'/);
});

test('classified requests cannot be downgraded back to the legacy sentinel',()=>{
 assert.match(sql,/new\.category_code='legacy_unclassified'/);
 assert.match(sql,/old\.category_code is distinct from new\.category_code/);
 assert.match(sql,/classified request can never be/);
});
