-- REVIEW CANDIDATE ONLY: not an approved Production migration.
begin;
set local lock_timeout='5s';
do $preflight$
begin
 if to_regclass('private.aqari_commercial_payment_allocations') is not null
 or to_regclass('private.aqari_commercial_payment_allocation_reversals') is not null
 or to_regprocedure('private.aqari_legacy_allocation_clearance(uuid,uuid)') is not null
 or to_regprocedure('private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)') is not null then
  raise exception 'COMMERCIAL_RECONCILIATION_ALREADY_PRESENT_OR_PARTIAL';
 end if;
 if md5(pg_get_functiondef('private.aqari_refresh_rent_due_schedule(uuid,uuid)'::regprocedure))<>'d08c427a9a88f3ce9ce825856c1f7ee6'
 or md5(pg_get_functiondef('private.aqari_require_commercial_clearance(uuid,uuid)'::regprocedure))<>'f85dbffd94958b57ff39041e1aad7562'
 or md5(pg_get_functiondef('private.aqari_vacating_balances(uuid,uuid,date)'::regprocedure))<>'eee384e897e6041f1b815f9c5d590e1a' then
  raise exception 'COMMERCIAL_RECONCILIATION_SOURCE_CHANGED';
 end if;
 if to_regprocedure('private.aqari_independent_commercial_clearance(uuid,uuid)') is null
 or to_regprocedure('private.aqari_commercial_legacy_mode_guard()') is null then
  raise exception 'COMMERCIAL_RECONCILIATION_INDEPENDENT_MODE_MISSING';
 end if;
end $preflight$;


-- Source: staging-database/supabase/migrations/20260912182933_v267_commercial_payment_allocation_and_vacating_balance.sql
-- V267 isolated preview: allocate confirmed lease payments between rent and
-- commercial percentage-sales obligations without double-counting one payment.
create table if not exists private.aqari_commercial_payment_allocations(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 sale_id uuid not null,
 payment_id uuid not null references public.aqari_rent_payments(id),
 amount numeric(15,3) not null check(amount>0),
 allocated_on date not null,
 request_data jsonb not null,
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 unique(workspace_id,id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,sale_id) references private.aqari_commercial_sales(workspace_id,id)
);
create table if not exists private.aqari_commercial_payment_allocation_reversals(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 allocation_id uuid not null,
 occurred_on date not null,
 reason text not null check(length(btrim(reason)) between 5 and 500),
 request_data jsonb not null,
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 unique(workspace_id,id),
 unique(workspace_id,allocation_id),
 foreign key(workspace_id,allocation_id) references private.aqari_commercial_payment_allocations(workspace_id,id)
);
create index if not exists aqari_commercial_alloc_sale on private.aqari_commercial_payment_allocations(workspace_id,sale_id,recorded_at,id);
create index if not exists aqari_commercial_alloc_payment on private.aqari_commercial_payment_allocations(workspace_id,payment_id,recorded_at,id);
create index if not exists aqari_commercial_alloc_lease on private.aqari_commercial_payment_allocations(workspace_id,lease_id,recorded_at,id);
alter table private.aqari_commercial_payment_allocations enable row level security;
alter table private.aqari_commercial_payment_allocation_reversals enable row level security;
revoke all on private.aqari_commercial_payment_allocations,private.aqari_commercial_payment_allocation_reversals from public,anon,authenticated;

drop trigger if exists aqari_commercial_payment_allocations_immutable on private.aqari_commercial_payment_allocations;
create trigger aqari_commercial_payment_allocations_immutable before update or delete on private.aqari_commercial_payment_allocations
 for each row execute function private.aqari_reject_immutable_change();
