-- Current Production additive execution capability candidate. Generated from reviewed source modules.
-- No existing business rows, serial values or auth identities are written.
-- Preconditions abort atomically if concurrently changed definitions are observed.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $preconditions$ begin
 if md5(pg_get_functiondef(to_regprocedure('public.aqari_rent_due_schedule(uuid,uuid)'))) is distinct from '83ce78e284be8dac3b87fb146a8b02e2' then raise exception 'EXECUTION_DEPENDENCY_DRIFT: public.aqari_rent_due_schedule(uuid,uuid)';end if;
 if md5(pg_get_functiondef(to_regprocedure('private.aqari_contract_due(jsonb,text)'))) is distinct from 'e76921403b10af41d4c373bad296b871' then raise exception 'EXECUTION_DEPENDENCY_DRIFT: private.aqari_contract_due(jsonb,text)';end if;
 if md5(pg_get_functiondef(to_regprocedure('private.aqari_official_source_guard()'))) is distinct from '66f94d6201d715919ec416ce83f1d29d' then raise exception 'EXECUTION_DEPENDENCY_DRIFT: private.aqari_official_source_guard()';end if;
 if md5(pg_get_functiondef(to_regprocedure('private.aqari_reconcile_reminder_queue(uuid)'))) is distinct from '15fbbd4e68d0596e8a0f57be8c967f0c' then raise exception 'EXECUTION_DEPENDENCY_DRIFT: private.aqari_reconcile_reminder_queue(uuid)';end if;
 if md5(pg_get_functiondef(to_regprocedure('private.aqari_state_section(text)'))) is distinct from '8db5597e93e397db3711eb9b7e793617' then raise exception 'EXECUTION_DEPENDENCY_DRIFT: private.aqari_state_section(text)';end if;
 if md5(pg_get_functiondef(to_regprocedure('private.aqari_v267_prepare_reminders(uuid,date,integer)'))) is distinct from 'c178d4f1a83dcaf9a264fb8b2447d0f9' then raise exception 'EXECUTION_DEPENDENCY_DRIFT: private.aqari_v267_prepare_reminders(uuid,date,integer)';end if;
 if to_regclass('private.aqari_contract_execution_settlements') is not null then raise exception 'EXECUTION_CAPABILITY_ALREADY_PRESENT: private.aqari_contract_execution_settlements';end if;
 if to_regclass('private.aqari_contract_execution_artifacts') is not null then raise exception 'EXECUTION_CAPABILITY_ALREADY_PRESENT: private.aqari_contract_execution_artifacts';end if;
 if to_regclass('private.aqari_contract_execution_packages') is not null then raise exception 'EXECUTION_CAPABILITY_ALREADY_PRESENT: private.aqari_contract_execution_packages';end if;
 if to_regclass('private.aqari_contract_execution_package_consumptions') is not null then raise exception 'EXECUTION_CAPABILITY_ALREADY_PRESENT: private.aqari_contract_execution_package_consumptions';end if;
 if to_regclass('private.aqari_official_pdf_artifacts') is not null then raise exception 'EXECUTION_CAPABILITY_ALREADY_PRESENT: private.aqari_official_pdf_artifacts';end if;
 if md5(pg_get_functiondef('private.aqari_vacating_balances(uuid,uuid,date)'::regprocedure)) is distinct from 'eee384e897e6041f1b815f9c5d590e1a' then raise exception 'EXECUTION_VACATING_DEPENDENCY_DRIFT';end if;
end $preconditions$;

-- SOURCE: rent-entitlement-start.sql
-- Isolated V267: explicit new-contract entitlement terms, no legacy backfill.
-- Apply after current rent/reminder balance convergence. Never rewrite receipts.

create or replace function private.aqari_validate_rent_entitlement(c jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare e jsonb:=c->'rentEntitlement';s date;f text;
begin
 if jsonb_typeof(e) is distinct from 'object' or e->'version' is distinct from '1'::jsonb
  or (select count(*) from jsonb_object_keys(e))<>4
  or not (e ?& array['version','startDate','firstPeriodPolicy','manualFirstPeriodAmount']) then
  raise exception 'حدد بداية الاستحقاق وسياسة أول فترة صراحة قبل حفظ العقد.';end if;
 if e->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(e->'startDate') is distinct from 'string' then raise exception 'تاريخ بداية الاستحقاق غير صالح.';end if;
 s:=(e->>'startDate')::date;
 if to_char(s,'YYYY-MM-DD')<>e->>'startDate' or s<(c->>'start_date')::date or s>(c->>'end_date')::date then raise exception 'بداية الاستحقاق يجب أن تقع ضمن مدة العقد.';end if;
 if e->>'firstPeriodPolicy' not in ('full_month','daily_prorated','manual_first_period') or jsonb_typeof(e->'firstPeriodPolicy') is distinct from 'string' then raise exception 'اختر سياسة أول فترة دون افتراض احتساب تلقائي.';end if;
 if e->>'firstPeriodPolicy'='manual_first_period' then
  if jsonb_typeof(e->'manualFirstPeriodAmount') is distinct from 'number'
   or (e->>'manualFirstPeriodAmount')::numeric<0 or (e->>'manualFirstPeriodAmount')::numeric>999999999.999
   or round((e->>'manualFirstPeriodAmount')::numeric,3)<>(e->>'manualFirstPeriodAmount')::numeric then raise exception 'أدخل صافي أول فترة صراحة بدقة ثلاثة منازل دون التأمين أو الرسوم.';end if;
 elsif e->'manualFirstPeriodAmount' is distinct from 'null'::jsonb then raise exception 'مبلغ أول فترة اليدوي يخص السياسة اليدوية فقط.';end if;
end $$;
revoke all on function private.aqari_validate_rent_entitlement(jsonb) from public,anon,authenticated;

-- Same existing free-month and dated-discount calculation for every legacy row.
-- The new policy affects only the first calendar month; manual amount is NET.
create or replace function private.aqari_contract_due(c jsonb,period text) returns numeric
language plpgsql immutable set search_path='' as $$
declare a jsonb;amount numeric:=(c->>'rent')::numeric;e jsonb:=c->'rentEntitlement';s date;mon date;last_day date;days integer;
begin
 if c->>'rentalTermsVersion'='1' then
  if c->>'freeMonthApproved'='true' and c->>'freeMonthPeriod'=period then return 0;end if;
  for a in select value from jsonb_array_elements(coalesce(c->'rentAdjustments','[]')) loop
   if a->>'effectiveMonth'<=period then amount:=(a->>'rent')::numeric;end if;
  end loop;
 end if;
 if not (c ? 'rentEntitlement') then return amount;end if;
 perform private.aqari_validate_rent_entitlement(c);
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_ENTITLEMENT_PERIOD';end if;
 s:=(e->>'startDate')::date;mon:=(period||'-01')::date;
 if period<to_char(s,'YYYY-MM') or period>left(c->>'end_date',7) then return 0;end if;
 if period<>to_char(s,'YYYY-MM') then return amount;end if;
 if e->>'firstPeriodPolicy'='manual_first_period' then return (e->>'manualFirstPeriodAmount')::numeric;end if;
 if e->>'firstPeriodPolicy'='daily_prorated' then
  last_day:=(mon+interval '1 month - 1 day')::date;days:=least(last_day,(c->>'end_date')::date)-s+1;
  -- Round positive integer fils exactly once, half up; use actual calendar days.
  return floor((amount*1000*days*2+extract(day from last_day))/(extract(day from last_day)*2))/1000;
 end if;
 return amount;
end $$;
revoke all on function private.aqari_contract_due(jsonb,text) from public,anon,authenticated;

create or replace function private.aqari_rent_due_on(c jsonb,lease_start date,period date) returns date
language sql immutable set search_path='' as $$
 select case when c ? 'rentEntitlement' then
  case when period<date_trunc('month',(c#>>'{rentEntitlement,startDate}')::date)::date or period>date_trunc('month',(c->>'end_date')::date)::date then null
   else greatest(period,(c#>>'{rentEntitlement,startDate}')::date) end
  else greatest(period,lease_start) end
$$;
revoke all on function private.aqari_rent_due_on(jsonb,date,date) from public,anon,authenticated;

create or replace function private.aqari_rent_period_breakdown(c jsonb,period text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare net numeric;gross numeric;e jsonb:=c->'rentEntitlement';manual boolean;free_month boolean;
begin
 perform private.aqari_validate_rent_entitlement(c);net:=private.aqari_contract_due(c,period);
 manual:=e->>'firstPeriodPolicy'='manual_first_period' and period=left(e->>'startDate',7);
 free_month:=c->>'freeMonthApproved'='true' and c->>'freeMonthPeriod'=period;
 if not manual then gross:=private.aqari_contract_due(c||jsonb_build_object('rent',c->'contractRent','freeMonthApproved',false,'rentAdjustments','[]'::jsonb),period);end if;
 return jsonb_build_object('version',1,'period',period,'dueOn',private.aqari_rent_due_on(c,(c->>'start_date')::date,(period||'-01')::date),
  'policy',case when period=left(e->>'startDate',7) then e->>'firstPeriodPolicy' else 'full_month' end,
  'gross',gross,'discount',case when manual then null else gross-net end,'net',net,'manual',manual,'freeMonth',coalesce(free_month,false));
end $$;
revoke all on function private.aqari_rent_period_breakdown(jsonb,text) from public,anon,authenticated;

create or replace function private.aqari_validate_entitlement_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb:=private.aqari_unwrap(new.payload);old_d jsonb:=private.aqari_unwrap(old.payload);c jsonb;prev jsonb;lid uuid;changed boolean;r jsonb;receipt jsonb;
begin
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  select value into prev from jsonb_array_elements(coalesce(old_d->'contractsV202','[]')) where value->>'id'=c->>'id';
  if c is not distinct from prev then continue;end if;
  if not(c ? 'rentEntitlement') and not(coalesce(prev,'{}') ? 'rentEntitlement') then
   if prev is null and c->>'source'='v267-cloud' then raise exception 'حدد بداية الاستحقاق وسياسة أول فترة صراحة قبل حفظ العقد.';end if;
   continue;
  end if;
  if c->>'source' is distinct from 'v267-cloud' or c->>'rentalTermsVersion' is distinct from '1' then raise exception 'شروط الاستحقاق الجديدة تخص عقدًا جديدًا أو مسودة محفوظة قابلة للمراجعة.';end if;
  perform private.aqari_validate_rent_entitlement(c);
  changed:=prev is null or prev->'rentEntitlement' is distinct from c->'rentEntitlement'
   or prev->'start_date' is distinct from c->'start_date' or prev->'end_date' is distinct from c->'end_date';
  if not changed then continue;end if;
  if c->>'status' not in ('draft','ready') or (prev is not null and prev->>'status' not in ('draft','ready')) then raise exception 'بداية الاستحقاق وسياسة أول فترة ثابتتان بعد اعتماد العقد؛ أنشئ عقدًا جديدًا للتجديد.';end if;
  select id into lid from public.aqari_leases where workspace_id=new.workspace_id and external_ref=c->>'id';
  if exists(select 1 from private.aqari_contract_versions v where v.workspace_id=new.workspace_id and v.contract_ref=c->>'id' and v.after_snapshot->>'status' in ('approved','signing','signed','expired'))
   or exists(select 1 from public.aqari_rent_payments p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_cheques p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_commercial_sales p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_commercial_collections p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_deposit_entries p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_credit_allocations p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_tenant_adjustments p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from private.aqari_tenant_ledger_entries p where p.workspace_id=new.workspace_id and p.lease_id=lid)
   or exists(select 1 from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) p where p->>'contractId'=c->>'id') then
   raise exception 'لا يمكن تغيير الاستحقاق بعد اعتماد سابق أو حركة مالية محفوظة ولو ألغيت الحركة.';end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(d->'rentLedgerV202','[]')) loop
  if exists(select 1 from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) value where value->>'receiptNo'=r->>'receiptNo') then continue;end if;
  select value into c from jsonb_array_elements(coalesce(d->'contractsV202','[]')) where value->>'id'=r->>'contractId';
  if not(c ? 'rentEntitlement') then continue;end if;
  select value into receipt from jsonb_array_elements(coalesce(d->'rentReceiptsV267','[]')) where value->>'id'=r->>'receiptNo';
  if receipt->'rentPeriodBreakdown' is distinct from private.aqari_rent_period_breakdown(c,r->>'period')
   or receipt->'contract'->'rentEntitlement' is distinct from c->'rentEntitlement' then raise exception 'تفصيل استحقاق الوصل لا يطابق نسخة العقد والفترة المحفوظتين.';end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_validate_entitlement_state() from public,anon,authenticated;
drop trigger if exists aqari_zy_rent_entitlement on public.aqari_app_state;
create trigger aqari_zy_rent_entitlement before update of payload on public.aqari_app_state for each row execute function private.aqari_validate_entitlement_state();

-- Projection is AFTER app-state save. Direct table calls cannot install terms
-- outside that durable audited record, nor alter approved entitlement dates.
create or replace function private.aqari_validate_entitlement_lease() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb;previous jsonb:=case when tg_op='UPDATE' then old.snapshot else '{}'::jsonb end;
begin
 if not(new.snapshot ? 'rentEntitlement') and not(previous ? 'rentEntitlement') then return new;end if;
 perform private.aqari_validate_rent_entitlement(new.snapshot);
 if new.start_date is distinct from (new.snapshot->>'start_date')::date or new.end_date is distinct from (new.snapshot->>'end_date')::date then raise exception 'ENTITLEMENT_PROJECTION_DATE_MISMATCH';end if;
 if tg_op='UPDATE' and (old.snapshot->'rentEntitlement' is distinct from new.snapshot->'rentEntitlement' or old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date)
  and (old.status not in ('draft','ready') or new.status not in ('draft','ready')) then raise exception 'ENTITLEMENT_APPROVED_TERMS_IMMUTABLE';end if;
 select value into c from public.aqari_app_state s cross join lateral jsonb_array_elements(coalesce(private.aqari_unwrap(s.payload)->'contractsV202','[]')) where s.workspace_id=new.workspace_id and value->>'id'=new.external_ref;
 if c is null or c->'rentEntitlement' is distinct from new.snapshot->'rentEntitlement' or c->'start_date' is distinct from new.snapshot->'start_date' or c->'end_date' is distinct from new.snapshot->'end_date' then raise exception 'ENTITLEMENT_AUDITED_CONTRACT_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.aqari_validate_entitlement_lease() from public,anon,authenticated;
drop trigger if exists aqari_entitlement_lease on public.aqari_leases;
create trigger aqari_entitlement_lease before insert or update of snapshot,start_date,end_date on public.aqari_leases for each row execute function private.aqari_validate_entitlement_lease();

-- Preserve current reviewed consumers and their payment, cancellation, credit,
-- commercial and authorization rules. Stop on a changed source, never overwrite.
-- Exact current Production consumers; their financial predicates and grants are preserved.
CREATE OR REPLACE FUNCTION public.aqari_rent_due_schedule(p_workspace_id uuid, p_lease_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w uuid:=p_workspace_id;
begin
  if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_lease_id is not null and not private.aqari_can_lease(w,p_lease_id,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_lease_id is null and not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'periods',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lease_id',d.lease_id,'contract_no',l.contract_no,'period',d.period,
        'due_on',private.aqari_rent_due_on(l.snapshot,l.start_date,d.period),'due_amount',d.due_amount,'paid_amount',d.paid_amount,'credit_amount',d.credit_amount,
        'balance',d.balance,'status',d.status,'source_hash',d.source_hash
      ) order by d.period,d.lease_id)
      from private.aqari_rent_due_periods d
      join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
      where d.workspace_id=w and (p_lease_id is null or d.lease_id=p_lease_id)
        and private.aqari_can_lease(w,d.lease_id,'collections','read')
    ),'[]'::jsonb),
    'generated_from','signed lease terms + non-cancelled payments + allocated tenant credit'
  );
