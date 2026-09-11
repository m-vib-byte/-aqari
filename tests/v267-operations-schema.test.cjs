import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const path=new URL('../staging-database/sql/operations-completion.sql',import.meta.url);
const source=await readFile(path,'utf8');

test('operations completion schema is explicitly code-only and transactional',()=>{
 assert.match(source,/CODE ONLY/);
 assert.match(source,/^begin;/m);
 assert.match(source,/commit;\s*$/);
});
test('all sensitive operations tables enable RLS and revoke direct client access',()=>{
 const tables=[...source.matchAll(/create table private\.(aqari_[a-z_]+)/g)].map(match=>match[1]);
 assert.equal(tables.length,18);
 for(const table of tables){
  assert.match(source,new RegExp(`'?${table}'?`));
 }
 assert.match(source,/enable row level security/);
 assert.match(source,/revoke all on private\.%I from public,anon,authenticated/);
});
test('money ledgers reject destructive updates or deletes',()=>{
 for(const trigger of ['aqari_cheque_events_immutable','aqari_legal_costs_immutable','aqari_petty_cash_entries_immutable','aqari_charge_allocations_immutable']){
  assert.match(source,new RegExp(`create trigger ${trigger} before update or delete`));
 }
});
test('financial periods have a server-side closed-period guard',()=>{
 assert.match(source,/create function private\.aqari_assert_period_open/);
 assert.match(source,/FINANCIAL_PERIOD_CLOSED/);
});
test('outbox and delivery records enforce idempotency and exclude common secrets',()=>{
 assert.match(source,/unique\(workspace_id,idempotency_key\)/);
 assert.match(source,/not\(payload \?\| array\['password','secret','token','civil_id','civilId'\]\)/);
 assert.match(source,/channel text not null check\(channel in \('email','whatsapp','sms','push'\)\)/);
});