drop trigger if exists aqari_commercial_payment_allocation_reversals_immutable on private.aqari_commercial_payment_allocation_reversals;
create trigger aqari_commercial_payment_allocation_reversals_immutable before update or delete on private.aqari_commercial_payment_allocation_reversals
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_commercial_statement_data(w uuid,lid uuid,from_d date,to_d date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare due_total numeric:=0;paid_total numeric:=0;
begin
 if auth.uid() is null or not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if from_d is null or to_d is null or from_d>to_d then raise invalid_parameter_value using message='INVALID_COMMERCIAL_STATEMENT_PERIOD';end if;
 select coalesce(sum(s.amount),0) into due_total
 from private.aqari_commercial_sales s
 where s.workspace_id=w and s.lease_id=lid and s.period_end between from_d and to_d
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id);
 select coalesce(sum(a.amount),0) into paid_total
 from private.aqari_commercial_payment_allocations a
 join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id and s.lease_id=a.lease_id
 join public.aqari_rent_payments p on p.id=a.payment_id and p.workspace_id=a.workspace_id and p.lease_id=a.lease_id
 where a.workspace_id=w and a.lease_id=lid and s.period_end between from_d and to_d
  and p.status in ('مدفوع','جزئي','paid','partial')
  and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)
  and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id);
 return jsonb_build_object(
  'lease_id',lid,'from_date',from_d,'to_date',to_d,
  'commercial_due_total',due_total::numeric(18,3)::text,
  'commercial_paid_total',paid_total::numeric(18,3)::text,
  'commercial_balance',greatest(due_total-paid_total,0)::numeric(18,3)::text,
  'sales',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'reversal',(select to_jsonb(sr) from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('payment_reference',p.reference,'payment_status',p.status,'payment_amount',p.amount::text,'reversal',(select to_jsonb(ar) from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)) order by a.recorded_at,a.id)
      from private.aqari_commercial_payment_allocations a join public.aqari_rent_payments p on p.id=a.payment_id
      where a.workspace_id=w and a.sale_id=s.id),'[]'::jsonb),
    'paid_amount',coalesce((select sum(a.amount) from private.aqari_commercial_payment_allocations a join public.aqari_rent_payments p on p.id=a.payment_id and p.workspace_id=a.workspace_id
      where a.workspace_id=w and a.sale_id=s.id and p.status in ('مدفوع','جزئي','paid','partial')
       and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)),0)::numeric(18,3)::text
   ) order by s.month,s.recorded_at,s.id)
   from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end between from_d and to_d),'[]'::jsonb)
 );
end $$;

