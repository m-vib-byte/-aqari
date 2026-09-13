const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');

const schedule=readFileSync(resolve(__dirname,'../staging-database/sql/rent-due-schedule.sql'),'utf8');
const entitlement=readFileSync(resolve(__dirname,'../staging-database/sql/rent-entitlement-start.sql'),'utf8');

test('rent due schedule persists one authoritative row per lease month',()=>{
  assert.match(schedule,/create table if not exists private\.aqari_rent_due_periods/);
  assert.match(schedule,/primary key\(workspace_id,lease_id,period\)/);
  assert.match(schedule,/check\(period=date_trunc\('month',period\)::date\)/);
  assert.match(schedule,/status text not null check\(status in \('waived','due','partial','paid','overpaid'\)\)/);
});

test('signed lease months are generated from the authoritative lease boundary and due helper',()=>{
  assert.match(schedule,/if l\.status<>'signed' then[\s\S]*delete from private\.aqari_rent_due_periods/);
  assert.match(schedule,/generate_series\([\s\S]*date_trunc\('month',l\.start_date\)::date,[\s\S]*date_trunc\('month',l\.end_date\)::date,[\s\S]*interval '1 month'/);
  assert.match(schedule,/private\.aqari_reminder_due\(l\.snapshot,l\.monthly_rent,g\.period\)/);
});

test('paid amount excludes cancelled payments and cancellation records',()=>{
  assert.match(schedule,/lower\(coalesce\(p\.status,''\)\) not in \('cancelled','ملغى'\)/);
  assert.match(schedule,/not exists\([\s\S]*private\.aqari_receipt_cancellations c[\s\S]*c\.payment_id=p\.id/);
  assert.match(schedule,/due\.amount-paid\.amount/);
});

test('due status is derived from exact due versus paid amounts',()=>{
  assert.match(schedule,/when due\.amount=0 then 'waived'/);
  assert.match(schedule,/when paid\.amount=0 then 'due'/);
  assert.match(schedule,/when paid\.amount<due\.amount then 'partial'/);
  assert.match(schedule,/when paid\.amount=due\.amount then 'paid'/);
  assert.match(schedule,/else 'overpaid'/);
});

test('lease, payment, and cancellation mutations refresh the persisted schedule',()=>{
  assert.match(schedule,/after insert or update of status,start_date,end_date,monthly_rent,snapshot on public\.aqari_leases/);
  assert.match(schedule,/after insert or update or delete on public\.aqari_rent_payments/);
  assert.match(schedule,/after insert or delete on private\.aqari_receipt_cancellations/);
  assert.match(schedule,/perform private\.aqari_refresh_rent_due_schedule/);
});

test('public due schedule remains permission-scoped and private storage is not browser-readable',()=>{
  assert.match(schedule,/alter table private\.aqari_rent_due_periods enable row level security/);
  assert.match(schedule,/revoke all on private\.aqari_rent_due_periods from public,anon,authenticated/);
  assert.match(schedule,/private\.aqari_can_lease\(w,p_lease_id,'collections','read'\)/);
  assert.match(schedule,/private\.aqari_can\(w,'collections','read'\)/);
  assert.match(schedule,/private\.aqari_can_lease\(w,d\.lease_id,'collections','read'\)/);
});

test('explicit first-rent entitlement upgrades the same schedule with due-on evidence',()=>{
  assert.match(entitlement,/public\.aqari_rent_due_schedule\(uuid,uuid\)/);
  assert.match(entitlement,/private\.aqari_rent_due_on\(l\.snapshot,l\.start_date,d\.period\)/);
  assert.match(entitlement,/replacement:='''due_on'',private\.aqari_rent_due_on/);
});
