-- LOCAL IN-MEMORY FIXTURE ONLY. Never run against any hosted database.
-- Reproduce the observed missing-allocation subsystem, not a full Production clone.
drop table private.aqari_commercial_payment_allocation_reversals cascade;
drop table private.aqari_commercial_payment_allocations cascade;
drop function if exists public.aqari_commercial_payment_context(uuid,uuid) cascade;
drop function if exists public.aqari_commercial_payment_allocations(uuid,text,jsonb) cascade;
drop function if exists public.aqari_commercial_statement(uuid,uuid,date,date) cascade;
drop function if exists private.aqari_legacy_allocation_clearance(uuid,uuid) cascade;
drop function if exists private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date) cascade;
drop function if exists private.aqari_commercial_payment_context_data(uuid,uuid) cascade;
drop function if exists private.aqari_commercial_statement_data(uuid,uuid,date,date) cascade;
drop function if exists private.aqari_commercial_payment_allocations_register(uuid,text,jsonb) cascade;
CREATE OR REPLACE FUNCTION private.aqari_refresh_rent_due_schedule(w uuid, lid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.aqari_leases; changed integer:=0;
begin
  select * into l from public.aqari_leases where workspace_id=w and id=lid;
  if not found then return 0; end if;
  if l.status<>'signed' then
    delete from private.aqari_rent_due_periods where workspace_id=w and lease_id=lid;
    get diagnostics changed=row_count;
    return changed;
  end if;

  delete from private.aqari_rent_due_periods d
   where d.workspace_id=w and d.lease_id=lid
     and (d.period<date_trunc('month',l.start_date)::date or d.period>date_trunc('month',l.end_date)::date);

  insert into private.aqari_rent_due_periods(
    workspace_id,lease_id,period,due_amount,paid_amount,credit_amount,balance,status,generated_at,source_hash
  )
  select l.workspace_id,l.id,g.period,due.amount,paid.amount,credit.amount,
    due.amount-paid.amount-credit.amount,
    case
      when due.amount=0 then 'waived'
      when paid.amount+credit.amount=0 then 'due'
      when paid.amount+credit.amount<due.amount then 'partial'
      when paid.amount+credit.amount=due.amount then 'paid'
      else 'overpaid'
    end,
    now(),
    encode(sha256(convert_to(jsonb_build_object(
      'lease',l.id,'period',g.period,'due',due.amount,'paid',paid.amount,'credit',credit.amount,
      'snapshot',l.snapshot,'monthly_rent',l.monthly_rent
    )::text,'UTF8')),'hex')
  from lateral (
    select gs::date period
    from generate_series(
      date_trunc('month',l.start_date)::date,
      date_trunc('month',l.end_date)::date,
      interval '1 month'
    ) gs
  ) g
  cross join lateral (
    select private.aqari_reminder_due(l.snapshot,l.monthly_rent,g.period)::numeric(15,3) amount
  ) due
  cross join lateral (
    select coalesce(sum(p.amount),0)::numeric(15,3) amount
    from public.aqari_rent_payments p
    where p.workspace_id=w and p.lease_id=l.id and p.period=g.period
      and lower(coalesce(p.status,'')) not in ('cancelled','ملغى')
      and not exists(
        select 1 from private.aqari_receipt_cancellations c
        where c.workspace_id=w and c.payment_id=p.id
      )
  ) paid
  cross join lateral (
    select coalesce(sum(a.amount),0)::numeric(15,3) amount
    from private.aqari_credit_allocations a
    where a.workspace_id=w and a.lease_id=l.id and a.period=g.period
  ) credit
  on conflict(workspace_id,lease_id,period) do update set
    due_amount=excluded.due_amount,
    paid_amount=excluded.paid_amount,
    credit_amount=excluded.credit_amount,
    balance=excluded.balance,
    status=excluded.status,
    generated_at=excluded.generated_at,
    source_hash=excluded.source_hash;
  get diagnostics changed=row_count;
  return changed;
end $function$
;
CREATE OR REPLACE FUNCTION private.aqari_require_commercial_clearance(w uuid, lid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin perform private.aqari_independent_commercial_clearance(w,lid);end $function$
;
CREATE OR REPLACE FUNCTION private.aqari_vacating_balances(w uuid, lid uuid, vdate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
revoke all on function private.aqari_refresh_rent_due_schedule(uuid,uuid),private.aqari_vacating_balances(uuid,uuid,date),private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated,service_role;