create or replace function public.aqari_commercial_statement(p_workspace_id uuid,p_lease_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare prop uuid;
begin
 if auth.uid() is null or not private.aqari_can(p_workspace_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select u.property_id into prop from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where l.workspace_id=p_workspace_id and l.id=p_lease_id;
 if prop is null or not private.aqari_can_property(p_workspace_id,prop,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return private.aqari_commercial_statement_data(p_workspace_id,p_lease_id,p_from,p_to);
end $$;
revoke all on function public.aqari_commercial_statement(uuid,uuid,date,date),private.aqari_commercial_statement_data(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.aqari_commercial_statement(uuid,uuid,date,date),private.aqari_commercial_statement_data(uuid,uuid,date,date) to authenticated;

create or replace function private.aqari_commercial_payment_allocations_register(w uuid,action text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();ident uuid;sale_id uuid;payment_id uuid;allocation_id uuid;amount numeric;on_day date;today date:=(now() at time zone 'Asia/Kuwait')::date;
 s private.aqari_commercial_sales;p public.aqari_rent_payments;a private.aqari_commercial_payment_allocations;r private.aqari_commercial_payment_allocation_reversals;
 request jsonb;prop uuid;sale_used numeric;payment_used numeric;result jsonb;reason text;
begin
 if actor is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or action not in ('list','allocate','reverse') then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATION_ACTION';end if;
 if action='list' then
  allocation_id:=nullif(d->>'lease_id','')::uuid;
  if allocation_id is null or exists(select 1 from jsonb_object_keys(d) k where k<>'lease_id') then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATION_LIST';end if;
  select u.property_id into prop from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=allocation_id;
  if prop is null or not private.aqari_can_property(w,prop,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return private.aqari_commercial_statement_data(w,allocation_id,'2000-01-01'::date,'2099-12-31'::date);
 end if;
 if not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='ALLOCATION_ID_REQUIRED';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='allocate' then
  if exists(select 1 from jsonb_object_keys(d) k where k not in('id','sale_id','payment_id','amount'))
   or coalesce(d->>'amount','')!~'^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATION';end if;
  sale_id:=nullif(d->>'sale_id','')::uuid;payment_id:=nullif(d->>'payment_id','')::uuid;amount:=(d->>'amount')::numeric;
  if sale_id is null or payment_id is null or amount<=0 then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATION';end if;
  request:=jsonb_build_object('id',ident,'sale_id',sale_id,'payment_id',payment_id,'amount',to_char(amount,'FM999999999990.000'));
  select * into a from private.aqari_commercial_payment_allocations where id=ident;
  if found then if a.workspace_id<>w or a.request_data is distinct from request then raise unique_violation using message='COMMERCIAL_ALLOCATION_RETRY_CONFLICT';end if;return to_jsonb(a);end if;
  select * into s from private.aqari_commercial_sales where workspace_id=w and id=sale_id for share;
  if not found or exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id) then raise check_violation using message='COMMERCIAL_SALE_NOT_OPEN';end if;
  select * into p from public.aqari_rent_payments where workspace_id=w and id=payment_id for share;
  if not found or p.lease_id<>s.lease_id or p.status not in ('مدفوع','جزئي','paid','partial') or exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) then raise check_violation using message='COMMERCIAL_PAYMENT_NOT_AVAILABLE';end if;
  select u.property_id into prop from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=s.lease_id;
  if prop is null or not private.aqari_can_property(w,prop,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_financial_open(w,p.paid_at);
  select coalesce(sum(x.amount),0) into sale_used from private.aqari_commercial_payment_allocations x
   where x.workspace_id=w and x.sale_id=s.id and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals xr where xr.workspace_id=w and xr.allocation_id=x.id);
  select coalesce(sum(x.amount),0) into payment_used from private.aqari_commercial_payment_allocations x
   join private.aqari_commercial_sales xs on xs.workspace_id=x.workspace_id and xs.id=x.sale_id
   where x.workspace_id=w and x.payment_id=p.id
    and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals xr where xr.workspace_id=w and xr.allocation_id=x.id)
    and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=xs.id);
  if sale_used+amount>s.amount then raise check_violation using message='COMMERCIAL_SALE_OVERALLOCATED';end if;
  if payment_used+amount>p.amount then raise check_violation using message='COMMERCIAL_PAYMENT_OVERALLOCATED';end if;
  insert into private.aqari_commercial_payment_allocations(id,workspace_id,lease_id,sale_id,payment_id,amount,allocated_on,request_data,recorded_by)
   values(ident,w,s.lease_id,s.id,p.id,amount,p.paid_at,request,actor) returning * into a;
  result:=to_jsonb(a);
 else
  if exists(select 1 from jsonb_object_keys(d) k where k not in('id','allocation_id','occurred_on','reason'))
   or coalesce(d->>'occurred_on','')!~'^20[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATION_REVERSAL';end if;
  allocation_id:=nullif(d->>'allocation_id','')::uuid;on_day:=(d->>'occurred_on')::date;reason:=btrim(coalesce(d->>'reason',''));
  if allocation_id is null or length(reason) not between 5 and 500 or on_day>today then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATION_REVERSAL';end if;
  request:=jsonb_build_object('id',ident,'allocation_id',allocation_id,'occurred_on',on_day,'reason',reason);
  select * into r from private.aqari_commercial_payment_allocation_reversals where id=ident;
  if found then if r.workspace_id<>w or r.request_data is distinct from request then raise unique_violation using message='COMMERCIAL_ALLOCATION_RETRY_CONFLICT';end if;return to_jsonb(r);end if;
  select * into a from private.aqari_commercial_payment_allocations where workspace_id=w and id=allocation_id for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if on_day<a.allocated_on then raise check_violation using message='INVALID_COMMERCIAL_ALLOCATION_REVERSAL_DATE';end if;
  select u.property_id into prop from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=a.lease_id;
  if prop is null or not private.aqari_can_property(w,prop,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_financial_open(w,on_day);
  if exists(select 1 from private.aqari_commercial_payment_allocation_reversals x where x.workspace_id=w and x.allocation_id=a.id) then raise unique_violation using message='COMMERCIAL_ALLOCATION_ALREADY_REVERSED';end if;
  insert into private.aqari_commercial_payment_allocation_reversals(id,workspace_id,allocation_id,occurred_on,reason,request_data,recorded_by)
   values(ident,w,a.id,on_day,reason,request,actor) returning * into r;
  result:=to_jsonb(r);
 end if;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
  values(w,'commercial_payment_allocation',ident,action,actor,coalesce(auth.jwt()->>'email',actor::text),coalesce(reason,'تخصيص سداد نسبة المبيعات'),result);
 return result;
end $$;
create or replace function public.aqari_commercial_payment_allocations(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.aqari_commercial_payment_allocations_register(p_workspace_id,p_action,p_data) $$;
revoke all on function private.aqari_commercial_payment_allocations_register(uuid,text,jsonb),public.aqari_commercial_payment_allocations(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_commercial_payment_allocations_register(uuid,text,jsonb),public.aqari_commercial_payment_allocations(uuid,text,jsonb) to authenticated;

create or replace function private.aqari_commercial_sale_reversal_allocation_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.aqari_commercial_payment_allocations a where a.workspace_id=new.workspace_id and a.sale_id=new.sale_id
  and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals r where r.workspace_id=new.workspace_id and r.allocation_id=a.id)) then
  raise check_violation using message='اعكس تخصيصات السداد أولاً قبل عكس استحقاق نسبة المبيعات.',detail='COMMERCIAL_SALES_ALLOCATION_REVERSAL_REQUIRED';
 end if;
 return new;
end $$;
drop trigger if exists aqari_commercial_sale_reversal_allocation_guard on private.aqari_commercial_sales_reversals;
create trigger aqari_commercial_sale_reversal_allocation_guard before insert on private.aqari_commercial_sales_reversals for each row execute function private.aqari_commercial_sale_reversal_allocation_guard();
revoke all on function private.aqari_commercial_sale_reversal_allocation_guard() from public,anon,authenticated;

create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';end if;
 if exists(select 1 from private.aqari_commercial_payment_allocations a
  join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id
  join public.aqari_rent_payments p on p.id=a.payment_id
  where a.workspace_id=w and a.lease_id=lid and (s.lease_id<>lid or p.workspace_id<>w or p.lease_id<>lid or a.amount<=0)) then
  raise check_violation using message='تخصيصات سداد نسبة المبيعات تحتاج مراجعة مصدرية.',detail='COMMERCIAL_PAYMENT_ALLOCATION_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.amount>0
  and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id)
  and s.amount>coalesce((select sum(a.amount) from private.aqari_commercial_payment_allocations a join public.aqari_rent_payments p on p.id=a.payment_id and p.workspace_id=a.workspace_id and p.lease_id=a.lease_id
    where a.workspace_id=w and a.sale_id=s.id and p.status in ('مدفوع','جزئي','paid','partial')
     and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)),0)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير مسددة بالكامل. خصص سداداً مؤكداً أو اعكس الاستحقاق بمساره الموثق قبل الإخلاء.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases;due_total numeric:=0;payment_total numeric:=0;commercial_due numeric:=0;commercial_paid numeric:=0;rent_paid_total numeric:=0;deposit_balance numeric:=0;period_start date;period_end date;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 if l.start_date is null or l.monthly_rent is null or l.end_date is null or vdate<l.start_date then raise exception 'VACATING_INCOMPLETE_CONTRACT' using errcode='22023';end if;
 period_start:=date_trunc('month',coalesce(l.start_date,vdate))::date;period_end:=date_trunc('month',vdate)::date;
 if period_start<=period_end then
  select coalesce(sum(case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end),0)
   into due_total from generate_series(period_start,period_end,interval '1 month') p;
 end if;
 select coalesce(sum(p.amount),0) into payment_total from public.aqari_rent_payments p
  where p.workspace_id=w and p.lease_id=lid and p.paid_at<=vdate and p.status in ('مدفوع','جزئي','paid','partial');
 select coalesce(sum(s.amount),0) into commercial_due from private.aqari_commercial_sales s
  where s.workspace_id=w and s.lease_id=lid and s.period_end<=vdate and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id);
 select coalesce(sum(a.amount),0) into commercial_paid from private.aqari_commercial_payment_allocations a
  join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id and s.lease_id=a.lease_id
  join public.aqari_rent_payments p on p.id=a.payment_id and p.workspace_id=a.workspace_id and p.lease_id=a.lease_id
  where a.workspace_id=w and a.lease_id=lid and s.period_end<=vdate and p.paid_at<=vdate and p.status in ('مدفوع','جزئي','paid','partial')
   and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)
   and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id);
 rent_paid_total:=greatest(payment_total-commercial_paid,0);
 select coalesce(sum(case e.kind when 'receipt' then e.amount else -e.amount end),0) into deposit_balance from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=lid;
 return jsonb_build_object(
  'rent_due_total',due_total::numeric(18,3)::text,'rent_payment_total',payment_total::numeric(18,3)::text,'commercial_allocated_from_payments',commercial_paid::numeric(18,3)::text,
  'rent_paid_total',rent_paid_total::numeric(18,3)::text,'rent_balance',greatest(due_total-rent_paid_total,0)::numeric(18,3)::text,'tenant_credit',greatest(rent_paid_total-due_total,0)::numeric(18,3)::text,
  'commercial_sales_due_total',commercial_due::numeric(18,3)::text,'commercial_sales_paid_total',commercial_paid::numeric(18,3)::text,'commercial_sales_balance',greatest(commercial_due-commercial_paid,0)::numeric(18,3)::text,
  'unified_due_balance',(greatest(due_total-rent_paid_total,0)+greatest(commercial_due-commercial_paid,0))::numeric(18,3)::text,
  'deposit_balance',deposit_balance::numeric(18,3)::text);
