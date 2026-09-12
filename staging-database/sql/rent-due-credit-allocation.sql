-- AQARI V267: integrate tenant credit allocations with the authoritative rent-due ledger
-- and provide a manager-only forward allocation command.
begin;

alter table private.aqari_rent_due_periods
  add column if not exists credit_amount numeric(15,3) not null default 0 check(credit_amount>=0);

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
end $$;

create or replace function private.aqari_refresh_rent_due_after_credit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.aqari_refresh_rent_due_schedule(new.workspace_id,new.lease_id);
  return new;
end $$;
revoke all on function private.aqari_refresh_rent_due_after_credit() from public,anon,authenticated;

drop trigger if exists aqari_refresh_rent_due_after_credit on private.aqari_credit_allocations;
create trigger aqari_refresh_rent_due_after_credit
after insert on private.aqari_credit_allocations
for each row execute function private.aqari_refresh_rent_due_after_credit();

create or replace function public.aqari_allocate_credit_forward(
  p_workspace_id uuid,
  p_credit_entry_id uuid,
  p_lease_id uuid,
  p_start_period date
) returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  w uuid:=p_workspace_id; credit private.aqari_tenant_ledger_entries; lease_row public.aqari_leases;
  used numeric(15,3); remaining numeric(15,3); outstanding numeric(15,3); applied numeric(15,3);
  row_data record; allocation_id uuid; allocation_count integer:=0; actor_name text;
begin
  if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'collections','write') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  perform private.aqari_require_sensitive_aal2(w);
  if p_start_period is null or p_start_period<>date_trunc('month',p_start_period)::date then
    raise exception 'CREDIT_PERIOD_REQUIRED' using errcode='23514';
  end if;

  select * into credit from private.aqari_tenant_ledger_entries
   where workspace_id=w and id=p_credit_entry_id and direction='credit' for update;
  if not found then raise exception 'CREDIT_ENTRY_REQUIRED' using errcode='23514'; end if;
  select * into lease_row from public.aqari_leases
   where workspace_id=w and id=p_lease_id and tenant_id=credit.tenant_id and status='signed' for update;
  if not found then raise exception 'CREDIT_TENANT_MISMATCH' using errcode='23514'; end if;

  perform private.aqari_refresh_rent_due_schedule(w,p_lease_id);
  select coalesce(sum(amount),0)::numeric(15,3) into used
   from private.aqari_credit_allocations where workspace_id=w and credit_entry_id=credit.id;
  remaining:=credit.amount-used;
  if remaining<=0 then
    return jsonb_build_object('allocated','0.000','remaining','0.000','allocations',0,'schedule',public.aqari_rent_due_schedule(w,p_lease_id)->'periods');
  end if;

  for row_data in
    select d.period,d.due_amount,d.paid_amount,d.credit_amount
    from private.aqari_rent_due_periods d
    where d.workspace_id=w and d.lease_id=p_lease_id and d.period>=p_start_period
    order by d.period
    for update
  loop
    exit when remaining<=0;
    outstanding:=greatest(row_data.due_amount-row_data.paid_amount-row_data.credit_amount,0);
    continue when outstanding<=0;
    perform private.aqari_financial_open(w,row_data.period);
    applied:=least(remaining,outstanding);
    allocation_id:=gen_random_uuid();
    insert into private.aqari_credit_allocations(
      id,workspace_id,credit_entry_id,lease_id,period,amount,actor_id
    ) values(allocation_id,w,credit.id,p_lease_id,row_data.period,applied,auth.uid());
    remaining:=remaining-applied;
    allocation_count:=allocation_count+1;
  end loop;

  perform private.aqari_refresh_rent_due_schedule(w,p_lease_id);
  select coalesce(nullif(display_name,''),auth.uid()::text) into actor_name
   from public.aqari_profiles where user_id=auth.uid();
  insert into private.aqari_operations_audit(
    workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value
  ) values(
    w,'tenant_credit',credit.id,'allocate_forward',auth.uid(),coalesce(actor_name,auth.uid()::text),
    'تخصيص رصيد دائن على الاستحقاقات المستقبلية',
    jsonb_build_object('lease_id',p_lease_id,'start_period',p_start_period,'allocated',credit.amount-used-remaining,'remaining',remaining,'allocations',allocation_count)
  );

  return jsonb_build_object(
    'allocated',(credit.amount-used-remaining)::numeric(15,3),
    'remaining',remaining::numeric(15,3),
    'allocations',allocation_count,
    'schedule',public.aqari_rent_due_schedule(w,p_lease_id)->'periods'
  );
end $$;

revoke all on function public.aqari_allocate_credit_forward(uuid,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.aqari_allocate_credit_forward(uuid,uuid,uuid,date) to authenticated;

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
  if p_lease_id is not null and not private.aqari_can_lease(w,p_lease_id,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_lease_id is null and not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'periods',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lease_id',d.lease_id,'contract_no',l.contract_no,'period',d.period,
        'due_amount',d.due_amount,'paid_amount',d.paid_amount,'credit_amount',d.credit_amount,
        'balance',d.balance,'status',d.status,'source_hash',d.source_hash
      ) order by d.period,d.lease_id)
      from private.aqari_rent_due_periods d
      join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
      where d.workspace_id=w and (p_lease_id is null or d.lease_id=p_lease_id)
        and private.aqari_can_lease(w,d.lease_id,'collections','read')
    ),'[]'::jsonb),
    'generated_from','signed lease terms + non-cancelled payments + allocated tenant credit'
  );
end $$;

-- Recalculate existing schedules after introducing credit allocation.
do $$declare r record;begin
  for r in select workspace_id,id from public.aqari_leases where status='signed' loop
    perform private.aqari_refresh_rent_due_schedule(r.workspace_id,r.id);
  end loop;
end $$;

commit;
