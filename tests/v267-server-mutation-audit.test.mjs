import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/server-mutation-audit.sql',import.meta.url),'utf8');
const has=(pattern,message)=>assert.match(sql,pattern,message);

test('server audit records actor operation hashes and changed field names only',()=>{
  has(/create table if not exists private\.aqari_server_mutation_audit/i);
  has(/actor_id uuid/);
  has(/actor_name text not null/);
  has(/actor_role text/);
  has(/actor_kind text not null/);
  has(/changed_fields jsonb not null/);
  has(/before_sha256 text/);
  has(/after_sha256 text/);
  has(/transaction_id bigint not null default txid_current\(\)/i);
  has(/recorded_at timestamptz not null default now\(\)/i);
});

test('audit rows cannot be read or mutated directly by browser or service roles',()=>{
  has(/alter table private\.aqari_server_mutation_audit enable row level security/i);
  has(/revoke all on private\.aqari_server_mutation_audit from public,anon,authenticated,service_role/i);
  has(/create trigger aqari_server_mutation_audit_immutable before update or delete/i);
});

test('audit trigger hashes rows instead of storing raw row snapshots',()=>{
  has(/encode\(sha256\(convert_to\(before_j::text,'UTF8'\)\),'hex'\)/i);
  has(/encode\(sha256\(convert_to\(after_j::text,'UTF8'\)\),'hex'\)/i);
  assert.doesNotMatch(sql,/before_value jsonb/i);
  assert.doesNotMatch(sql,/after_value jsonb/i);
});

for(const table of ['aqari_memberships','aqari_leases','aqari_rent_payments','aqari_documents','aqari_maintenance_requests','aqari_financial_expenses','aqari_official_document_series','aqari_work_orders']){
  test(`core write surface ${table} is included in server audit bindings`,()=>{
    has(new RegExp(`'${table}'`));
  });
}

test('manager audit history exposes metadata and hashes without raw record contents',()=>{
  has(/create or replace function public\.aqari_server_audit_history/i);
  has(/not private\.aqari_manager\(p_workspace_id\)/i);
  has(/'changed_fields',a\.changed_fields/);
  has(/'before_sha256',a\.before_sha256/);
  has(/'after_sha256',a\.after_sha256/);
  has(/grant execute on function public\.aqari_server_audit_history\(uuid,text,text,integer\) to authenticated/i);
});

test('migration is additive and never deletes business rows',()=>{
  has(/^\s*begin;/im);
  has(/\bcommit;\s*$/im);
  assert.doesNotMatch(sql,/\btruncate\b/i);
  assert.doesNotMatch(sql,/\bdelete\s+from\s+(public|private)\.aqari_(leases|rent_payments|documents|financial_expenses|official_document_series|memberships|maintenance_requests|work_orders)\b/i);
});