end $$;
revoke all on function private.aqari_vacating_balances(uuid,uuid,date) from public,anon,authenticated;
grant execute on function private.aqari_vacating_balances(uuid,uuid,date) to authenticated;


-- Source: staging-database/supabase/migrations/20260912183407_v267_commercial_active_allocation_view.sql
-- One internal source of truth for commercial allocations that still carry value.
create or replace view private.aqari_commercial_active_allocations as
select a.id allocation_id,a.workspace_id,a.lease_id,a.sale_id,a.payment_id,a.amount,a.allocated_on,a.recorded_at,
 s.period_end sale_period_end,p.period payment_period,p.paid_at,p.status payment_status
from private.aqari_commercial_payment_allocations a
join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id and s.lease_id=a.lease_id
join public.aqari_rent_payments p on p.id=a.payment_id and p.workspace_id=a.workspace_id and p.lease_id=a.lease_id
where p.status in ('مدفوع','جزئي','paid','partial')
 and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=a.workspace_id and c.payment_id=a.payment_id)
 and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=a.workspace_id and ar.allocation_id=a.id)
 and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=a.workspace_id and sr.sale_id=a.sale_id);
revoke all on private.aqari_commercial_active_allocations from public,anon,authenticated;


-- Source: staging-database/supabase/migrations/20260912183421_v267_rent_schedule_commercial_allocation_residual.sql
-- Rent due schedule must count only the residual part of a payment after an
-- active commercial-sales allocation. Allocation/reversal immediately refreshes it.
create or replace function private.aqari_refresh_rent_due_schedule(w uuid,lid uuid)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare l public.aqari_leases;changed integer:=0;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then return 0;end if;
 if l.status<>'signed' then
  delete from private.aqari_rent_due_periods where workspace_id=w and lease_id=lid;
  get diagnostics changed=row_count;return changed;
 end if;
 delete from private.aqari_rent_due_periods d where d.workspace_id=w and d.lease_id=lid
  and (d.period<date_trunc('month',l.start_date)::date or d.period>date_trunc('month',l.end_date)::date);
 insert into private.aqari_rent_due_periods(workspace_id,lease_id,period,due_amount,paid_amount,credit_amount,balance,status,generated_at,source_hash)
 select l.workspace_id,l.id,g.period,due.amount,paid.amount,credit.amount,
  due.amount-paid.amount-credit.amount,
  case when due.amount=0 then 'waived' when paid.amount+credit.amount=0 then 'due'
   when paid.amount+credit.amount<due.amount then 'partial' when paid.amount+credit.amount=due.amount then 'paid' else 'overpaid' end,
  now(),encode(sha256(convert_to(jsonb_build_object('lease',l.id,'period',g.period,'due',due.amount,'paid',paid.amount,'credit',credit.amount,'snapshot',l.snapshot,'monthly_rent',l.monthly_rent)::text,'UTF8')),'hex')
 from lateral (select gs::date period from generate_series(date_trunc('month',l.start_date)::date,date_trunc('month',l.end_date)::date,interval '1 month') gs) g
 cross join lateral (select private.aqari_reminder_due(l.snapshot,l.monthly_rent,g.period)::numeric(15,3) amount) due
 cross join lateral (
  select coalesce(sum(greatest(p.amount-coalesce((select sum(v.amount) from private.aqari_commercial_active_allocations v where v.workspace_id=w and v.payment_id=p.id),0),0)),0)::numeric(15,3) amount
  from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=g.period
   and lower(coalesce(p.status,'')) not in ('cancelled','ملغى')
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
 ) paid
 cross join lateral (select coalesce(sum(a.amount),0)::numeric(15,3) amount from private.aqari_credit_allocations a where a.workspace_id=w and a.lease_id=l.id and a.period=g.period) credit
 on conflict(workspace_id,lease_id,period) do update set due_amount=excluded.due_amount,paid_amount=excluded.paid_amount,credit_amount=excluded.credit_amount,balance=excluded.balance,status=excluded.status,generated_at=excluded.generated_at,source_hash=excluded.source_hash;
 get diagnostics changed=row_count;return changed;
