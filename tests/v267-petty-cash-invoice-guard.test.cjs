const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'staging-database/supabase/migrations/20260912215800_v267_petty_cash_invoice_guard_current_core.sql',
  'utf8'
);

test('petty-cash spend requires a bounded invoice before delegating to the current operations core',()=>{
  const guard=migration.indexOf("message='PETTY_CASH_INVOICE_REQUIRED'");
  const delegate=migration.indexOf('return private.aqari_operations_register_core(');
  assert.ok(guard>0,'invoice guard must exist');
  assert.ok(delegate>guard,'invoice guard must run before the operations core');
  assert.match(migration,/p_domain='petty_cash'[\s\S]*p_action='entry'[\s\S]*kind',''\)='spend'/);
  assert.match(migration,/length\(invoice_ref\) not between 2 and 160/);
  assert.match(migration,/invoice_ref ~ '\[\[:cntrl:\]\]'/);
});

test('the existing operations implementation is moved behind a non-user-callable private core',()=>{
  assert.match(migration,/alter function public\.aqari_operations_register\(uuid,text,text,jsonb\) set schema private/);
  assert.match(migration,/rename to aqari_operations_register_core/);
  assert.match(migration,/revoke all on function private\.aqari_operations_register_core\(uuid,text,text,jsonb\) from public,anon,authenticated/);
  assert.doesNotMatch(migration,/grant execute on function private\.aqari_operations_register_core/);
  assert.match(migration,/grant execute on function public\.aqari_operations_register\(uuid,text,text,jsonb\) to authenticated/);
});

test('the public wrapper preserves manager authorization before invoice validation',()=>{
  const auth=migration.indexOf("not private.aqari_manager(p_workspace_id)");
  const guard=migration.indexOf("message='PETTY_CASH_INVOICE_REQUIRED'");
  assert.ok(auth>0&&auth<guard,'manager authorization must precede invoice validation');
  assert.match(migration,/security definer[\s\S]*set search_path=''/);
});
