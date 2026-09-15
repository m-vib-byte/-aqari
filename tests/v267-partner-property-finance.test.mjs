import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('staging-database/sql/partner-property-financial-summary.sql');
const session=read('src/v267/api/partner-session.js');
const portal=read('v267-partner-portal.js');
const view=read('src/v267/components/partner-property-finance-view.js');

test('partner finance RPC is read-only, property-scoped and fail-closed',()=>{
 assert.match(sql,/create or replace function public\.aqari_partner_property_finance/);
 assert.match(sql,/a\.property_id=p_property_id/);
 assert.match(sql,/a\.user_id=auth\.uid\(\)/);
 assert.match(sql,/a\.email=account_email and a\.is_active/);
 assert.match(sql,/not exists\(select 1 from public\.aqari_memberships/);
 assert.match(sql,/r\.status not in\('cancelled','ملغى'\)/);
 assert.match(sql,/private\.aqari_receipt_cancellations/);
 assert.match(sql,/private\.aqari_cost_amount/);
 assert.match(sql,/UNALLOCATED_SHARED_PAYROLL/);
 assert.match(sql,/revoke all on function public\.aqari_partner_property_finance\(uuid,date\) from public,anon/);
 assert.doesNotMatch(sql,/\binsert into\b|\bupdate\s+(?!private\.aqari)|\bdelete from\b/i);
});

test('partner finance returns aggregate fils and never raw source rows',()=>{
 for(const key of ['income_fils','expected_income_fils','expenses_fils','net_fils','collection_variance_fils','arrears_fils'])assert.match(sql,new RegExp(key));
 assert.doesNotMatch(sql,/jsonb_agg\(/);
 assert.doesNotMatch(sql,/'finance'\s*,finance_month|'payroll'\s*,payroll_month|'utilities'\s*,utility_month/);
});

test('partner session validates exact finance scope and payload',()=>{
 assert.match(session,/['"]finance['"]/);
 assert.match(session,/aqari_partner_property_finance/);
 assert.match(session,/data\.property_id!==propertyId\|\|data\.workspace_id!==workspaceId/);
 assert.match(session,/PARTNER_FINANCE_INVALID/);
 assert.match(session,/UNALLOCATED_SHARED_PAYROLL/);
});

test('partner portal renders aggregate finance through safe text nodes',()=>{
 assert.match(portal,/partnerPropertyFinanceView/);
 assert.match(portal,/kind:'finance'/);
 assert.match(view,/textContent=/);
 assert.doesNotMatch(view,/innerHTML|insertAdjacentHTML|document\.write/);
 assert.match(view,/الملخص المالي للعقار/);
 assert.match(view,/لا يُعتمد الصافي كقيمة نهائية/);
});

test('partner finance support JavaScript parses',()=>{
 for(const file of ['scripts/install-v267-partner-property-finance.mjs','src/v267/components/partner-property-finance-view.js','src/v267/api/partner-session.js','v267-partner-portal.js']){
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||file+' syntax failed');
 }
});