end $$;
create or replace function private.aqari_refresh_rent_due_after_commercial_allocation() returns trigger
language plpgsql security definer set search_path='' as $$begin perform private.aqari_refresh_rent_due_schedule(new.workspace_id,new.lease_id);return new;end $$;
create or replace function private.aqari_refresh_rent_due_after_commercial_allocation_reversal() returns trigger
language plpgsql security definer set search_path='' as $$declare a private.aqari_commercial_payment_allocations;begin select * into a from private.aqari_commercial_payment_allocations where workspace_id=new.workspace_id and id=new.allocation_id;if found then perform private.aqari_refresh_rent_due_schedule(a.workspace_id,a.lease_id);end if;return new;end $$;
revoke all on function private.aqari_refresh_rent_due_after_commercial_allocation(),private.aqari_refresh_rent_due_after_commercial_allocation_reversal() from public,anon,authenticated;
drop trigger if exists aqari_refresh_rent_due_after_commercial_allocation on private.aqari_commercial_payment_allocations;
create trigger aqari_refresh_rent_due_after_commercial_allocation after insert on private.aqari_commercial_payment_allocations for each row execute function private.aqari_refresh_rent_due_after_commercial_allocation();
drop trigger if exists aqari_refresh_rent_due_after_commercial_allocation_reversal on private.aqari_commercial_payment_allocation_reversals;
create trigger aqari_refresh_rent_due_after_commercial_allocation_reversal after insert on private.aqari_commercial_payment_allocation_reversals for each row execute function private.aqari_refresh_rent_due_after_commercial_allocation_reversal();


