import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../staging-database/sql/property-cost-allocation.sql',import.meta.url),'utf8');
const periodGuard=readFileSync(new URL('../staging-database/sql/property-cost-allocation-period-guard.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/property-cost-allocation.js',import.meta.url),'utf8');

test('allocation revisions are append-only and keep actor reason and exact property amount',()=>{
 assert.match(sql,/create table if not exists private\.aqari_property_cost_allocations/);
 assert.match(sql,/aqari_cost_allocation_no_change[\s\S]*aqari_reject_immutable_change/);
 assert.match(sql,/aqari_cost_allocation_head_no_delete[\s\S]*aqari_reject_immutable_change/);
 assert.match(sql,/actor_id uuid not null/);
 assert.match(sql,/actor_name text not null/);
 assert.match(sql,/reason text not null/);
 assert.match(sql,/amount numeric\(15,3\)/);
});

test('allocation revision is blocked when its authoritative source period is closed',()=>{
 assert.match(periodGuard,/before insert or update on private\.aqari_property_cost_allocation_heads/);
 assert.match(periodGuard,/private\.aqari_financial_open\(new\.workspace_id,new\.source_date\)/);
 assert.match(periodGuard,/aqari_cost_allocation_period_guard/);
});

test('only finalized authoritative sources can enter property cost allocation',()=>{
 assert.match(sql,/financial_expense[\s\S]*e\.state='approved'/);
 assert.match(sql,/payroll[\s\S]*p\.state='paid'/);
 assert.match(sql,/utility[\s\S]*u\.entry_type='bill'[\s\S]*u\.amount_paid>0[\s\S]*u\.payment_document_id is not null/);
 assert.match(sql,/COST_SOURCE_NOT_FINALIZED/);
});

test('a manual allocation must equal the authoritative source total exactly and cannot target unknown properties',()=>{
 assert.match(sql,/ALLOCATION_TOTAL_MISMATCH/);
 assert.match(sql,/sum_amount is distinct from \(source->>'total'\)::numeric/);
 assert.match(sql,/ALLOCATION_PROPERTY_NOT_FOUND/);
 assert.match(sql,/DUPLICATE_ALLOCATION_PROPERTY/);
 assert.match(sql,/ALLOCATION_REVISION_CONFLICT/);
});

test('shared payroll allocations are limited to employee property assignments and are never guessed',()=>{
 assert.match(sql,/PAYROLL_ALLOCATION_OUTSIDE_EMPLOYEE_PROPERTIES/);
 assert.match(sql,/jsonb_array_elements_text\(coalesce\(source->'propertyIds','\[\]'::jsonb\)\)/);
 assert.doesNotMatch(sql,/to_jsonb\(p\)::text::jsonb\s*<@/);
 assert.match(page,/راتب مشترك غير موزع — لا يدخل صافي أي عقار/);
 assert.doesNotMatch(page,/تقسيم متساو|equal split/i);
});

test('property financial summary counts each domain once and maintenance invoices only through approved expense ledger',()=>{
 assert.match(sql,/public\.aqari_rent_payments/);
 assert.match(sql,/private\.aqari_receipt_cancellations/);
 assert.match(sql,/private\.aqari_financial_expenses/);
 assert.match(sql,/private\.aqari_hr_payroll/);
 assert.match(sql,/public\.aqari_utility_entries/);
 assert.match(sql,/expense_month:=finance_month\+payroll_month\+utility_month/);
 assert.doesNotMatch(sql,/from private\.aqari_work_orders/);
 assert.match(sql,/maintenance\/work-order invoices enter only through the financial expense ledger/);
});

test('allocation UI forces exact amount reconciliation and performs revisioned server save',()=>{
 assert.match(page,/sum!==expected/);
 assert.match(page,/sourceKind:source\.kind/);
 assert.match(page,/sourceId:source\.id/);
 assert.match(page,/revision:Number\(source\.revision\|\|0\)/);
 assert.match(page,/سبب التوزيع/);
 assert.match(page,/إجمالي المصدر الثابت/);
});
