begin;

create table if not exists private.aqari_rent_due_periods(
  workspace_id uuid not null,
  lease_id uuid not null,
  period date not null,
  due_amount numeric(15,3) not null check(due_amount>=0),
  paid_amount numeric(15,3) not null check(paid_amount>=0),
  balance numeric(15,3) not null,
  status text not null check(status in ('waived','due','partial','paid','overpaid')),
  generated_at timestamptz not null default now(),
  source_hash text not null,
  primary key(workspace_id,lease_id,period),
  foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id) on delete restrict,
  check(period=date_trunc('month',period)::date)
);

alter table private.aqari_rent_due_periods enable row level security;
revoke all on private.aqari_rent_due_periods from public,anon,authenticated;
create index if not exists aqari_rent_due_periods_period_idx on private.aqari_rent_due_periods(workspace_id,period,status);

create or replace function private.aqari_refresh_rent_due_schedule(w uuid,lid uuid)
returns integer
language plpgsql
volatile
security definer
set search_path=''
as $$
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
    workspace_id,lease_id,period,due_amount,paid_amount,balance,status,generated_at,source_hash
  )
  select l.workspace_id,l.id,g.period,due.amount,paid.amount,due.amount-paid.amount,
    case
      when due.amount=0 then 'waived'
      when paid.amount=0 then 'due'
      when paid.amount<due.amount then 'partial'
      when paid.amount=due.amount then 'paid'
      else 'overpaid'
    end,
    now(),
    encode(sha256(convert_to(jsonb_build_object(
      'lease',l.id,'period',g.period,'due',due.amount,'paid',paid.amount,
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
  on conflict(workspace_id,lease_id,period) do update set
    due_amount=excluded.due_amount,
    paid_amount=excluded.paid_amount,
    balance=excluded.balance,
    status=excluded.status,
    generated_at=excluded.generated_at,
    source_hash=excluded.source_hash;
  get diagnostics changed=row_count;
  return changed;
end $$;

revoke all on function private.aqari_refresh_rent_due_schedule(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_refresh_rent_due_after_lease()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.aqari_refresh_rent_due_schedule(new.workspace_id,new.id);
  return new;
end $$;
revoke all on function private.aqari_refresh_rent_due_after_lease() from public,anon,authenticated;

drop trigger if exists aqari_refresh_rent_due_after_lease on public.aqari_leases;
create trigger aqari_refresh_rent_due_after_lease
after insert or update of status,start_date,end_date,monthly_rent,snapshot on public.aqari_leases
for each row execute function private.aqari_refresh_rent_due_after_lease();

create or replace function private.aqari_refresh_rent_due_after_payment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    perform private.aqari_refresh_rent_due_schedule(old.workspace_id,old.lease_id);
    return old;
  end if;
  perform private.aqari_refresh_rent_due_schedule(new.workspace_id,new.lease_id);
  if tg_op='UPDATE' and (old.workspace_id,old.lease_id) is distinct from (new.workspace_id,new.lease_id) then
    perform private.aqari_refresh_rent_due_schedule(old.workspace_id,old.lease_id);
  end if;
  return new;
end $$;
revoke all on function private.aqari_refresh_rent_due_after_payment() from public,anon,authenticated;

drop trigger if exists aqari_refresh_rent_due_after_payment on public.aqari_rent_payments;
create trigger aqari_refresh_rent_due_after_payment
after insert or update or delete on public.aqari_rent_payments
for each row execute function private.aqari_refresh_rent_due_after_payment();

create or replace function private.aqari_refresh_rent_due_after_cancellation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare p public.aqari_rent_payments;
begin
  select * into p from public.aqari_rent_payments where id=case when tg_op='DELETE' then old.payment_id else new.payment_id end;
  if found then perform private.aqari_refresh_rent_due_schedule(p.workspace_id,p.lease_id); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.aqari_refresh_rent_due_after_cancellation() from public,anon,authenticated;

drop trigger if exists aqari_refresh_rent_due_after_cancellation on private.aqari_receipt_cancellations;
create trigger aqari_refresh_rent_due_after_cancellation
after insert or delete on private.aqari_receipt_cancellations
for each row execute function private.aqari_refresh_rent_due_after_cancellation();

create or replace function public.aqari_rent_due_schedule(p_workspace_id uuid,p_lease_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare w uuid:=p_workspace_id;
begin
  if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_lease_id is not null and not private.aqari_can_lease(w,p_lease_id,'collections','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  if p_lease_id is null and not private.aqari_can(w,'collections','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'periods',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lease_id',d.lease_id,'contract_no',l.contract_no,'period',d.period,
        'due_amount',d.due_amount,'paid_amount',d.paid_amount,'balance',d.balance,
        'status',d.status,'source_hash',d.source_hash
      ) order by d.period,d.lease_id)
      from private.aqari_rent_due_periods d
      join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
      where d.workspace_id=w
        and (p_lease_id is null or d.lease_id=p_lease_id)
        and private.aqari_can_lease(w,d.lease_id,'collections','read')
    ),'[]'::jsonb),
    'generated_from','signed lease terms + non-cancelled allocated rent payments'
  );
end $$;

revoke all on function public.aqari_rent_due_schedule(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_rent_due_schedule(uuid,uuid) to authenticated;

do $$declare r record;begin
  for r in select workspace_id,id from public.aqari_leases where status='signed' loop
    perform private.aqari_refresh_rent_due_schedule(r.workspace_id,r.id);
  end loop;
end $$;

commit;