-- Source: staging-database/supabase/migrations/20260912183434_v267_commercial_statement_cancelled_receipt_consistency.sql
-- Commercial statement reads the same active-allocation source as clearance.
create or replace function private.aqari_commercial_statement_data(w uuid,lid uuid,from_d date,to_d date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare due_total numeric:=0;paid_total numeric:=0;
begin
 if auth.uid() is null or not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if from_d is null or to_d is null or from_d>to_d then raise invalid_parameter_value using message='INVALID_COMMERCIAL_STATEMENT_PERIOD';end if;
 select coalesce(sum(s.amount),0) into due_total from private.aqari_commercial_sales s
 where s.workspace_id=w and s.lease_id=lid and s.period_end between from_d and to_d
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id);
 select coalesce(sum(v.amount),0) into paid_total from private.aqari_commercial_active_allocations v
 where v.workspace_id=w and v.lease_id=lid and v.sale_period_end between from_d and to_d;
 return jsonb_build_object(
  'lease_id',lid,'from_date',from_d,'to_date',to_d,
  'commercial_due_total',due_total::numeric(18,3)::text,
  'commercial_paid_total',paid_total::numeric(18,3)::text,
  'commercial_balance',greatest(due_total-paid_total,0)::numeric(18,3)::text,
  'sales',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'reversal',(select to_jsonb(sr) from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id),
    'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'payment_reference',p.reference,'payment_status',p.status,'payment_amount',p.amount::text,
      'receipt_cancelled',exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id),
      'reversal',(select to_jsonb(ar) from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=w and ar.allocation_id=a.id)
     ) order by a.recorded_at,a.id)
     from private.aqari_commercial_payment_allocations a join public.aqari_rent_payments p on p.id=a.payment_id
     where a.workspace_id=w and a.sale_id=s.id),'[]'::jsonb),
    'paid_amount',coalesce((select sum(v.amount) from private.aqari_commercial_active_allocations v where v.workspace_id=w and v.sale_id=s.id),0)::numeric(18,3)::text
   ) order by s.month,s.recorded_at,s.id)
   from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end between from_d and to_d),'[]'::jsonb)
 );
end $$;


-- Source: staging-database/supabase/migrations/20260912183448_v267_commercial_clearance_active_payment_consistency.sql
-- Vacating clearance counts only active, confirmed, non-cancelled payment allocations.
create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_payment_allocations a
  join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id
  join public.aqari_rent_payments p on p.id=a.payment_id
  where a.workspace_id=w and a.lease_id=lid and (s.lease_id<>lid or p.workspace_id<>w or p.lease_id<>lid or a.amount<=0)) then
  raise check_violation using message='تخصيصات سداد نسبة المبيعات تحتاج مراجعة مصدرية.',detail='COMMERCIAL_PAYMENT_ALLOCATION_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_sales s
  where s.workspace_id=w and s.lease_id=lid and s.amount>0
   and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id)
   and s.amount>coalesce((select sum(v.amount) from private.aqari_commercial_active_allocations v where v.workspace_id=w and v.sale_id=s.id),0)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير مسددة بالكامل. خصص سداداً مؤكداً أو اعكس الاستحقاق بمساره الموثق قبل الإخلاء.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;


