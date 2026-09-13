import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/collector-performance-report.sql',import.meta.url),'utf8');
const has=(pattern,message)=>assert.match(sql,pattern,message);

test('new collections capture authenticated actor instead of trusting a typed name',()=>{
  has(/create trigger aqari_capture_collection_attribution after insert on public\.aqari_rent_payments/i);
  has(/actor uuid:=auth\.uid\(\)/i);
  has(/source_kind\)\s*values\(new\.id,new\.workspace_id,actor,actor_name,source_value,'authenticated'\)/i);
  has(/exists\(select 1 from public\.aqari_memberships/i);
});

test('legacy names are preserved but never auto-assigned to staff',()=>{
  has(/source_kind in \('authenticated','legacy_name','system_unassigned'\)/i);
  has(/legacy_names_never_auto_assigned',true/i);
  has(/when a\.source_name is not null then 'legacy_unmatched'/i);
  has(/private\.aqari_normalize_collector_name\(a\.source_name\)/i);
});

test('manager-only aliasing requires an active employee and recent MFA',()=>{
  has(/create or replace function public\.aqari_set_collector_alias/i);
  has(/not private\.aqari_manager\(p_workspace_id\)/i);
  has(/private\.aqari_require_sensitive_aal2\(p_workspace_id\)/i);
  has(/COLLECTOR_USER_NOT_ACTIVE/);
  has(/on conflict\(workspace_id,normalized_name\) do update/i);
});

test('alias candidates only expose active workspace members to managers',()=>{
  has(/create or replace function public\.aqari_collector_alias_candidates/i);
  has(/not private\.aqari_manager\(p_workspace_id\)/i);
  has(/m\.workspace_id=p_workspace_id and m\.is_active/i);
});

test('performance report is permission and property scoped and excludes cancelled receipts',()=>{
  has(/create or replace function public\.aqari_collector_performance_report/i);
  has(/private\.aqari_can\(p_workspace_id,'collections','read'\)/i);
  has(/private\.aqari_can_property\(p_workspace_id,p_property_id,'collections','read'\)/i);
  has(/not exists\(select 1 from private\.aqari_receipt_cancellations c/i);
  has(/p\.paid_at between p_from and p_to/i);
});

test('report exposes operation and amount performance plus explicit settlements',()=>{
  has(/count\(\*\)::integer operation_count/i);
  has(/sum\(amount\)::numeric\(15,3\) amount/i);
  has(/settlement_count/i);
  has(/settlement_amount/i);
  has(/regular_count/i);
  has(/regular_amount/i);
  has(/settlement_requires_explicit_payment_classification',true/i);
});

test('report returns traceable receipt property unit and contract lines',()=>{
  has(/'receipt_no',x\.receipt_no/i);
  has(/'property_name',x\.property_name/i);
  has(/'unit_no',x\.unit_no/i);
  has(/'contract_no',x\.contract_no/i);
  has(/'mapping_status',x\.mapping_status/i);
  has(/'is_settlement',x\.is_settlement/i);
});

test('private attribution is immutable and direct role access is revoked',()=>{
  has(/alter table private\.aqari_collection_attribution enable row level security/i);
  has(/revoke all on private\.aqari_collection_attribution from public,anon,authenticated,service_role/i);
  has(/create trigger aqari_collection_attribution_immutable before update or delete/i);
});
