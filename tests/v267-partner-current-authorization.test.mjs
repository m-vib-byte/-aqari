import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ownerInstaller=readFileSync(new URL('../scripts/install-v267-partner-owner-fields.mjs',import.meta.url),'utf8');
const financeInstaller=readFileSync(new URL('../scripts/install-v267-partner-property-finance.mjs',import.meta.url),'utf8');
const financeView=readFileSync(new URL('../src/v267/components/partner-property-finance-view.js',import.meta.url),'utf8');

test('partner owner-field overlay exposes only validated public shape',()=>{
 assert.match(ownerInstaller,/allowedTypes=new Set\(\['boolean','percentage','money','text','document'\]\)/);
 assert.match(ownerInstaller,/allowedKeys=new Set\(\['label_ar','label_en','type','value'\]\)/);
 assert.match(ownerInstaller,/aqari_partner_owner_fields/);
 assert.match(ownerInstaller,/kind==='owner_fields'/);
 assert.doesNotMatch(ownerInstaller,/innerHTML/);
});

test('partner finance overlay binds exact property/workspace/period and validates integer fils',()=>{
 assert.match(financeInstaller,/aqari_partner_property_finance/);
 assert.match(financeInstaller,/data\.property_id!==propertyId\|\|data\.workspace_id!==workspaceId/);
 assert.match(financeInstaller,/data\.period!==month/);
 assert.match(financeInstaller,/UNALLOCATED_SHARED_PAYROLL/);
 assert.match(financeInstaller,/integer\(bucket\[key\]\)/);
});

test('authorized export contains aggregates only and formula-like labels are escaped',()=>{
 assert.match(financeView,/partnerPropertyFinanceCsv/);
 assert.match(financeView,/PARTNER_FINANCE_EXPORT_SCOPE_MISMATCH/);
 assert.match(financeView,/\^\[\\s\]\*\[=\+\\-@\]/);
 assert.match(financeView,/تحصيل الشهر/);
 assert.match(financeView,/مصروفات الشهر/);
 assert.match(financeView,/المتأخرات حتى الفترة/);
 assert.doesNotMatch(financeView,/tenantId|receiptId|payrollId|partnerEmail/);
});

test('incomplete shared payroll is explicit rather than silently final',()=>{
 assert.match(financeView,/الملخص غير مكتمل/);
 assert.match(financeView,/رواتب مشتركة لم تُخصص للعقار بعد/);
 assert.match(financeView,/لا يُعتمد الصافي كقيمة نهائية/);
});