-- Source: staging-database/supabase/migrations/20260912183503_v267_vacating_balance_commercial_payment_consistency.sql
-- Unified vacating balance splits confirmed tenant payments between rent and
-- active commercial sales allocations and excludes cancelled receipts.
create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases;due_total numeric:=0;payment_total numeric:=0;commercial_due numeric:=0;commercial_paid numeric:=0;rent_paid_total numeric:=0;deposit_balance numeric:=0;period_start date;period_end date;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 if l.start_date is null or l.monthly_rent is null or l.end_date is null or vdate<l.start_date then raise exception 'VACATING_INCOMPLETE_CONTRACT' using errcode='22023';end if;
 period_start:=date_trunc('month',coalesce(l.start_date,vdate))::date;period_end:=date_trunc('month',vdate)::date;
 if period_start<=period_end then
  select coalesce(sum(case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end),0)
  into due_total from generate_series(period_start,period_end,interval '1 month') p;
 end if;
 select coalesce(sum(p.amount),0) into payment_total from public.aqari_rent_payments p
 where p.workspace_id=w and p.lease_id=lid and p.paid_at<=vdate and p.status in ('مدفوع','جزئي','paid','partial')
  and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
 select coalesce(sum(s.amount),0) into commercial_due from private.aqari_commercial_sales s
 where s.workspace_id=w and s.lease_id=lid and s.period_end<=vdate
  and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id);
 select coalesce(sum(v.amount),0) into commercial_paid from private.aqari_commercial_active_allocations v
 where v.workspace_id=w and v.lease_id=lid and v.sale_period_end<=vdate and v.paid_at<=vdate;
 rent_paid_total:=greatest(payment_total-commercial_paid,0);
 select coalesce(sum(case e.kind when 'receipt' then e.amount else -e.amount end),0) into deposit_balance
 from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=lid;
 return jsonb_build_object(
  'rent_due_total',due_total::numeric(18,3)::text,
  'rent_payment_total',payment_total::numeric(18,3)::text,
  'commercial_allocated_from_payments',commercial_paid::numeric(18,3)::text,
  'rent_paid_total',rent_paid_total::numeric(18,3)::text,
  'rent_balance',greatest(due_total-rent_paid_total,0)::numeric(18,3)::text,
  'tenant_credit',greatest(rent_paid_total-due_total,0)::numeric(18,3)::text,
  'commercial_sales_due_total',commercial_due::numeric(18,3)::text,
  'commercial_sales_paid_total',commercial_paid::numeric(18,3)::text,
  'commercial_sales_balance',greatest(commercial_due-commercial_paid,0)::numeric(18,3)::text,
  'unified_due_balance',(greatest(due_total-rent_paid_total,0)+greatest(commercial_due-commercial_paid,0))::numeric(18,3)::text,
  'deposit_balance',deposit_balance::numeric(18,3)::text);
end $$;


-- Source: staging-database/supabase/migrations/20260912184410_v267_commercial_payment_context.sql
-- Read-only context for the commercial-sales desk. It returns the saved
-- commercial statement plus confirmed lease payments and the remaining amount
-- that can still be allocated to percentage-sales obligations.
create or replace function private.aqari_commercial_payment_context_data(w uuid,lid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare statement jsonb;
begin
 statement:=private.aqari_commercial_statement_data(w,lid,'2000-01-01'::date,'2099-12-31'::date);
 return jsonb_build_object(
  'lease_id',lid,
  'statement',statement,
  'payments',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',p.id,
    'reference',p.reference,
    'amount',p.amount::numeric(18,3)::text,
    'paid_at',p.paid_at,
    'period',p.period,
    'status',p.status,
    'payment_method',p.payment_method,
    'allocated_amount',coalesce(a.allocated,0)::numeric(18,3)::text,
    'available_amount',greatest(p.amount-coalesce(a.allocated,0),0)::numeric(18,3)::text
   ) order by p.paid_at,p.reference,p.id)
   from public.aqari_rent_payments p
   left join lateral (
    select coalesce(sum(v.amount),0) allocated
    from private.aqari_commercial_active_allocations v
    where v.workspace_id=w and v.payment_id=p.id
   ) a on true
   where p.workspace_id=w and p.lease_id=lid
    and p.status in('مدفوع','جزئي','paid','partial')
    and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  ),'[]'::jsonb)
 );
end $$;

