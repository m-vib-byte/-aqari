import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/monthly-collection-report.sql',import.meta.url),'utf8');
const has=(pattern,message)=>assert.match(sql,pattern,message);

test('report is permission scoped to collections and property access',()=>{
  has(/create or replace function public\.aqari_monthly_collection_report\(/i);
  has(/private\.aqari_can\(w,'collections','read'\)/i);
  has(/private\.aqari_can_property\(w,p_property_id,'collections','read'\)/i);
  has(/private\.aqari_can_property\(w,p\.id,'collections','read'\)/i);
  has(/COLLECTION_MONTH_REQUIRED/);
});

test('statement is derived from the authoritative persisted rent due schedule',()=>{
  has(/from private\.aqari_rent_due_periods d/i);
  has(/join public\.aqari_leases l/i);
  has(/join public\.aqari_units u/i);
  has(/join public\.aqari_properties p/i);
  has(/d\.workspace_id=w and d\.period=p_period/i);
});

test('discount is explicit against original contract rent while due remains authoritative',()=>{
  has(/snapshot->>'contractRent'/i);
  has(/gross_contract_rent/i);
  has(/greatest\([\s\S]*-d\.due_amount,0\)::numeric\(15,3\) discount_amount/i);
  has(/'discount',x\.discount_amount/i);
  has(/'due',x\.due_amount/i);
});

test('collection rate caps the numerator at due and reports overpayment separately',()=>{
  has(/least\(d\.paid_amount,d\.due_amount\)::numeric\(15,3\) allocated_paid/i);
  has(/greatest\(d\.paid_amount-d\.due_amount,0\)::numeric\(15,3\) overpayment/i);
  has(/sum\(allocated_paid\)\/sum\(due_amount\)\)\*100/i);
  has(/'rate_numerator',s\.allocated_paid/i);
  has(/'rate_denominator',s\.due/i);
  has(/'overpayment_excluded_from_rate_numerator',true/i);
});

test('report explains the exclusions that protect the percentage from distortion',()=>{
  has(/'cancelled_receipts_excluded',true/i);
  has(/'waived_zero_due_adds_zero_to_denominator',true/i);
  has(/'denominator','authoritative_due_after_contract_discounts'/i);
  has(/'numerator','allocated_paid_capped_at_due'/i);
});

test('report returns property summary plus lease-level evidence lines',()=>{
  has(/'properties',coalesce/i);
  has(/'lines',coalesce/i);
  has(/'property_name',s\.property_name/i);
  has(/'contract_no',x\.contract_no/i);
  has(/'unit_no',x\.unit_no/i);
  has(/'source_hash',x\.source_hash/i);
});

test('migration is read-only with respect to business rows',()=>{
  has(/^\s*begin;/im);
  has(/\bcommit;\s*$/im);
  assert.doesNotMatch(sql,/\binsert\s+into\s+(public|private)\./i);
  assert.doesNotMatch(sql,/\bupdate\s+(public|private)\./i);
  assert.doesNotMatch(sql,/\bdelete\s+from\s+(public|private)\./i);
});