end $function$
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
  into due_total from generate_series(period_start,period_end,interval '1 month') p where not (l.snapshot ? 'rentEntitlement') or private.aqari_rent_due_on(l.snapshot,l.start_date,p::date)<=vdate;
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
CREATE OR REPLACE FUNCTION private.aqari_v267_prepare_reminders(w uuid, as_of date, grace_day integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare period_start date;window_start date;window_end date;inserted integer;max_grace integer;
begin
 if auth.uid() is null or not private.aqari_can(w,'notifications','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if grace_day is null or grace_day<1 or grace_day>27 or as_of is null then raise exception 'INVALID_REMINDER_WINDOW';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'WORKSPACE_REQUIRED';end if;
 perform private.aqari_reconcile_reminder_queue(w);
 period_start:=date_trunc('month',as_of)::date;
 if extract(day from as_of)>=28 then period_start:=(period_start+interval '1 month')::date;end if;
 window_start:=(period_start-interval '1 month')::date+27;
 select greatest(grace_day,coalesce(max(t.grace_days),grace_day)) into max_grace from private.aqari_commercial_terms t where t.workspace_id=w;
 window_end:=(period_start+interval '1 month - 1 day')::date+max_grace-1;
 if as_of<window_start or as_of>window_end or (as_of-window_start)%2<>0 then return 0;end if;
 insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,status,scheduled_at,idempotency_key)
 select w,l.id,period_start,'rent_reminder',ch.channel,'awaiting_configuration',(as_of::timestamp at time zone 'Asia/Kuwait'),'reminder:'||l.id::text||':'||period_start::text||':'||as_of::text||':'||ch.channel
 from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id and t.workspace_id=w
 cross join (values('email'::text),('whatsapp'::text)) ch(channel)
 where l.workspace_id=w and l.status='signed' and t.is_active and l.start_date<=(period_start+interval '1 month - 1 day')::date and l.end_date>=period_start
 and (not (l.snapshot ? 'rentEntitlement') or (l.snapshot#>>'{rentEntitlement,startDate}')::date<=as_of)
 and as_of<=(case when l.snapshot ? 'rentEntitlement' then private.aqari_rent_due_on(l.snapshot,l.start_date,period_start) else period_start end)+private.aqari_effective_grace_days(w,l.id,grace_day)-1
 and ((ch.channel='email' and nullif(btrim(t.email),'') is not null) or (ch.channel='whatsapp' and nullif(btrim(t.phone),'') is not null))
 and private.aqari_reminder_due(l.snapshot,l.monthly_rent,period_start)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=period_start),0)
 on conflict(workspace_id,idempotency_key) do nothing;
 get diagnostics inserted=row_count;return inserted;
end $function$
;
CREATE OR REPLACE FUNCTION private.aqari_reconcile_reminder_queue(w uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cancelled integer;
begin
 update public.aqari_notification_outbox o set status='cancelled'
 where o.workspace_id=w and o.kind='rent_reminder' and o.status in ('awaiting_configuration','queued')
 and not exists(select 1 from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id and t.workspace_id=w
  where l.id=o.lease_id and l.workspace_id=w and l.status='signed' and t.is_active
  and (not (l.snapshot ? 'rentEntitlement') or (l.snapshot#>>'{rentEntitlement,startDate}')::date<=(o.scheduled_at at time zone 'Asia/Kuwait')::date)
  and l.start_date<=(o.period+interval '1 month - 1 day')::date and l.end_date>=o.period
  and ((o.channel='email' and nullif(btrim(t.email),'') is not null) or (o.channel='whatsapp' and nullif(btrim(t.phone),'') is not null))
  and private.aqari_reminder_due(l.snapshot,l.monthly_rent,o.period)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=o.period),0));
 get diagnostics cancelled=row_count;return cancelled;
end $function$
;
-- Production has no official_statement or tenant_rating_evidence RPC; no unrelated service is installed.



-- SOURCE: contract-execution-settlement.sql
-- V267 isolated staging: atomic contract execution settlement.
-- A V267 contract may transition to signed only with one immutable execution
-- settlement in the same app-state transaction. Zero-due contracts record an
-- explicit reason and create no fake payment or rent receipt.

create table private.aqari_contract_execution_settlements(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 contract_ref text not null,
 contract_no text not null,
 on_date date not null,
 method text not null check(method in ('none','cash','knet','bank','cheque')),
 transaction_reference text not null default '',
 rent_amount numeric(15,3) not null check(rent_amount>=0),
 deposit_amount numeric(15,3) not null check(deposit_amount>=0),
 advance_amount numeric(15,3) not null check(advance_amount>=0),
 fees_amount numeric(15,3) not null check(fees_amount>=0),
 total_amount numeric(15,3) not null check(total_amount=rent_amount+deposit_amount+advance_amount+fees_amount),
 rent_receipt_no text not null default '',
 zero_reason text not null default '',
 contract_document_id uuid not null,
 created_by uuid not null,
 created_by_name text not null,
 created_at timestamptz not null default now(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 unique(workspace_id,id),
 unique(workspace_id,lease_id),
 unique(workspace_id,contract_document_id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 check((total_amount=0 and method='none' and transaction_reference='' and rent_receipt_no='' and length(btrim(zero_reason)) between 3 and 500)
    or (total_amount>0 and method<>'none' and length(btrim(transaction_reference)) between 3 and 150)),
 check((rent_amount=0 and rent_receipt_no='') or (rent_amount>0 and length(btrim(rent_receipt_no)) between 3 and 150))
);
create unique index aqari_contract_execution_transaction_unique
 on private.aqari_contract_execution_settlements(workspace_id,lower(transaction_reference))
 where total_amount>0;
create index aqari_contract_execution_contract_history
 on private.aqari_contract_execution_settlements(workspace_id,contract_ref,created_at,id);
alter table private.aqari_contract_execution_settlements enable row level security;
revoke all on private.aqari_contract_execution_settlements from public,anon,authenticated;
create trigger aqari_contract_execution_immutable before update or delete on private.aqari_contract_execution_settlements
 for each row execute function private.aqari_reject_immutable_change();

-- Preparation drafts follow contract permissions. Final execution manifests
-- follow collections permissions; the final signing guard below additionally
-- requires the general manager.
create or replace function private.aqari_state_section(k text) returns text
language sql immutable set search_path='' as $$
 select case
 when k in ('properties','units','propertyFilesV202','propertyBankAccountsV267') then 'properties'
 when k in ('tenants','tenantProfilesV267') then 'tenants'
 when k in ('leases','contractsV202','contractTemplatesV202','tenantDirectoryV202','contractPreparationDraftsV267') then 'contracts'
 when k in ('collections','rentLedgerV202','rentReceiptsV267','depositReceiptsV267','depositRefundsV267','contractExecutionSettlementsV267') then 'collections'
 when k in ('maintenance','maintenanceContracts','maintenanceRequestsV267') then 'maintenance'
 when k in ('expenses','services','invoices','accounts','bankAccounts','journalEntries','openingBalancesV267') then 'finance'
 when k in ('employees','payroll') then 'employees'
 when k in ('propertySharesV267','propertyPartnersV267','partnerDistributionsV267','partnerAdjustmentsV267','partnerReservesV267') then 'partners'
 when k in ('documents','documentsV267','documentArchiveV267') then 'documents'
 when k in ('notifications','reminders','notificationSettingsV267') then 'notifications'
 else 'administration' end
$$;

create function private.aqari_project_contract_execution() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb; old_c jsonb;
 settlement_id uuid; contract_id text; tenant_id text; document_id uuid; version_id uuid; event_id uuid;
 lease public.aqari_leases; payment public.aqari_rent_payments;
 rent_due numeric(15,3); rent_amount numeric(15,3); deposit_amount numeric(15,3); advance_amount numeric(15,3); fees_amount numeric(15,3); total_amount numeric(15,3);
 contract_deposit numeric(15,3); contract_advance numeric(15,3); contract_fees numeric(15,3); deposit_balance numeric(15,3);
 operation_date date; first_period date; method_code text; payment_method text; tx text; receipt_no text; zero_reason text;
 actor text; voucher_seq text; deposit_id uuid; property_id uuid; title text; body text; clauses text; payload jsonb; hash text; template_version integer;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb);
 new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then raise exception 'EXECUTION_SETTLEMENT_ARRAY_REQUIRED' using errcode='22023';end if;
 if jsonb_array_length(new_rows)>5000 then raise exception 'EXECUTION_SETTLEMENT_LIMIT' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(old_rows) o where not exists(select 1 from jsonb_array_elements(new_rows) n where n=o)) then
  raise exception 'EXECUTION_SETTLEMENT_IMMUTABLE' using errcode='23514';
 end if;
 if exists(select x->>'id' from jsonb_array_elements(new_rows) x group by x->>'id' having count(*)>1) then
  raise exception 'EXECUTION_SETTLEMENT_DUPLICATE_ID' using errcode='23505';
 end if;

 -- No V267 contract can newly become signed without a settlement created in
 -- this exact state revision.
 for c in select value from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) loop
  if c->>'source'='v267-cloud' and c->>'status'='signed' then
   select value into old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) where value->>'id'=c->>'id' limit 1;
   if coalesce(old_c->>'status','')<>'signed' and not exists(
    select 1 from jsonb_array_elements(new_rows) n
     where n->>'contractId'=c->>'id' and not exists(select 1 from jsonb_array_elements(old_rows) o where o=n)
   ) then raise exception 'EXECUTION_SETTLEMENT_REQUIRED_BEFORE_SIGNING' using errcode='23514';end if;
  end if;
 end loop;

 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  if not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='GENERAL_MANAGER_EXECUTION_APPROVAL_REQUIRED';end if;
  if jsonb_typeof(e)<>'object' or jsonb_typeof(e->'components')<>'object' then raise exception 'EXECUTION_SETTLEMENT_INVALID' using errcode='22023';end if;
  begin settlement_id:=(e->>'id')::uuid; document_id:=(e->>'contractDocumentId')::uuid; version_id:=(e->>'contractDocumentVersionId')::uuid; event_id:=(e->>'contractDocumentEventId')::uuid;
  exception when others then raise exception 'EXECUTION_SETTLEMENT_INVALID_ID' using errcode='22023';end;
  contract_id:=btrim(coalesce(e->>'contractId',''));tenant_id:=btrim(coalesce(e->>'tenantId',''));
  if contract_id='' or tenant_id='' or btrim(coalesce(e->>'contractNo',''))='' or btrim(coalesce(e->>'property',''))='' or btrim(coalesce(e->>'unit',''))='' then raise exception 'EXECUTION_SETTLEMENT_LINK_REQUIRED' using errcode='22023';end if;
  if (select count(*) from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=contract_id)<>1 then raise exception 'EXECUTION_CONTRACT_REQUIRED' using errcode='22023';end if;
  select value into c from jsonb_array_elements(new_d->'contractsV202') x where x->>'id'=contract_id;
  select value into old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) x where x->>'id'=contract_id limit 1;
  if c->>'source'<>'v267-cloud' or c->>'status'<>'signed' or coalesce(old_c->>'status','')<>'signing'
   or c->>'contract_no'<>e->>'contractNo' or c->>'tenantId'<>tenant_id or c->>'property'<>e->>'property' or c->>'unit'<>e->>'unit' then
   raise exception 'EXECUTION_CONTRACT_SIGNING_TRANSITION_REQUIRED' using errcode='23514';
  end if;
  select * into lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.external_ref=contract_id for update;
  if not found or lease.status<>'signed' or lease.contract_no<>e->>'contractNo' then raise exception 'EXECUTION_SIGNED_LEASE_REQUIRED' using errcode='23514';end if;

  if coalesce(e->>'onDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'EXECUTION_DATE_REQUIRED' using errcode='22023';end if;
  operation_date:=(e->>'onDate')::date;
  if operation_date>(now() at time zone 'Asia/Kuwait')::date then raise exception 'EXECUTION_FUTURE_DATE' using errcode='22023';end if;
  perform private.aqari_financial_open(new.workspace_id,operation_date);
  if coalesce(e#>>'{components,rent}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,deposit}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,advance}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,fees}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$'
   or coalesce(e#>>'{components,total}','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise exception 'EXECUTION_INVALID_AMOUNT' using errcode='22023';end if;
  rent_amount:=(e#>>'{components,rent}')::numeric;deposit_amount:=(e#>>'{components,deposit}')::numeric;advance_amount:=(e#>>'{components,advance}')::numeric;fees_amount:=(e#>>'{components,fees}')::numeric;total_amount:=(e#>>'{components,total}')::numeric;
  if total_amount<>rent_amount+deposit_amount+advance_amount+fees_amount then raise exception 'EXECUTION_TOTAL_MISMATCH' using errcode='23514';end if;
  contract_deposit:=coalesce(nullif(c->>'deposit','')::numeric,0);contract_advance:=coalesce(nullif(c->>'advance','')::numeric,0);contract_fees:=coalesce(nullif(c->>'cleaningFee','')::numeric,0);
  select coalesce(sum(case x.kind when 'receipt' then x.amount else -x.amount end),0)::numeric(15,3) into deposit_balance from private.aqari_deposit_entries x where x.workspace_id=new.workspace_id and x.lease_id=lease.id;
  if deposit_amount<>greatest(contract_deposit-deposit_balance,0) or advance_amount<>contract_advance or fees_amount<>contract_fees then raise exception 'EXECUTION_COMPONENT_MISMATCH' using errcode='23514';end if;
  if coalesce(c#>>'{rentEntitlement,startDate}','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'EXECUTION_ENTITLEMENT_REQUIRED' using errcode='23514';end if;
  first_period:=date_trunc('month',(c#>>'{rentEntitlement,startDate}')::date)::date;
  select greatest(d.due_amount-coalesce(d.credit_amount,0),0)::numeric(15,3) into rent_due from private.aqari_rent_due_periods d where d.workspace_id=new.workspace_id and d.lease_id=lease.id and d.period=first_period;
  if rent_due is null then raise exception 'EXECUTION_DUE_SCHEDULE_REQUIRED' using errcode='23514';end if;
  if rent_amount<>rent_due then raise exception 'EXECUTION_FIRST_RENT_MISMATCH' using errcode='23514';end if;

  method_code:=btrim(coalesce(e->>'method',''));tx:=btrim(coalesce(e->>'transactionNo',''));receipt_no:=btrim(coalesce(e->>'rentReceiptNo',''));zero_reason:=btrim(coalesce(e->>'zeroReason',''));
  if total_amount=0 then
   if method_code<>'none' or tx<>'' or receipt_no<>'' or length(zero_reason) not between 3 and 500 then raise exception 'EXECUTION_ZERO_DOCUMENTATION_REQUIRED' using errcode='23514';end if;
  else
   if method_code not in ('cash','knet','bank','cheque') or length(tx) not between 3 and 150 then raise exception 'EXECUTION_PAYMENT_REFERENCE_REQUIRED' using errcode='23514';end if;
  end if;
  payment_method:=case method_code when 'cash' then 'نقدي' when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cheque' then 'شيك' else '' end;
  if rent_amount>0 then
   if receipt_no='' then raise exception 'EXECUTION_RENT_RECEIPT_REQUIRED' using errcode='23514';end if;
   select * into payment from public.aqari_rent_payments p where p.workspace_id=new.workspace_id and p.reference=receipt_no;
   if not found or payment.lease_id<>lease.id or payment.amount<>rent_amount or payment.paid_at<>operation_date or payment.payment_method<>payment_method or coalesce(payment.record->>'transactionNo','')<>tx then raise exception 'EXECUTION_RENT_PAYMENT_MISMATCH' using errcode='23514';end if;
   if exists(select 1 from private.aqari_rent_due_periods d where d.workspace_id=new.workspace_id and d.lease_id=lease.id and d.period=first_period and d.balance<>0) then raise exception 'EXECUTION_FIRST_RENT_NOT_SETTLED' using errcode='23514';end if;
  elsif receipt_no<>'' then raise exception 'EXECUTION_FAKE_RENT_RECEIPT' using errcode='23514';end if;

  select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
  if deposit_amount>0 then
   deposit_id:=extensions.gen_random_uuid();voucher_seq:=nextval('private.aqari_deposit_voucher_seq')::text;
   insert into private.aqari_deposit_entries(id,workspace_id,lease_id,kind,voucher_no,amount,on_date,method,reference,reason,actor_id,actor_name,snapshot,balance_after,request_data)
   values(deposit_id,new.workspace_id,lease.id,'receipt','DP-'||to_char(operation_date,'YYYYMMDD')||'-'||lpad(voucher_seq,8,'0'),deposit_amount,operation_date,method_code,tx,'تأمين عند إبرام العقد',auth.uid(),actor,
    jsonb_build_object('lease_id',lease.id,'contract_no',lease.contract_no,'tenant_id',lease.tenant_id,'property',e->>'property','unit',e->>'unit','execution_settlement_id',settlement_id),
    deposit_balance+deposit_amount,jsonb_build_object('settlement_id',settlement_id,'transaction_reference',tx,'amount',deposit_amount::text));
  end if;

  clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality) from jsonb_array_elements(coalesce(c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
  if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
  title:='عقد إيجار '||(c->>'contract_no');
  body:='عقد إيجار رقم '||(c->>'contract_no')||E'\nالمستأجر: '||coalesce(c->>'tenant','')||E'\nالعقار: '||(c->>'property')||' — الوحدة: '||(c->>'unit')||E'\nمدة العقد: '||(c->>'start_date')||' إلى '||(c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(c->>'contractRent',c->>'rent')||' د.ك — الخصم: '||coalesce(c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(c->>'deposit','0')||' د.ك — العربون: '||coalesce(c->>'advance','0')||' د.ك — الرسوم: '||coalesce(c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
  payload:=jsonb_build_object('contractNo',c->>'contract_no','tenant',c->>'tenant','property',c->>'property','unit',c->>'unit','startDate',c->>'start_date','endDate',c->>'end_date','contractRent',c->>'contractRent','discount',c->>'discount','deposit',c->>'deposit','advance',c->>'advance','fees',c->>'cleaningFee','template',c->'contractTemplate','executionSettlementId',settlement_id,'contractSnapshot',c);
  hash:=pg_catalog.encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex');
  template_version:=coalesce(nullif(c#>>'{contractTemplate,version}','')::integer,1);
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(document_id,new.workspace_id,'CT-'||(c->>'contract_no'),'rental_contract',lease.id,auth.uid());
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values(document_id,new.workspace_id,'rental_contract','CT-'||(c->>'contract_no'),'lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
   values(version_id,new.workspace_id,document_id,1,template_version,title,body,payload,hash,auth.uid(),actor);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values(event_id,new.workspace_id,document_id,'issue','إصدار تلقائي بعد اعتماد تسوية إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',hash,'execution_settlement_id',settlement_id));

  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_contract_execution_settlements(id,workspace_id,lease_id,contract_ref,contract_no,on_date,method,transaction_reference,rent_amount,deposit_amount,advance_amount,fees_amount,total_amount,rent_receipt_no,zero_reason,contract_document_id,created_by,created_by_name,snapshot)
   values(settlement_id,new.workspace_id,lease.id,contract_id,lease.contract_no,operation_date,method_code,tx,rent_amount,deposit_amount,advance_amount,fees_amount,total_amount,receipt_no,zero_reason,document_id,auth.uid(),actor,e);
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement_id::text,'contract_execution_confirmed',auth.uid(),actor,case when total_amount=0 then zero_reason else 'تسوية إبرام عقد مع مرجع حركة '||tx end,e);
 end loop;
 return null;
end $$;
revoke all on function private.aqari_project_contract_execution() from public,anon,authenticated;
create trigger zzz_v267_contract_execution after update of payload on public.aqari_app_state
 for each row execute function private.aqari_project_contract_execution();


-- SOURCE: contract-execution-finalization-v2.sql (artifact section only)
create table if not exists private.aqari_contract_execution_artifacts(
 settlement_id uuid primary key references private.aqari_contract_execution_settlements(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 contract_ref text not null,
 contract_no text not null,
 tenant_document_id uuid not null,
 owner_document_id uuid not null,
 rent_receipt_no text not null default '',
 contract_receipt_sequence integer,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,tenant_document_id),
 unique(workspace_id,owner_document_id),
 check((rent_receipt_no='' and contract_receipt_sequence is null) or (rent_receipt_no<>'' and contract_receipt_sequence>0))
);
alter table private.aqari_contract_execution_artifacts enable row level security;
revoke all on private.aqari_contract_execution_artifacts from public,anon,authenticated;
create trigger aqari_contract_execution_artifacts_immutable
 before update or delete on private.aqari_contract_execution_artifacts
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_project_contract_execution_artifacts() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb;
 settlement private.aqari_contract_execution_settlements%rowtype;
 lease public.aqari_leases%rowtype;
 reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 canonical_title text; canonical_body text; canonical_payload jsonb; canonical_template integer;
 tenant_id uuid; tenant_version uuid; tenant_event uuid; owner_id uuid; owner_version uuid; owner_event uuid;
 tenant_title text; tenant_body text; tenant_payload jsonb; tenant_hash text;
 owner_title text; owner_body text; owner_payload jsonb; owner_hash text;
 receipt_sequence integer; property_id uuid;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb);
 new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then return null;end if;

 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  select * into strict settlement from private.aqari_contract_execution_settlements s
   where s.workspace_id=new.workspace_id and s.id=(e->>'id')::uuid;
  select * into strict lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=settlement.lease_id;
  select value into strict c from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;

  if settlement.contract_no is distinct from lease.contract_no or c->>'contract_no' is distinct from settlement.contract_no then
   raise exception 'CONTRACT_SERIAL_MISMATCH' using errcode='23514';
  end if;
  update private.aqari_contract_serial_reservations r set consumed_at=coalesce(r.consumed_at,now())
   where r.workspace_id=new.workspace_id and r.contract_ref=settlement.contract_ref and r.contract_no=settlement.contract_no;

  if settlement.rent_amount>0 then
   receipt_sequence:=nullif(e->>'contractReceiptSequence','')::integer;
   select * into strict reservation from private.aqari_rent_receipt_serial_reservations r
    where r.receipt_no=settlement.rent_receipt_no and r.operation_ref=settlement.id;
   if reservation.workspace_id<>new.workspace_id or reservation.contract_ref<>settlement.contract_ref
      or reservation.contract_sequence<>receipt_sequence or reservation.consumed_at is not null then
    raise exception 'RECEIPT_SERIAL_RESERVATION_MISMATCH' using errcode='23514';
   end if;
   update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=reservation.receipt_no;
  else
   if coalesce(e->>'contractReceiptSequence','')<>'' then raise exception 'ZERO_RENT_RECEIPT_SEQUENCE_FORBIDDEN' using errcode='23514';end if;
   receipt_sequence:=null;
  end if;

  select v.title,v.body,v.payload,v.template_version
   into strict canonical_title,canonical_body,canonical_payload,canonical_template
  from private.aqari_official_document_series s
  join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id and v.version=1
  where s.workspace_id=new.workspace_id and s.id=settlement.contract_document_id and s.status='issued';

  tenant_id:=extensions.gen_random_uuid();tenant_version:=extensions.gen_random_uuid();tenant_event:=extensions.gen_random_uuid();
  owner_id:=extensions.gen_random_uuid();owner_version:=extensions.gen_random_uuid();owner_event:=extensions.gen_random_uuid();
  tenant_title:=canonical_title||' — نسخة المستأجر';tenant_body:='نسخة المستأجر'||E'\n'||canonical_body;
  tenant_payload:=canonical_payload||jsonb_build_object('copyRole','tenant','copyLabelAr','نسخة المستأجر','canonicalSeriesId',settlement.contract_document_id,'contractNo',settlement.contract_no);
  tenant_hash:=pg_catalog.encode(extensions.digest(tenant_title||E'\n'||tenant_body||E'\n'||tenant_payload::text,'sha256'),'hex');
  owner_title:=canonical_title||' — نسخة المالك / الإدارة';owner_body:='نسخة المالك / الإدارة'||E'\n'||canonical_body;
  owner_payload:=canonical_payload||jsonb_build_object('copyRole','owner','copyLabelAr','نسخة المالك / الإدارة','canonicalSeriesId',settlement.contract_document_id,'contractNo',settlement.contract_no);
  owner_hash:=pg_catalog.encode(extensions.digest(owner_title||E'\n'||owner_body||E'\n'||owner_payload::text,'sha256'),'hex');

  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values
    (tenant_id,new.workspace_id,'rental_contract','CT-'||settlement.contract_no||'-TENANT','lease',lease.id,'issued',1,auth.uid()),
    (owner_id,new.workspace_id,'rental_contract','CT-'||settlement.contract_no||'-OWNER','lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
   values
    (tenant_version,new.workspace_id,tenant_id,1,canonical_template,tenant_title,tenant_body,tenant_payload,tenant_hash,auth.uid(),settlement.created_by_name),
    (owner_version,new.workspace_id,owner_id,1,canonical_template,owner_title,owner_body,owner_payload,owner_hash,auth.uid(),settlement.created_by_name);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values
    (tenant_event,new.workspace_id,tenant_id,'issue','نسخة المستأجر التلقائية بعد اعتماد العقد',auth.uid(),jsonb_build_object('version',1,'hash',tenant_hash,'execution_settlement_id',settlement.id)),
    (owner_event,new.workspace_id,owner_id,'issue','نسخة المالك / الإدارة التلقائية بعد اعتماد العقد',auth.uid(),jsonb_build_object('version',1,'hash',owner_hash,'execution_settlement_id',settlement.id));

  insert into private.aqari_contract_execution_artifacts(settlement_id,workspace_id,lease_id,contract_ref,contract_no,tenant_document_id,owner_document_id,rent_receipt_no,contract_receipt_sequence,created_by)
   values(settlement.id,new.workspace_id,lease.id,settlement.contract_ref,settlement.contract_no,tenant_id,owner_id,settlement.rent_receipt_no,receipt_sequence,auth.uid());

  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement.id::text,'contract_execution_artifacts_issued',auth.uid(),settlement.created_by_name,'إصدار نسختي العقد وربط تسلسل الوصل',jsonb_build_object('contract_no',settlement.contract_no,'tenant_document_id',tenant_id,'owner_document_id',owner_id,'rent_receipt_no',settlement.rent_receipt_no,'contract_receipt_sequence',receipt_sequence));
 end loop;
 return null;
end $$;
revoke all on function private.aqari_project_contract_execution_artifacts() from public,anon,authenticated;
drop trigger if exists zzzz_v267_contract_execution_artifacts on public.aqari_app_state;
create trigger zzzz_v267_contract_execution_artifacts
 after update of payload on public.aqari_app_state
 for each row execute function private.aqari_project_contract_execution_artifacts();

create or replace function public.aqari_contract_execution_artifacts(p_workspace_id uuid,p_contract_ref text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.aqari_can(p_workspace_id,'contracts','read') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select jsonb_build_object(
  'settlement_id',a.settlement_id,
  'contract_no',a.contract_no,
  'tenant_document_id',a.tenant_document_id,
  'owner_document_id',a.owner_document_id,
  'rent_receipt_no',a.rent_receipt_no,
  'contract_receipt_sequence',a.contract_receipt_sequence,
  'created_at',a.created_at
 ) into result
 from private.aqari_contract_execution_artifacts a
 where a.workspace_id=p_workspace_id and a.contract_ref=p_contract_ref;
 if result is null then raise exception 'CONTRACT_EXECUTION_ARTIFACTS_NOT_FOUND' using errcode='P0002';end if;
 return result;
end $$;
revoke all on function public.aqari_contract_execution_artifacts(uuid,text) from public,anon;
grant execute on function public.aqari_contract_execution_artifacts(uuid,text) to authenticated;


-- SOURCE: official-document-pdf-archive.sql
-- Original PDF bytes, append-only and bound to an immutable document version.
-- Apply after official-document-access-hardening.sql. No hosted target is selected here.

create table private.aqari_official_pdf_artifacts (
 workspace_id uuid not null,
 series_id uuid not null,
 version integer not null,
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 8 and 2097152),
 pdf_sha256 text not null check(pdf_sha256 = encode(sha256(pdf_bytes),'hex')),
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 archived_by uuid not null,
 archived_at timestamptz not null default now(),
 primary key(workspace_id,series_id,version),
 foreign key(workspace_id,series_id,version) references private.aqari_official_document_versions(workspace_id,series_id,version)
);
alter table private.aqari_official_pdf_artifacts enable row level security;
revoke all on private.aqari_official_pdf_artifacts from public,anon,authenticated,service_role;
create trigger aqari_official_pdf_immutable before update or delete on private.aqari_official_pdf_artifacts
 for each row execute function private.aqari_reject_immutable_change();

create function public.aqari_official_pdf_get(p_workspace_id uuid,p_document_id uuid,p_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare doc jsonb; artifact private.aqari_official_pdf_artifacts;
begin
 doc:=public.aqari_official_document_register(p_workspace_id,'get',jsonb_build_object('id',p_document_id));
 if doc='{}'::jsonb then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_version is null or not exists(select 1 from jsonb_array_elements(doc->'versions') v where (v->>'version')::integer=p_version)then
  raise exception 'DOCUMENT_VERSION_NOT_FOUND' using errcode='P0002';
 end if;
 select * into artifact from private.aqari_official_pdf_artifacts where workspace_id=p_workspace_id and series_id=p_document_id and version=p_version;
 if not found then return '{}'::jsonb;end if;
 return (to_jsonb(artifact)-'pdf_bytes')||jsonb_build_object('pdf_base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),'document_status',doc#>>'{series,status}');
end $$;
revoke all on function public.aqari_official_pdf_get(uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.aqari_official_pdf_get(uuid,uuid,integer) to authenticated;

-- Browser JWTs cannot supply arbitrary PDF bytes. Only the trusted backend can
-- commit output, and it must identify the authenticated requester. User scope is
-- checked again in this transaction, not inferred from possession of a service key.
create function public.aqari_official_pdf_commit(
 p_workspace_id uuid,p_document_id uuid,p_version integer,p_actor_id uuid,
 p_snapshot_sha256 text,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);
 doc jsonb; snapshot jsonb; bytes bytea; existing private.aqari_official_pdf_artifacts;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_actor_id is null then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 if p_pdf_base64 is null or length(p_pdf_base64)>2796204 or p_pdf_sha256 is null or p_snapshot_sha256 is null
  or p_pdf_sha256!~'^[a-f0-9]{64}$' or p_snapshot_sha256!~'^[a-f0-9]{64}$'
  or p_renderer_version is null or length(p_renderer_version) not between 1 and 100 then
  raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';
 end if;
 -- Lock the series to serialize first writers with corrections and voiding.
 perform 1 from private.aqari_official_document_series where workspace_id=p_workspace_id and id=p_document_id for update;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 doc:=public.aqari_official_document_register(p_workspace_id,'get',jsonb_build_object('id',p_document_id));
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if doc='{}'::jsonb then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select v into snapshot from jsonb_array_elements(doc->'versions') v where (v->>'version')::integer=p_version;
 if snapshot is null or snapshot->>'content_sha256' is distinct from p_snapshot_sha256 then
  raise exception 'PDF_SNAPSHOT_MISMATCH' using errcode='23514';
 end if;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8')
  or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';end if;
 select * into existing from private.aqari_official_pdf_artifacts where workspace_id=p_workspace_id and series_id=p_document_id and version=p_version;
 if found then
  if existing.pdf_sha256<>p_pdf_sha256 or existing.snapshot_sha256<>p_snapshot_sha256 then raise exception 'PDF_ARCHIVE_CONFLICT' using errcode='23505';end if;
  return jsonb_build_object('archived',true,'replayed',true,'pdf_sha256',existing.pdf_sha256);
 end if;
 if doc#>>'{series,status}'<>'issued' then raise exception 'VOID_DOCUMENT_ORIGINAL_UNAVAILABLE' using errcode='23514';end if;
 insert into private.aqari_official_pdf_artifacts(workspace_id,series_id,version,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
 values(p_workspace_id,p_document_id,p_version,p_snapshot_sha256,bytes,p_pdf_sha256,p_renderer_version,p_actor_id);
 insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
 values(gen_random_uuid(),p_workspace_id,p_document_id,'pdf_export','حفظ النسخة الأصلية من ملف PDF',p_actor_id,jsonb_build_object('version',p_version,'pdf_sha256',p_pdf_sha256,'snapshot_sha256',p_snapshot_sha256,'renderer',p_renderer_version));
 return jsonb_build_object('archived',true,'replayed',false,'pdf_sha256',p_pdf_sha256);
end $$;
revoke all on function public.aqari_official_pdf_commit(uuid,uuid,integer,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_official_pdf_commit(uuid,uuid,integer,uuid,text,text,text,text) to service_role;


-- SOURCE: contract-execution-package-atomic.sql
-- AQARI V267 isolated trial: prepare immutable execution PDFs before signing,
-- then consume the exact package inside the same app-state transaction that
-- signs the contract, records payment, updates dues and creates official docs.

create table if not exists private.aqari_contract_execution_packages(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 settlement_id uuid not null unique,
 contract_ref text not null,
 contract_no text not null,
 actor_id uuid not null,
 prepared_at timestamptz not null,
 expires_at timestamptz not null,
 source jsonb not null check(jsonb_typeof(source)='object'),
 receipt_artifacts jsonb,
 tenant_pdf_bytes bytea not null check(octet_length(tenant_pdf_bytes) between 8 and 2097152),
 tenant_pdf_sha256 text not null check(tenant_pdf_sha256=encode(sha256(tenant_pdf_bytes),'hex')),
 owner_pdf_bytes bytea not null check(octet_length(owner_pdf_bytes) between 8 and 2097152),
 owner_pdf_sha256 text not null check(owner_pdf_sha256=encode(sha256(owner_pdf_bytes),'hex')),
 receipt_pdf_bytes bytea,
 receipt_pdf_sha256 text,
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 created_at timestamptz not null default now(),
 unique(workspace_id,id),
 unique(workspace_id,settlement_id),
 check(expires_at>prepared_at and expires_at<=prepared_at+interval '30 minutes'),
 check((receipt_pdf_bytes is null and receipt_pdf_sha256 is null and receipt_artifacts is null)
    or (receipt_pdf_bytes is not null and octet_length(receipt_pdf_bytes) between 8 and 2097152
        and receipt_pdf_sha256=encode(sha256(receipt_pdf_bytes),'hex') and jsonb_typeof(receipt_artifacts)='object'))
);
alter table private.aqari_contract_execution_packages enable row level security;
revoke all on private.aqari_contract_execution_packages from public,anon,authenticated,service_role;
create trigger aqari_contract_execution_package_immutable
 before update or delete on private.aqari_contract_execution_packages
 for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_contract_execution_package_consumptions(
 package_id uuid primary key references private.aqari_contract_execution_packages(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 settlement_id uuid not null unique,
 consumed_by uuid not null,
 consumed_at timestamptz not null default now(),
 unique(workspace_id,settlement_id)
);
alter table private.aqari_contract_execution_package_consumptions enable row level security;
revoke all on private.aqari_contract_execution_package_consumptions from public,anon,authenticated,service_role;
create trigger aqari_contract_execution_package_consumption_immutable
 before update or delete on private.aqari_contract_execution_package_consumptions
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_contract_execution_package_source(
 p_workspace_id uuid,
 p_contract_ref text,
 p_settlement_id uuid,
 p_contract_document_id uuid,
 p_prepared_at timestamptz,
 p_receipt_no text default '',
 p_contract_receipt_sequence integer default null
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 data jsonb; c jsonb; signed_c jsonb; lease public.aqari_leases%rowtype;
 reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 actor text; first_period date; due_on date; entitlement_due numeric(15,3); credit_amount numeric(15,3); rent_payable numeric(15,3);
 contract_deposit numeric(15,3); deposit_balance numeric(15,3); deposit_due numeric(15,3); advance_due numeric(15,3); fees_due numeric(15,3); total_due numeric(15,3);
 clauses text; canonical_title text; canonical_body text; canonical_payload jsonb; canonical_hash text; template_version integer;
 tenant_title text; tenant_body text; tenant_payload jsonb; tenant_hash text;
 owner_title text; owner_body text; owner_payload jsonb; owner_hash text;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id)
   or not private.aqari_can(p_workspace_id,'contracts','write')
   or not private.aqari_can(p_workspace_id,'collections','write') then
  raise insufficient_privilege using message='GENERAL_MANAGER_EXECUTION_APPROVAL_REQUIRED';
 end if;
 if p_settlement_id is null or p_contract_document_id is null or btrim(coalesce(p_contract_ref,''))=''
   or length(p_contract_ref)>200 or p_contract_ref ~ '[[:cntrl:]]'
   or p_prepared_at < now()-interval '10 minutes' or p_prepared_at > now()+interval '1 minute' then
  raise exception 'EXECUTION_PACKAGE_INVALID_REQUEST' using errcode='22023';
 end if;
 select private.aqari_unwrap(s.payload) into data from public.aqari_app_state s where s.workspace_id=p_workspace_id;
 if data is null then raise exception 'EXECUTION_PACKAGE_STATE_REQUIRED' using errcode='P0002';end if;
 if (select count(*) from jsonb_array_elements(coalesce(data->'contractsV202','[]'::jsonb)) x where x->>'id'=p_contract_ref)<>1 then
  raise exception 'EXECUTION_PACKAGE_CONTRACT_REQUIRED' using errcode='P0002';
 end if;
 select value into c from jsonb_array_elements(data->'contractsV202') x where x->>'id'=p_contract_ref;
 if c->>'source'<>'v267-cloud' or c->>'status'<>'signing' or btrim(coalesce(c->>'contract_no',''))='' then
  raise exception 'EXECUTION_PACKAGE_SIGNING_REQUIRED' using errcode='23514';
 end if;
 select * into lease from public.aqari_leases l where l.workspace_id=p_workspace_id and l.external_ref=p_contract_ref;
 if not found or lease.status<>'signing' or lease.contract_no<>c->>'contract_no'
   or not private.aqari_can_lease(p_workspace_id,lease.id,'collections','write') then
  raise exception 'EXECUTION_PACKAGE_LEASE_REQUIRED' using errcode='23514';
 end if;
 if coalesce(c#>>'{rentEntitlement,startDate}','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'EXECUTION_PACKAGE_ENTITLEMENT_REQUIRED' using errcode='23514';
 end if;
 first_period:=date_trunc('month',(c#>>'{rentEntitlement,startDate}')::date)::date;
 -- Signing leases intentionally have no posted due schedule yet. Use the same
 -- authoritative calculation as schedule projection without posting a due early.
 entitlement_due:=private.aqari_reminder_due(lease.snapshot,lease.monthly_rent,first_period);
 due_on:=private.aqari_rent_due_on(lease.snapshot,lease.start_date,first_period);
 select coalesce(sum(a.amount),0)::numeric(15,3) into credit_amount
 from private.aqari_credit_allocations a
 where a.workspace_id=p_workspace_id and a.lease_id=lease.id and a.period=first_period;
 if entitlement_due is null or entitlement_due<0 or due_on is null then
  raise exception 'EXECUTION_PACKAGE_DUE_REQUIRED' using errcode='23514';
 end if;
 rent_payable:=greatest(entitlement_due-coalesce(credit_amount,0),0)::numeric(15,3);
 contract_deposit:=coalesce(nullif(c->>'deposit','')::numeric,0);
 select coalesce(sum(case x.kind when 'receipt' then x.amount else -x.amount end),0)::numeric(15,3)
 into deposit_balance from private.aqari_deposit_entries x where x.workspace_id=p_workspace_id and x.lease_id=lease.id;
 deposit_due:=greatest(contract_deposit-deposit_balance,0)::numeric(15,3);
 advance_due:=coalesce(nullif(c->>'advance','')::numeric,0)::numeric(15,3);
 fees_due:=coalesce(nullif(c->>'cleaningFee','')::numeric,0)::numeric(15,3);
 total_due:=(rent_payable+deposit_due+advance_due+fees_due)::numeric(15,3);
 if rent_payable>0 then
  select * into reservation from private.aqari_rent_receipt_serial_reservations r
   where r.receipt_no=btrim(coalesce(p_receipt_no,'')) and r.operation_ref=p_settlement_id;
  if not found or reservation.workspace_id<>p_workspace_id or reservation.contract_ref<>p_contract_ref
     or reservation.contract_sequence is distinct from p_contract_receipt_sequence or reservation.consumed_at is not null then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_RESERVATION_REQUIRED' using errcode='23514';
  end if;
 else
  if btrim(coalesce(p_receipt_no,''))<>'' or p_contract_receipt_sequence is not null then
   raise exception 'EXECUTION_PACKAGE_FAKE_RECEIPT' using errcode='23514';
  end if;
 end if;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);
 signed_c:=c||jsonb_build_object('status','signed','changeReason','اعتماد تسوية الإبرام وإتمام توقيع العقد');
 clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality)
   from jsonb_array_elements(coalesce(signed_c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
 if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_PACKAGE_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
 canonical_title:='عقد إيجار '||(signed_c->>'contract_no');
 canonical_body:='عقد إيجار رقم '||(signed_c->>'contract_no')||E'\nالمستأجر: '||coalesce(signed_c->>'tenant','')||E'\nالعقار: '||(signed_c->>'property')||' — الوحدة: '||(signed_c->>'unit')||E'\nمدة العقد: '||(signed_c->>'start_date')||' إلى '||(signed_c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(signed_c->>'contractRent',signed_c->>'rent')||' د.ك — الخصم: '||coalesce(signed_c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(signed_c->>'deposit','0')||' د.ك — العربون: '||coalesce(signed_c->>'advance','0')||' د.ك — الرسوم: '||coalesce(signed_c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
 canonical_payload:=jsonb_build_object('contractNo',signed_c->>'contract_no','tenant',signed_c->>'tenant','property',signed_c->>'property','unit',signed_c->>'unit','startDate',signed_c->>'start_date','endDate',signed_c->>'end_date','contractRent',signed_c->>'contractRent','discount',signed_c->>'discount','deposit',signed_c->>'deposit','advance',signed_c->>'advance','fees',signed_c->>'cleaningFee','template',signed_c->'contractTemplate','executionSettlementId',p_settlement_id,'contractSnapshot',signed_c);
 canonical_hash:=encode(extensions.digest(canonical_title||E'\n'||canonical_body||E'\n'||canonical_payload::text,'sha256'),'hex');
 template_version:=coalesce(nullif(signed_c#>>'{contractTemplate,version}','')::integer,1);
 tenant_title:=canonical_title||' — نسخة المستأجر'; tenant_body:='نسخة المستأجر'||E'\n'||canonical_body;
 tenant_payload:=canonical_payload||jsonb_build_object('copyRole','tenant','copyLabelAr','نسخة المستأجر','canonicalSeriesId',p_contract_document_id,'contractNo',signed_c->>'contract_no');
 tenant_hash:=encode(extensions.digest(tenant_title||E'\n'||tenant_body||E'\n'||tenant_payload::text,'sha256'),'hex');
 owner_title:=canonical_title||' — نسخة المالك / الإدارة'; owner_body:='نسخة المالك / الإدارة'||E'\n'||canonical_body;
 owner_payload:=canonical_payload||jsonb_build_object('copyRole','owner','copyLabelAr','نسخة المالك / الإدارة','canonicalSeriesId',p_contract_document_id,'contractNo',signed_c->>'contract_no');
 owner_hash:=encode(extensions.digest(owner_title||E'\n'||owner_body||E'\n'||owner_payload::text,'sha256'),'hex');
 return jsonb_build_object(
  'workspace_id',p_workspace_id,'contract_ref',p_contract_ref,'contract_no',signed_c->>'contract_no','lease_id',lease.id,
  'settlement_id',p_settlement_id,'contract_document_id',p_contract_document_id,'prepared_at',p_prepared_at,'actor_id',auth.uid(),'actor_name',actor,
  'pre_contract_snapshot',c,'signed_contract_snapshot',signed_c,
  'first_period',first_period,'due_on',due_on,'entitlement_due',entitlement_due,'credit_amount',coalesce(credit_amount,0),
  'amounts',jsonb_build_object('rent',rent_payable,'deposit',deposit_due,'advance',advance_due,'fees',fees_due,'total',total_due),
  'receipt_no',btrim(coalesce(p_receipt_no,'')),'contract_receipt_sequence',p_contract_receipt_sequence,
  'tenant_document',jsonb_build_object('document_no','CT-'||(signed_c->>'contract_no')||'-TENANT','title',tenant_title,'body',tenant_body,'payload',tenant_payload,'content_sha256',tenant_hash,'template_version',template_version,'issued_at',p_prepared_at,'issued_by_name',actor),
  'owner_document',jsonb_build_object('document_no','CT-'||(signed_c->>'contract_no')||'-OWNER','title',owner_title,'body',owner_body,'payload',owner_payload,'content_sha256',owner_hash,'template_version',template_version,'issued_at',p_prepared_at,'issued_by_name',actor),
  'canonical_content_sha256',canonical_hash
 );
end $$;
revoke all on function private.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) from public,anon,authenticated,service_role;

create or replace function public.aqari_contract_execution_package_source(
 p_workspace_id uuid,p_contract_ref text,p_settlement_id uuid,p_contract_document_id uuid,p_prepared_at timestamptz,p_receipt_no text default '',p_contract_receipt_sequence integer default null
) returns jsonb
language sql volatile security definer set search_path='' as $$
 select private.aqari_contract_execution_package_source(p_workspace_id,p_contract_ref,p_settlement_id,p_contract_document_id,p_prepared_at,p_receipt_no,p_contract_receipt_sequence)
$$;
revoke all on function public.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) from public,anon;
grant execute on function public.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) to authenticated;

create or replace function public.aqari_contract_execution_package_commit(
 p_package_id uuid,p_actor_id uuid,p_source jsonb,p_receipt_artifacts jsonb,
 p_tenant_pdf_base64 text,p_tenant_pdf_sha256 text,p_owner_pdf_base64 text,p_owner_pdf_sha256 text,
 p_receipt_pdf_base64 text default null,p_receipt_pdf_sha256 text default null,p_renderer_version text default 'v267-contract-execution-package-1'
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 old_sub text:=current_setting('request.jwt.claim.sub',true); old_claims text:=current_setting('request.jwt.claims',true);
 current_source jsonb; tenant_bytes bytea; owner_bytes bytea; receipt_bytes bytea; existing private.aqari_contract_execution_packages%rowtype;
 w uuid; settlement uuid; contract_doc uuid; prepared timestamptz; receipt_no text; receipt_seq integer; rent_amount numeric; receipt jsonb; record jsonb; ledger jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_package_id is null or p_actor_id is null or jsonb_typeof(p_source) is distinct from 'object' then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 begin
  w:=(p_source->>'workspace_id')::uuid; settlement:=(p_source->>'settlement_id')::uuid; contract_doc:=(p_source->>'contract_document_id')::uuid; prepared:=(p_source->>'prepared_at')::timestamptz;
 exception when others then raise exception 'EXECUTION_PACKAGE_INVALID_SOURCE' using errcode='22023'; end;
 receipt_no:=btrim(coalesce(p_source->>'receipt_no','')); receipt_seq:=nullif(p_source->>'contract_receipt_sequence','')::integer;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 current_source:=private.aqari_contract_execution_package_source(w,p_source->>'contract_ref',settlement,contract_doc,prepared,receipt_no,receipt_seq);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if current_source is distinct from p_source or p_source->>'actor_id' is distinct from p_actor_id::text then
  raise exception 'EXECUTION_PACKAGE_SOURCE_CHANGED' using errcode='23514';
 end if;
 if p_tenant_pdf_base64 is null or p_owner_pdf_base64 is null or p_tenant_pdf_sha256!~'^[a-f0-9]{64}$' or p_owner_pdf_sha256!~'^[a-f0-9]{64}$'
   or length(p_tenant_pdf_base64)>2796204 or length(p_owner_pdf_base64)>2796204 or length(p_renderer_version) not between 1 and 100 then
  raise exception 'EXECUTION_PACKAGE_INVALID_PDF' using errcode='23514';
 end if;
 tenant_bytes:=decode(p_tenant_pdf_base64,'base64'); owner_bytes:=decode(p_owner_pdf_base64,'base64');
 if octet_length(tenant_bytes) not between 8 and 2097152 or substring(tenant_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(tenant_bytes),'hex')<>p_tenant_pdf_sha256
   or octet_length(owner_bytes) not between 8 and 2097152 or substring(owner_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(owner_bytes),'hex')<>p_owner_pdf_sha256 then
  raise exception 'EXECUTION_PACKAGE_INVALID_PDF' using errcode='23514';
 end if;
 rent_amount:=(p_source#>>'{amounts,rent}')::numeric;
 if rent_amount>0 then
  if jsonb_typeof(p_receipt_artifacts) is distinct from 'object' or p_receipt_pdf_base64 is null or p_receipt_pdf_sha256!~'^[a-f0-9]{64}$' or length(p_receipt_pdf_base64)>2796204 then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_REQUIRED' using errcode='23514';
  end if;
  receipt:=p_receipt_artifacts->'receipt'; record:=p_receipt_artifacts->'record'; ledger:=p_receipt_artifacts->'ledger';
  if jsonb_typeof(receipt) is distinct from 'object' or jsonb_typeof(record) is distinct from 'array' or jsonb_typeof(ledger) is distinct from 'object'
    or receipt->>'id' is distinct from receipt_no or record->>0 is distinct from receipt_no or ledger->>'receiptNo' is distinct from receipt_no
    or nullif(receipt->>'contractReceiptSequence','')::integer is distinct from receipt_seq
    or nullif(ledger->>'contractReceiptSequence','')::integer is distinct from receipt_seq
    or receipt#>>'{contract,id}' is distinct from p_source->>'contract_ref' or receipt#>>'{contract,contract_no}' is distinct from p_source->>'contract_no'
    or receipt#>>'{contract,status}' is distinct from 'signed'
    or (record->>2)::numeric is distinct from rent_amount or (ledger->>'paid')::numeric is distinct from rent_amount then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_MISMATCH' using errcode='23514';
  end if;
  receipt_bytes:=decode(p_receipt_pdf_base64,'base64');
  if octet_length(receipt_bytes) not between 8 and 2097152 or substring(receipt_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(receipt_bytes),'hex')<>p_receipt_pdf_sha256 then
   raise exception 'EXECUTION_PACKAGE_INVALID_RECEIPT_PDF' using errcode='23514';
  end if;
 else
  if p_receipt_artifacts is not null or p_receipt_pdf_base64 is not null or p_receipt_pdf_sha256 is not null then raise exception 'EXECUTION_PACKAGE_FAKE_RECEIPT' using errcode='23514';end if;
 end if;
 select * into existing from private.aqari_contract_execution_packages where workspace_id=w and settlement_id=settlement;
 if found then
  if existing.id<>p_package_id or existing.actor_id<>p_actor_id or existing.source<>p_source or existing.tenant_pdf_sha256<>p_tenant_pdf_sha256 or existing.owner_pdf_sha256<>p_owner_pdf_sha256
    or existing.receipt_artifacts is distinct from p_receipt_artifacts or existing.receipt_pdf_sha256 is distinct from p_receipt_pdf_sha256 then
   raise exception 'EXECUTION_PACKAGE_REPLAY_CONFLICT' using errcode='23505';
  end if;
  return jsonb_build_object('package_id',existing.id,'replayed',true,'expires_at',existing.expires_at);
 end if;
 insert into private.aqari_contract_execution_packages(id,workspace_id,settlement_id,contract_ref,contract_no,actor_id,prepared_at,expires_at,source,receipt_artifacts,tenant_pdf_bytes,tenant_pdf_sha256,owner_pdf_bytes,owner_pdf_sha256,receipt_pdf_bytes,receipt_pdf_sha256,renderer_version)
 values(p_package_id,w,settlement,p_source->>'contract_ref',p_source->>'contract_no',p_actor_id,prepared,prepared+interval '15 minutes',p_source,p_receipt_artifacts,tenant_bytes,p_tenant_pdf_sha256,owner_bytes,p_owner_pdf_sha256,receipt_bytes,p_receipt_pdf_sha256,p_renderer_version);
 return jsonb_build_object('package_id',p_package_id,'replayed',false,'expires_at',prepared+interval '15 minutes');
end $$;
revoke all on function public.aqari_contract_execution_package_commit(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_contract_execution_package_commit(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text) to service_role;

create or replace function private.aqari_project_contract_execution_artifacts() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb; old_c jsonb;
 settlement private.aqari_contract_execution_settlements%rowtype; lease public.aqari_leases%rowtype; reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 package private.aqari_contract_execution_packages%rowtype; source jsonb; tenant_doc jsonb; owner_doc jsonb;
 tenant_id uuid; tenant_version uuid; tenant_event uuid; owner_id uuid; owner_version uuid; owner_event uuid;
 receipt_sequence integer; payment public.aqari_rent_payments%rowtype; receipt_snapshot_sha text; property_id uuid; package_id uuid;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb); new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then return null;end if;
 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  begin package_id:=(e->>'executionPackageId')::uuid; exception when others then raise exception 'EXECUTION_PACKAGE_REQUIRED' using errcode='23514';end;
  select * into strict settlement from private.aqari_contract_execution_settlements s where s.workspace_id=new.workspace_id and s.id=(e->>'id')::uuid;
  select * into strict lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=settlement.lease_id;
  select value into strict c from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;
  select value into strict old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;
  select * into package from private.aqari_contract_execution_packages p where p.id=package_id and p.workspace_id=new.workspace_id and p.settlement_id=settlement.id for update;
  if not found or package.actor_id<>auth.uid() or package.expires_at<now() or exists(select 1 from private.aqari_contract_execution_package_consumptions z where z.package_id=package.id) then
   raise exception 'EXECUTION_PACKAGE_UNAVAILABLE' using errcode='23514';
  end if;
  source:=package.source;
  if source->'pre_contract_snapshot' is distinct from old_c or source->'signed_contract_snapshot' is distinct from c
    or source->>'contract_no' is distinct from settlement.contract_no or source->>'contract_ref' is distinct from settlement.contract_ref
    or source->>'contract_document_id' is distinct from settlement.contract_document_id::text
    or (source#>>'{amounts,rent}')::numeric is distinct from settlement.rent_amount
    or (source#>>'{amounts,deposit}')::numeric is distinct from settlement.deposit_amount
    or (source#>>'{amounts,advance}')::numeric is distinct from settlement.advance_amount
    or (source#>>'{amounts,fees}')::numeric is distinct from settlement.fees_amount
    or (source#>>'{amounts,total}')::numeric is distinct from settlement.total_amount then
   raise exception 'EXECUTION_PACKAGE_SETTLEMENT_MISMATCH' using errcode='23514';
  end if;
  if settlement.contract_no is distinct from lease.contract_no or c->>'contract_no' is distinct from settlement.contract_no then raise exception 'CONTRACT_SERIAL_MISMATCH' using errcode='23514';end if;
  update private.aqari_contract_serial_reservations r set consumed_at=coalesce(r.consumed_at,now()) where r.workspace_id=new.workspace_id and r.contract_ref=settlement.contract_ref and r.contract_no=settlement.contract_no;
  if settlement.rent_amount>0 then
   receipt_sequence:=nullif(e->>'contractReceiptSequence','')::integer;
   select * into strict reservation from private.aqari_rent_receipt_serial_reservations r where r.receipt_no=settlement.rent_receipt_no and r.operation_ref=settlement.id;
   if reservation.workspace_id<>new.workspace_id or reservation.contract_ref<>settlement.contract_ref or reservation.contract_sequence<>receipt_sequence or reservation.consumed_at is not null
     or source->>'receipt_no' is distinct from settlement.rent_receipt_no or nullif(source->>'contract_receipt_sequence','')::integer is distinct from receipt_sequence then
    raise exception 'RECEIPT_SERIAL_RESERVATION_MISMATCH' using errcode='23514';
   end if;
   update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=reservation.receipt_no;
  else
   if coalesce(e->>'contractReceiptSequence','')<>'' or coalesce(source->>'receipt_no','')<>'' or source->>'contract_receipt_sequence' is not null then raise exception 'ZERO_RENT_RECEIPT_SEQUENCE_FORBIDDEN' using errcode='23514';end if;
   receipt_sequence:=null;
  end if;

  tenant_doc:=source->'tenant_document'; owner_doc:=source->'owner_document';
  if jsonb_typeof(tenant_doc) is distinct from 'object' or jsonb_typeof(owner_doc) is distinct from 'object' then raise exception 'EXECUTION_PACKAGE_DOCUMENT_REQUIRED' using errcode='23514';end if;
  tenant_id:=extensions.gen_random_uuid();tenant_version:=extensions.gen_random_uuid();tenant_event:=extensions.gen_random_uuid();
  owner_id:=extensions.gen_random_uuid();owner_version:=extensions.gen_random_uuid();owner_event:=extensions.gen_random_uuid();
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(tenant_id,new.workspace_id,tenant_doc->>'document_no','rental_contract',lease.id,auth.uid()),
         (owner_id,new.workspace_id,owner_doc->>'document_no','rental_contract',lease.id,auth.uid());
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values(tenant_id,new.workspace_id,'rental_contract',tenant_doc->>'document_no','lease',lease.id,'issued',1,auth.uid()),(owner_id,new.workspace_id,'rental_contract',owner_doc->>'document_no','lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name,issued_at)
   values
    (tenant_version,new.workspace_id,tenant_id,1,(tenant_doc->>'template_version')::integer,tenant_doc->>'title',tenant_doc->>'body',tenant_doc->'payload',tenant_doc->>'content_sha256',auth.uid(),tenant_doc->>'issued_by_name',(tenant_doc->>'issued_at')::timestamptz),
    (owner_version,new.workspace_id,owner_id,1,(owner_doc->>'template_version')::integer,owner_doc->>'title',owner_doc->>'body',owner_doc->'payload',owner_doc->>'content_sha256',auth.uid(),owner_doc->>'issued_by_name',(owner_doc->>'issued_at')::timestamptz);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values(tenant_event,new.workspace_id,tenant_id,'issue','نسخة المستأجر التلقائية ضمن معاملة إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',tenant_doc->>'content_sha256','execution_settlement_id',settlement.id)),
         (owner_event,new.workspace_id,owner_id,'issue','نسخة المالك / الإدارة التلقائية ضمن معاملة إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',owner_doc->>'content_sha256','execution_settlement_id',settlement.id));
  insert into private.aqari_official_pdf_artifacts(workspace_id,series_id,version,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
   values(new.workspace_id,tenant_id,1,tenant_doc->>'content_sha256',package.tenant_pdf_bytes,package.tenant_pdf_sha256,package.renderer_version,auth.uid()),
         (new.workspace_id,owner_id,1,owner_doc->>'content_sha256',package.owner_pdf_bytes,package.owner_pdf_sha256,package.renderer_version,auth.uid());

  if settlement.rent_amount>0 then
   select * into strict payment from public.aqari_rent_payments p where p.workspace_id=new.workspace_id and p.reference=settlement.rent_receipt_no;
   if package.receipt_artifacts->'receipt' is distinct from payment.receipt or package.receipt_artifacts->'record' is distinct from payment.record then
    raise exception 'EXECUTION_PACKAGE_RECEIPT_PERSISTENCE_MISMATCH' using errcode='23514';
   end if;
   receipt_snapshot_sha:=encode(sha256(convert_to(payment.receipt::text,'UTF8')),'hex');
   insert into private.aqari_rent_receipt_pdf_artifacts(workspace_id,receipt_no,payment_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
    values(new.workspace_id,settlement.rent_receipt_no,payment.id,receipt_snapshot_sha,package.receipt_pdf_bytes,package.receipt_pdf_sha256,package.renderer_version,auth.uid());
  end if;

  insert into private.aqari_contract_execution_artifacts(settlement_id,workspace_id,lease_id,contract_ref,contract_no,tenant_document_id,owner_document_id,rent_receipt_no,contract_receipt_sequence,created_by)
   values(settlement.id,new.workspace_id,lease.id,settlement.contract_ref,settlement.contract_no,tenant_id,owner_id,settlement.rent_receipt_no,receipt_sequence,auth.uid());
  insert into private.aqari_contract_execution_package_consumptions(package_id,workspace_id,settlement_id,consumed_by)
   values(package.id,new.workspace_id,settlement.id,auth.uid());
  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement.id::text,'contract_execution_atomic_package_consumed',auth.uid(),settlement.created_by_name,'حفظ العقد والدفع ونسختي PDF والوصل المؤرشف ضمن معاملة واحدة',jsonb_build_object('package_id',package.id,'contract_no',settlement.contract_no,'tenant_document_id',tenant_id,'owner_document_id',owner_id,'rent_receipt_no',settlement.rent_receipt_no,'contract_receipt_sequence',receipt_sequence,'tenant_pdf_sha256',package.tenant_pdf_sha256,'owner_pdf_sha256',package.owner_pdf_sha256,'receipt_pdf_sha256',package.receipt_pdf_sha256));
 end loop;
 return null;
end $$;
revoke all on function private.aqari_project_contract_execution_artifacts() from public,anon,authenticated,service_role;


-- SOURCE: contract-execution-package-ledger-fix.sql
-- Follow-up to contract-execution-package-atomic.sql: aqari_rent_payments.record
-- is the immutable rent-ledger entry, while collections keeps the display row.

create or replace function private.aqari_project_contract_execution_artifacts() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb; old_c jsonb;
 settlement private.aqari_contract_execution_settlements%rowtype; lease public.aqari_leases%rowtype; reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 package private.aqari_contract_execution_packages%rowtype; source jsonb; tenant_doc jsonb; owner_doc jsonb;
 tenant_id uuid; tenant_version uuid; tenant_event uuid; owner_id uuid; owner_version uuid; owner_event uuid;
 receipt_sequence integer; payment public.aqari_rent_payments%rowtype; receipt_snapshot_sha text; property_id uuid; package_id uuid;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb); new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then return null;end if;
 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  begin package_id:=(e->>'executionPackageId')::uuid; exception when others then raise exception 'EXECUTION_PACKAGE_REQUIRED' using errcode='23514';end;
  select * into strict settlement from private.aqari_contract_execution_settlements s where s.workspace_id=new.workspace_id and s.id=(e->>'id')::uuid;
  select * into strict lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=settlement.lease_id;
  select value into strict c from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;
  select value into strict old_c from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;
  select * into package from private.aqari_contract_execution_packages p where p.id=package_id and p.workspace_id=new.workspace_id and p.settlement_id=settlement.id for update;
  if not found or package.actor_id<>auth.uid() or package.expires_at<now() or exists(select 1 from private.aqari_contract_execution_package_consumptions z where z.package_id=package.id) then
   raise exception 'EXECUTION_PACKAGE_UNAVAILABLE' using errcode='23514';
  end if;
  source:=package.source;
  if source->'pre_contract_snapshot' is distinct from old_c or source->'signed_contract_snapshot' is distinct from c
    or source->>'contract_no' is distinct from settlement.contract_no or source->>'contract_ref' is distinct from settlement.contract_ref
    or source->>'contract_document_id' is distinct from settlement.contract_document_id::text
    or (source#>>'{amounts,rent}')::numeric is distinct from settlement.rent_amount
    or (source#>>'{amounts,deposit}')::numeric is distinct from settlement.deposit_amount
    or (source#>>'{amounts,advance}')::numeric is distinct from settlement.advance_amount
    or (source#>>'{amounts,fees}')::numeric is distinct from settlement.fees_amount
    or (source#>>'{amounts,total}')::numeric is distinct from settlement.total_amount then
   raise exception 'EXECUTION_PACKAGE_SETTLEMENT_MISMATCH' using errcode='23514';
  end if;
  if settlement.contract_no is distinct from lease.contract_no or c->>'contract_no' is distinct from settlement.contract_no then raise exception 'CONTRACT_SERIAL_MISMATCH' using errcode='23514';end if;
  update private.aqari_contract_serial_reservations r set consumed_at=coalesce(r.consumed_at,now()) where r.workspace_id=new.workspace_id and r.contract_ref=settlement.contract_ref and r.contract_no=settlement.contract_no;
  if settlement.rent_amount>0 then
   receipt_sequence:=nullif(e->>'contractReceiptSequence','')::integer;
   select * into strict reservation from private.aqari_rent_receipt_serial_reservations r where r.receipt_no=settlement.rent_receipt_no and r.operation_ref=settlement.id;
   if reservation.workspace_id<>new.workspace_id or reservation.contract_ref<>settlement.contract_ref or reservation.contract_sequence<>receipt_sequence or reservation.consumed_at is not null
     or source->>'receipt_no' is distinct from settlement.rent_receipt_no or nullif(source->>'contract_receipt_sequence','')::integer is distinct from receipt_sequence then
    raise exception 'RECEIPT_SERIAL_RESERVATION_MISMATCH' using errcode='23514';
   end if;
   update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=reservation.receipt_no;
  else
   if coalesce(e->>'contractReceiptSequence','')<>'' or coalesce(source->>'receipt_no','')<>'' or source->>'contract_receipt_sequence' is not null then raise exception 'ZERO_RENT_RECEIPT_SEQUENCE_FORBIDDEN' using errcode='23514';end if;
   receipt_sequence:=null;
  end if;

  tenant_doc:=source->'tenant_document'; owner_doc:=source->'owner_document';
  if jsonb_typeof(tenant_doc) is distinct from 'object' or jsonb_typeof(owner_doc) is distinct from 'object' then raise exception 'EXECUTION_PACKAGE_DOCUMENT_REQUIRED' using errcode='23514';end if;
  tenant_id:=extensions.gen_random_uuid();tenant_version:=extensions.gen_random_uuid();tenant_event:=extensions.gen_random_uuid();
  owner_id:=extensions.gen_random_uuid();owner_version:=extensions.gen_random_uuid();owner_event:=extensions.gen_random_uuid();
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(tenant_id,new.workspace_id,tenant_doc->>'document_no','rental_contract',lease.id,auth.uid()),
         (owner_id,new.workspace_id,owner_doc->>'document_no','rental_contract',lease.id,auth.uid());
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values(tenant_id,new.workspace_id,'rental_contract',tenant_doc->>'document_no','lease',lease.id,'issued',1,auth.uid()),(owner_id,new.workspace_id,'rental_contract',owner_doc->>'document_no','lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name,issued_at)
   values
    (tenant_version,new.workspace_id,tenant_id,1,(tenant_doc->>'template_version')::integer,tenant_doc->>'title',tenant_doc->>'body',tenant_doc->'payload',tenant_doc->>'content_sha256',auth.uid(),tenant_doc->>'issued_by_name',(tenant_doc->>'issued_at')::timestamptz),
    (owner_version,new.workspace_id,owner_id,1,(owner_doc->>'template_version')::integer,owner_doc->>'title',owner_doc->>'body',owner_doc->'payload',owner_doc->>'content_sha256',auth.uid(),owner_doc->>'issued_by_name',(owner_doc->>'issued_at')::timestamptz);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values(tenant_event,new.workspace_id,tenant_id,'issue','نسخة المستأجر التلقائية ضمن معاملة إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',tenant_doc->>'content_sha256','execution_settlement_id',settlement.id)),
         (owner_event,new.workspace_id,owner_id,'issue','نسخة المالك / الإدارة التلقائية ضمن معاملة إبرام العقد',auth.uid(),jsonb_build_object('version',1,'hash',owner_doc->>'content_sha256','execution_settlement_id',settlement.id));
  insert into private.aqari_official_pdf_artifacts(workspace_id,series_id,version,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
   values(new.workspace_id,tenant_id,1,tenant_doc->>'content_sha256',package.tenant_pdf_bytes,package.tenant_pdf_sha256,package.renderer_version,auth.uid()),
         (new.workspace_id,owner_id,1,owner_doc->>'content_sha256',package.owner_pdf_bytes,package.owner_pdf_sha256,package.renderer_version,auth.uid());

  if settlement.rent_amount>0 then
   select * into strict payment from public.aqari_rent_payments p where p.workspace_id=new.workspace_id and p.reference=settlement.rent_receipt_no;
   if package.receipt_artifacts->'receipt' is distinct from payment.receipt or package.receipt_artifacts->'ledger' is distinct from payment.record then
    raise exception 'EXECUTION_PACKAGE_RECEIPT_PERSISTENCE_MISMATCH' using errcode='23514';
   end if;
   receipt_snapshot_sha:=encode(sha256(convert_to(payment.receipt::text,'UTF8')),'hex');
   insert into private.aqari_rent_receipt_pdf_artifacts(workspace_id,receipt_no,payment_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
    values(new.workspace_id,settlement.rent_receipt_no,payment.id,receipt_snapshot_sha,package.receipt_pdf_bytes,package.receipt_pdf_sha256,package.renderer_version,auth.uid());
  end if;

  insert into private.aqari_contract_execution_artifacts(settlement_id,workspace_id,lease_id,contract_ref,contract_no,tenant_document_id,owner_document_id,rent_receipt_no,contract_receipt_sequence,created_by)
   values(settlement.id,new.workspace_id,lease.id,settlement.contract_ref,settlement.contract_no,tenant_id,owner_id,settlement.rent_receipt_no,receipt_sequence,auth.uid());
  insert into private.aqari_contract_execution_package_consumptions(package_id,workspace_id,settlement_id,consumed_by)
   values(package.id,new.workspace_id,settlement.id,auth.uid());
  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement.id::text,'contract_execution_atomic_package_consumed',auth.uid(),settlement.created_by_name,'حفظ العقد والدفع ونسختي PDF والوصل المؤرشف ضمن معاملة واحدة',jsonb_build_object('package_id',package.id,'contract_no',settlement.contract_no,'tenant_document_id',tenant_id,'owner_document_id',owner_id,'rent_receipt_no',settlement.rent_receipt_no,'contract_receipt_sequence',receipt_sequence,'tenant_pdf_sha256',package.tenant_pdf_sha256,'owner_pdf_sha256',package.owner_pdf_sha256,'receipt_pdf_sha256',package.receipt_pdf_sha256));
 end loop;
 return null;
end $$;
revoke all on function private.aqari_project_contract_execution_artifacts() from public,anon,authenticated,service_role;


-- SOURCE: contract-execution-official-source.sql
-- Reconciled from the Preview implementation on 2026-10-06.
-- Install only after contract-execution-package-atomic.sql.
-- Retains number reservations and validates rental documents against the
-- immutable, actor-bound PDF package, signed lease, and transaction manifest.
-- This source module is not a Production rollout migration.

-- Do not overwrite an unknown/newer source guard during reconciliation.
do $$ begin
 if coalesce(md5(pg_get_functiondef(to_regprocedure('private.aqari_official_source_guard()'))),'')
  not in ('66f94d6201d715919ec416ce83f1d29d','473f54fe0309dc3e4182f66837911174')
 then raise exception 'EXECUTION_OFFICIAL_SOURCE_GUARD_DRIFT';end if;
end $$;

CREATE OR REPLACE FUNCTION private.aqari_validate_execution_document(s private.aqari_official_document_series, v private.aqari_official_document_versions)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 package private.aqari_contract_execution_packages;
 lease public.aqari_leases;
 source jsonb; expected jsonb; manifest jsonb; c jsonb; settlement_id uuid;
 copy_role text; clauses text; title text; body text; payload jsonb; hash text;
 document_no text; template_version integer;
begin
 if auth.uid() is null or not private.aqari_manager(s.workspace_id)
  or not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write')
  or s.entity_type is distinct from 'lease' or s.status is distinct from 'issued'
  or s.current_version is distinct from 1 or v.version is distinct from 1
  or s.created_by is distinct from auth.uid() or v.issued_by is distinct from auth.uid()
 then raise exception 'EXECUTION_DOCUMENT_ACCESS_DENIED' using errcode='42501';end if;
 select * into package from private.aqari_contract_execution_packages p
 where p.workspace_id=s.workspace_id and p.settlement_id::text=v.payload->>'executionSettlementId' for update;
 if not found or package.actor_id is distinct from auth.uid() or package.expires_at<=now()
  or exists(select 1 from private.aqari_contract_execution_package_consumptions z where z.package_id=package.id)
 then raise exception 'EXECUTION_DOCUMENT_PACKAGE_UNAVAILABLE' using errcode='23514';end if;
 source:=package.source;settlement_id:=package.settlement_id;c:=source->'signed_contract_snapshot';
 select * into lease from public.aqari_leases l where l.workspace_id=s.workspace_id and l.id=s.entity_id;
 if not found or lease.status is distinct from 'signed' or lease.snapshot is distinct from c
  or lease.id::text is distinct from source->>'lease_id' or lease.external_ref is distinct from package.contract_ref
  or lease.contract_no is distinct from package.contract_no
 then raise exception 'EXECUTION_DOCUMENT_LEASE_MISMATCH' using errcode='23514';end if;
 select e into manifest from public.aqari_app_state a
 cross join lateral jsonb_array_elements(coalesce(private.aqari_unwrap(a.payload)->'contractExecutionSettlementsV267','[]')) e
 where a.workspace_id=s.workspace_id and e->>'id'=settlement_id::text;
 if manifest is null or manifest->>'executionPackageId' is distinct from package.id::text
  or manifest->>'contractDocumentId' is distinct from source->>'contract_document_id'
  or manifest->>'contractId' is distinct from package.contract_ref
 then raise exception 'EXECUTION_DOCUMENT_MANIFEST_MISMATCH' using errcode='23514';end if;
 copy_role:=v.payload->>'copyRole';
 if copy_role is null then
  if s.id::text is distinct from source->>'contract_document_id'
   then raise exception 'EXECUTION_DOCUMENT_CANONICAL_ID_MISMATCH' using errcode='23514';end if;
  clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality) from jsonb_array_elements(coalesce(c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
  if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
  title:='عقد إيجار '||(c->>'contract_no');
  body:='عقد إيجار رقم '||(c->>'contract_no')||E'\nالمستأجر: '||coalesce(c->>'tenant','')||E'\nالعقار: '||(c->>'property')||' — الوحدة: '||(c->>'unit')||E'\nمدة العقد: '||(c->>'start_date')||' إلى '||(c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(c->>'contractRent',c->>'rent')||' د.ك — الخصم: '||coalesce(c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(c->>'deposit','0')||' د.ك — العربون: '||coalesce(c->>'advance','0')||' د.ك — الرسوم: '||coalesce(c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
  payload:=jsonb_build_object('contractNo',c->>'contract_no','tenant',c->>'tenant','property',c->>'property','unit',c->>'unit','startDate',c->>'start_date','endDate',c->>'end_date','contractRent',c->>'contractRent','discount',c->>'discount','deposit',c->>'deposit','advance',c->>'advance','fees',c->>'cleaningFee','template',c->'contractTemplate','executionSettlementId',settlement_id,'contractSnapshot',c);
  hash:=pg_catalog.encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex');

  document_no:='CT-'||(c->>'contract_no');
  template_version:=coalesce(nullif(c#>>'{contractTemplate,version}','')::integer,1);
  if hash is distinct from source->>'canonical_content_sha256' then raise exception 'EXECUTION_DOCUMENT_SOURCE_HASH_MISMATCH' using errcode='23514';end if;
 else
  if copy_role not in ('tenant','owner') then raise exception 'EXECUTION_DOCUMENT_COPY_ROLE_INVALID' using errcode='23514';end if;
  expected:=source->(copy_role||'_document');
  if jsonb_typeof(expected) is distinct from 'object' then raise exception 'EXECUTION_DOCUMENT_COPY_REQUIRED' using errcode='23514';end if;
  title:=expected->>'title';body:=expected->>'body';payload:=expected->'payload';
  hash:=expected->>'content_sha256';document_no:=expected->>'document_no';
  template_version:=(expected->>'template_version')::integer;
  if v.issued_at is distinct from (expected->>'issued_at')::timestamptz then raise exception 'EXECUTION_DOCUMENT_ISSUED_AT_MISMATCH' using errcode='23514';end if;
 end if;
 if s.document_no is distinct from document_no or v.title is distinct from title
  or v.body is distinct from body or v.payload is distinct from payload
  or v.content_sha256 is distinct from hash or v.template_version is distinct from template_version
  or v.issued_by_name is distinct from source->>'actor_name'
  or hash is distinct from encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex')
 then raise exception 'EXECUTION_DOCUMENT_CONTENT_MISMATCH' using errcode='23514';end if;
end $function$;
revoke all on function private.aqari_validate_execution_document(private.aqari_official_document_series,private.aqari_official_document_versions) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.aqari_official_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s private.aqari_official_document_series;defaults jsonb;key text;value jsonb;v_source_key text;
begin
 select * into strict s from private.aqari_official_document_series where workspace_id=new.workspace_id and id=new.series_id;
 if new.version=1 and not exists(select 1 from private.aqari_official_number_reservations r where r.workspace_id=s.workspace_id and r.id=s.id and r.document_no=s.document_no and r.kind=s.kind and r.entity_id=s.entity_id and r.actor_id=auth.uid()) then raise exception 'DOCUMENT_RESERVED_NUMBER_REQUIRED' using errcode='23514';end if;
 if s.kind='rental_contract' then
  perform private.aqari_validate_execution_document(s,new);
  return new;
 end if;
 perform private.aqari_official_validate(s.kind,s.document_no,new.template_version,new.title,new.body,new.payload,new.content_sha256);
 if not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 -- Serialize mutable work-order state with issuance. Financial mutations also
 -- take the workspace ledger lock held by the public registration RPC.
 if s.kind='work_order' then perform 1 from private.aqari_work_orders where workspace_id=s.workspace_id and id=s.entity_id for share;end if;
 defaults:=private.aqari_official_source(s.workspace_id,s.kind,s.entity_type,s.entity_id,nullif(new.payload->>'sourceId','')::uuid,new.payload);
 for key,value in select * from jsonb_each(defaults) loop
  if new.payload->key is distinct from value then raise exception 'DOCUMENT_SOURCE_MISMATCH: %',key using errcode='23514';end if;
 end loop;
 if s.kind in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','payment_voucher','expense_approval','work_order') then v_source_key:=defaults->>'sourceId';
 elsif s.kind='daily_collection' then v_source_key:=s.entity_id::text||':'||(defaults->>'collectionDate');end if;
 if s.source_key is not null and s.source_key is distinct from v_source_key then raise exception 'DOCUMENT_SOURCE_CANNOT_CHANGE' using errcode='23514';end if;
 if v_source_key is not null then update private.aqari_official_document_series set source_key=v_source_key where workspace_id=s.workspace_id and id=s.id;end if;
 return new;
end $function$;
revoke all on function private.aqari_official_source_guard() from public,anon,authenticated,service_role;

commit;
