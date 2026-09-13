import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/cancellation-reason-audit.sql',import.meta.url),'utf8');

const has=(pattern,message)=>assert.match(sql,pattern,message);

test('central cancellation audit requires reason actor and timestamp',()=>{
  has(/create table if not exists private\.aqari_cancellation_audit/i);
  has(/reason text not null check\(length\(btrim\(reason\)\) between 3 and 500\)/i);
  has(/actor_id uuid not null/i);
  has(/actor_name text not null/i);
  has(/recorded_at timestamptz not null default now\(\)/i);
  has(/unique\(workspace_id,entity_type,entity_id,action\)/i);
  has(/revoke all on private\.aqari_cancellation_audit from public,anon,authenticated,service_role/i);
});

test('lease cancellation rejects missing reason and records actor',()=>{
  has(/create trigger aa_aqari_lease_cancellation_reason before update on public\.aqari_leases/i);
  has(/new\.status='cancelled'/i);
  has(/new\.snapshot->>'changeReason'/i);
  has(/CANCELLATION_REASON_REQUIRED/);
  has(/CANCELLATION_ACTOR_REQUIRED/);
  has(/'lease',new\.id::text,'cancel',why,auth\.uid\(\),actor/i);
  has(/CANCELLED_LEASE_IMMUTABLE/);
});

test('document cancellation cannot bypass the reason-backed RPC',()=>{
  has(/create trigger aa_aqari_document_cancellation_reason before update on public\.aqari_documents/i);
  has(/DOCUMENT_CANCELLATION_REASON_REQUIRED/);
  has(/create or replace function public\.aqari_cancel_document\(p_document_id uuid,p_reason text\)/i);
  has(/length\(why\) not between 3 and 500/i);
  has(/insert into private\.aqari_cancellation_audit[\s\S]*?'document',target\.id::text,'cancel'/i);
  has(/update public\.aqari_documents set status='cancelled'/i);
  has(/grant execute on function public\.aqari_cancel_document\(uuid,text\) to authenticated/i);
});

test('receipt cancellations are mirrored into the immutable cancellation audit',()=>{
  has(/create trigger aqari_receipt_cancellation_reason_audit after insert on private\.aqari_receipt_cancellations/i);
  has(/'rent_payment',new\.payment_id::text,'cancel',btrim\(new\.reason\)/i);
});

test('expense cancellations carry the saved cancellation fields into the audit',()=>{
  has(/create trigger aqari_expense_cancellation_reason_audit after update on private\.aqari_financial_expenses/i);
  has(/old\.state is distinct from 'cancelled' and new\.state='cancelled'/i);
  has(/'expense',new\.id::text,'cancel',btrim\(new\.cancel_reason\),new\.cancelled_by,new\.cancelled_by_name/i);
});

test('official document voids require and preserve the void reason',()=>{
  has(/create trigger aqari_official_document_void_reason_audit after update on private\.aqari_official_document_series/i);
  has(/length\(btrim\(coalesce\(new\.void_reason,''\)\)\) not between 3 and 500/i);
  has(/'official_document',new\.id::text,'void',btrim\(new\.void_reason\),new\.voided_by/i);
});

test('manager can read reason actor and time through a narrow history RPC',()=>{
  has(/create or replace function public\.aqari_cancellation_history\(/i);
  has(/not private\.aqari_manager\(p_workspace_id\)/i);
  has(/'reason',a\.reason,'actor_name',a\.actor_name,'recorded_at',a\.recorded_at/i);
  has(/grant execute on function public\.aqari_cancellation_history\(uuid,text,text\) to authenticated/i);
});

test('migration is additive and never deletes business data',()=>{
  has(/^\s*begin;/im);
  has(/\bcommit;\s*$/im);
  assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
  assert.doesNotMatch(sql,/\btruncate\b/i);
});
