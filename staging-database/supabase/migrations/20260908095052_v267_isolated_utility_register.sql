create table public.aqari_utility_meters(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, property_id uuid not null,
 source_key text not null, kind text not null check(kind in ('electricity','water')),
 serial_no text, account_no text, unit_no text, model text, source_refs jsonb not null,
 notes text not null default '', created_at timestamptz not null default now(),
 unique(workspace_id,property_id,source_key),unique(workspace_id,property_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create unique index utility_serial_unique on public.aqari_utility_meters(workspace_id,kind,serial_no) where serial_no is not null;
create table public.aqari_utility_entries(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,property_id uuid not null,meter_id uuid not null,
 entry_type text not null check(entry_type in ('source_reading','reading','bill')),
 reading_raw text, reading_unit text, observed_on date, invoice_no text, bill_period date, due_on date,
 amount_due numeric(15,3) check(amount_due>=0),amount_paid numeric(15,3) check(amount_paid>=0),
 payment_status text not null default 'unknown' check(payment_status in ('unknown','unpaid','partial','paid')),
 source_ref text not null check(length(btrim(source_ref)) between 1 and 500),notes text not null default '' check(length(notes)<=2000),
 recorded_by uuid references auth.users,recorded_at timestamptz not null default now(),
 foreign key(workspace_id,property_id,meter_id) references public.aqari_utility_meters(workspace_id,property_id,id),
 check(amount_paid is null or (amount_due is not null and amount_paid<=amount_due)),
 check(payment_status='unknown' or (amount_due is not null and amount_paid is not null and
 ((payment_status='unpaid' and amount_paid=0 and amount_due>0) or
 (payment_status='partial' and amount_paid>0 and amount_paid<amount_due) or
 (payment_status='paid' and amount_paid=amount_due)))),
 check(entry_type<>'bill' or (invoice_no is not null and length(btrim(invoice_no)) between 1 and 120 and bill_period is not null and amount_due is not null)),
 check(entry_type='bill' or (reading_raw is not null and length(btrim(reading_raw)) between 1 and 100))
);
create unique index utility_invoice_unique on public.aqari_utility_entries(workspace_id,meter_id,invoice_no) where entry_type='bill';
create unique index utility_source_reading_unique on public.aqari_utility_entries(workspace_id,meter_id,source_ref) where entry_type='source_reading';
create index utility_entries_scope on public.aqari_utility_entries(workspace_id,property_id,meter_id,recorded_at desc);
alter table public.aqari_utility_meters enable row level security;
alter table public.aqari_utility_entries enable row level security;
revoke all on public.aqari_utility_meters,public.aqari_utility_entries from public,anon,authenticated;
grant select on public.aqari_utility_meters to authenticated;
grant select,insert on public.aqari_utility_entries to authenticated;
create policy utility_meter_read on public.aqari_utility_meters for select to authenticated using(private.aqari_can(workspace_id,'services','read') and private.aqari_can(workspace_id,'properties','read'));
create policy utility_entry_read on public.aqari_utility_entries for select to authenticated using(private.aqari_can(workspace_id,'services','read') and private.aqari_can(workspace_id,'properties','read'));
create policy utility_entry_insert on public.aqari_utility_entries for insert to authenticated with check(
 private.aqari_can(workspace_id,'services','write') and private.aqari_can(workspace_id,'properties','read')
 and recorded_by=(select auth.uid()) and entry_type in ('reading','bill')
);
create function private.aqari_utility_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null then new.recorded_by:=auth.uid();end if;
 new.recorded_at:=now();return new;
end $$;
revoke all on function private.aqari_utility_stamp() from public,anon,authenticated;
create trigger utility_entry_stamp before insert on public.aqari_utility_entries for each row execute function private.aqari_utility_stamp();
