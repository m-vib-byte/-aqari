-- Follow-up hardening for the V267 vacating settlement ledger.
-- Count only authoritative confirmed rent payments and normalize immutable snapshots on status transition.
create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases; due_total numeric:=0;paid_total numeric:=0;deposit_balance numeric:=0;period_start date;period_end date;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 period_start:=date_trunc('month',coalesce(l.start_date,vdate))::date;
 period_end:=date_trunc('month',vdate)::date;
 if period_start<=period_end then
  select coalesce(sum(case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end),0)
  into due_total from generate_series(period_start,period_end,interval '1 month') p;
 end if;
 select coalesce(sum(p.amount),0) into paid_total from public.aqari_rent_payments p
 where p.workspace_id=w and p.lease_id=lid and p.status in ('مدفوع','جزئي','paid','partial');
 select coalesce(sum(case e.kind when 'receipt' then e.amount else -e.amount end),0) into deposit_balance
 from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=lid;
 return jsonb_build_object('rent_due_total',due_total::numeric(18,3)::text,'rent_paid_total',paid_total::numeric(18,3)::text,
  'rent_balance',greatest(due_total-paid_total,0)::numeric(18,3)::text,'tenant_credit',greatest(paid_total-due_total,0)::numeric(18,3)::text,
  'deposit_balance',deposit_balance::numeric(18,3)::text);
end $$;
revoke all on function private.aqari_vacating_balances(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.aqari_vacating_snapshot_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='finalized' and new.settlement_snapshot is not null then
  new.settlement_snapshot:=new.settlement_snapshot||jsonb_build_object('status','finalized','settlement_no',new.settlement_no,'finalized_at',new.finalized_at,'revision',new.revision);
 end if;
 if new.status='cleared' and new.clearance_snapshot is not null then
  new.clearance_snapshot:=new.clearance_snapshot||jsonb_build_object('status','cleared','clearance_no',new.clearance_no,'clearance_at',new.clearance_at,'revision',new.revision);
 end if;
 return new;
end $$;
revoke all on function private.aqari_vacating_snapshot_guard() from public,anon,authenticated;
drop trigger if exists aqari_vacating_snapshot_guard on private.aqari_vacating_settlements;
create trigger aqari_vacating_snapshot_guard before update on private.aqari_vacating_settlements for each row execute function private.aqari_vacating_snapshot_guard();