create or replace function public.aqari_commercial_payment_context(p_workspace_id uuid,p_lease_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare prop uuid;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 select u.property_id into prop
 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where l.workspace_id=p_workspace_id and l.id=p_lease_id;
 if prop is null or not private.aqari_can_property(p_workspace_id,prop,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 return private.aqari_commercial_payment_context_data(p_workspace_id,p_lease_id);
end $$;
revoke all on function private.aqari_commercial_payment_context_data(uuid,uuid),public.aqari_commercial_payment_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_commercial_payment_context(uuid,uuid) to authenticated;


-- Source: staging-database/supabase/migrations/20260912184456_v267_commercial_payment_context_wrapper_fix.sql
-- The public wrapper performs the auth/role/property checks itself and is the
-- only authenticated entry point. The private data helper remains non-callable.
create or replace function public.aqari_commercial_payment_context(p_workspace_id uuid,p_lease_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prop uuid;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 select u.property_id into prop
 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where l.workspace_id=p_workspace_id and l.id=p_lease_id;
 if prop is null or not private.aqari_can_property(p_workspace_id,prop,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 return private.aqari_commercial_payment_context_data(p_workspace_id,p_lease_id);
end $$;
revoke all on function private.aqari_commercial_payment_context_data(uuid,uuid) from public,anon,authenticated;
revoke all on function public.aqari_commercial_payment_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_commercial_payment_context(uuid,uuid) to authenticated;


-- Preserve independent collection routing and workspace locking.
do $compat$
declare guard_source text;balance_source text;guard_saved boolean;balance_saved boolean;
begin
 if to_regclass('private.aqari_commercial_payment_allocations') is null then
  execute $install$create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
   language plpgsql volatile security definer set search_path='' as $fn$begin perform private.aqari_independent_commercial_clearance(w,lid);end $fn$;$install$;
  revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
  return;
 end if;
 if to_regclass('private.aqari_commercial_active_allocations') is null then raise exception 'COMMERCIAL_COMPAT_SOURCE_INCOMPLETE';end if;
 guard_source:=pg_get_functiondef('private.aqari_require_commercial_clearance(uuid,uuid)'::regprocedure);
 balance_source:=pg_get_functiondef('private.aqari_vacating_balances(uuid,uuid,date)'::regprocedure);
 guard_saved:=to_regprocedure('private.aqari_legacy_allocation_clearance(uuid,uuid)') is not null;
 balance_saved:=to_regprocedure('private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)') is not null;
 if guard_saved<>balance_saved then raise exception 'COMMERCIAL_COMPAT_SOURCE_INCOMPLETE';end if;
 if not guard_saved then
  if position('aqari_commercial_active_allocations' in guard_source)=0 or position('aqari_commercial_active_allocations' in balance_source)=0
   or position('aqari_legacy_allocation_clearance' in guard_source)>0 or position('aqari_legacy_allocation_vacating_balances' in balance_source)>0 then raise exception 'COMMERCIAL_COMPAT_SOURCE_CHANGED';end if;
  execute replace(guard_source,'CREATE OR REPLACE FUNCTION private.aqari_require_commercial_clearance(','CREATE OR REPLACE FUNCTION private.aqari_legacy_allocation_clearance(');
  execute replace(balance_source,'CREATE OR REPLACE FUNCTION private.aqari_vacating_balances(','CREATE OR REPLACE FUNCTION private.aqari_legacy_allocation_vacating_balances(');
 else
  if position('aqari_legacy_allocation_clearance' in guard_source)=0 or position('aqari_legacy_allocation_vacating_balances' in balance_source)=0 then raise exception 'COMMERCIAL_COMPAT_SOURCE_CHANGED';end if;
 end if;
 revoke all on function private.aqari_legacy_allocation_clearance(uuid,uuid),private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date) from public,anon,authenticated;
 execute $install$create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
  language plpgsql volatile security definer set search_path='' as $fn$
  begin
   perform 1 from public.aqari_app_state where workspace_id=w for update;
   if exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid) then
    perform private.aqari_independent_commercial_clearance(w,lid);
   else
    perform private.aqari_legacy_allocation_clearance(w,lid);
   end if;
  end $fn$;$install$;
 execute $install$create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
  language plpgsql volatile security definer set search_path='' as $fn$
  declare original jsonb;commercial jsonb;due_value numeric;paid_value numeric;balance_value numeric;
  begin
   if auth.uid() is null or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   perform 1 from public.aqari_app_state where workspace_id=w for share;
   original:=private.aqari_legacy_allocation_vacating_balances(w,lid,vdate);
   if not exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid) then return original;end if;
   commercial:=private.aqari_commercial_balance(w,lid,vdate);
   due_value:=(commercial->>'charge_total')::numeric-(commercial->>'reversed_charge_total')::numeric;
   paid_value:=(commercial->>'collected_total')::numeric-(commercial->>'collection_reversed_total')::numeric;
   balance_value:=(commercial->>'balance')::numeric;
   return original||jsonb_build_object(
    'commercial_collection_mode','independent_collection',
    'commercial_sales_due_total',due_value::numeric(18,3)::text,
    'commercial_sales_paid_total',paid_value::numeric(18,3)::text,
    'commercial_sales_balance',balance_value::numeric(18,3)::text,
    'unified_due_balance',((original->>'rent_balance')::numeric+balance_value)::numeric(18,3)::text);
  end $fn$;$install$;
 revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
 execute 'drop trigger if exists aqari_commercial_legacy_mode_guard on private.aqari_commercial_payment_allocations';
 execute 'create trigger aqari_commercial_legacy_mode_guard before insert on private.aqari_commercial_payment_allocations for each row execute function private.aqari_commercial_legacy_mode_guard()';
end $compat$;

revoke all on function private.aqari_vacating_balances(uuid,uuid,date) from public,anon,authenticated,service_role;
commit;
