-- Isolated V267: explicit new-contract entitlement terms, no legacy backfill.
-- Apply after current rent/reminder balance convergence. Never rewrite receipts.
begin;
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
do $upgrade$
declare signature text;definition text;anchor text;replacement text;
begin
 foreach signature in array array[
  'public.aqari_rent_due_schedule(uuid,uuid)',
  'private.aqari_official_statement(uuid,uuid,date,date)',
  'private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)',
  'private.aqari_v267_prepare_reminders(uuid,date,integer)',
  'private.aqari_reconcile_reminder_queue(uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  case signature
   when 'public.aqari_rent_due_schedule(uuid,uuid)' then
    anchor:='''due_amount'',d.due_amount';replacement:='''due_on'',private.aqari_rent_due_on(l.snapshot,l.start_date,d.period),''due_amount'',d.due_amount';
   when 'private.aqari_official_statement(uuid,uuid,date,date)' then
    anchor:='greatest(p::date,l.start_date) on_date';replacement:='private.aqari_rent_due_on(l.snapshot,l.start_date,p::date) on_date';
   when 'private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)' then
    anchor:='into due_total from generate_series(period_start,period_end,interval ''1 month'') p;';
    replacement:='into due_total from generate_series(period_start,period_end,interval ''1 month'') p where not (l.snapshot ? ''rentEntitlement'') or private.aqari_rent_due_on(l.snapshot,l.start_date,p::date)<=vdate;';
   when 'private.aqari_v267_prepare_reminders(uuid,date,integer)' then
    anchor:='private.aqari_reminder_rent_balance(w,l.id,period_start)>0';
    replacement:=anchor||' and (not (l.snapshot ? ''rentEntitlement'') or (l.snapshot#>>''{rentEntitlement,startDate}'')::date<=as_of)';
   when 'private.aqari_reconcile_reminder_queue(uuid)' then
    anchor:='private.aqari_reminder_rent_balance(w,l.id,o.period)>0';
    replacement:=anchor||' and (not (l.snapshot ? ''rentEntitlement'') or (l.snapshot#>>''{rentEntitlement,startDate}'')::date<=(o.scheduled_at at time zone ''Asia/Kuwait'')::date)';
  end case;
  if position(replacement in definition)=0 then
   if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'RENT_ENTITLEMENT_CONSUMER_CHANGED:%',signature;end if;
   definition:=replace(definition,anchor,replacement);
  end if;
  if signature='private.aqari_v267_prepare_reminders(uuid,date,integer)' then
   anchor:='window_end:=period_start+max_grace-1;';replacement:='window_end:=(period_start+interval ''1 month - 1 day'')::date+max_grace-1;';
   if position(replacement in definition)=0 then
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'ENTITLEMENT_REMINDER_WINDOW_CHANGED';end if;
    definition:=replace(definition,anchor,replacement);
   end if;
   anchor:='as_of<=period_start+private.aqari_effective_grace_days(w,l.id,grace_day)-1';
   replacement:='as_of<=(case when l.snapshot ? ''rentEntitlement'' then private.aqari_rent_due_on(l.snapshot,l.start_date,period_start) else period_start end)+private.aqari_effective_grace_days(w,l.id,grace_day)-1';
   if position(replacement in definition)=0 then
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'ENTITLEMENT_REMINDER_GRACE_CHANGED';end if;
    definition:=replace(definition,anchor,replacement);
   end if;
  end if;
  execute definition;
 end loop;
end $upgrade$;
do $rating$
declare definition text:=pg_get_functiondef('private.aqari_tenant_rating_evidence(uuid,uuid,integer)'::regprocedure);anchor text;replacement text;
begin
 anchor:='extract(quarter from g)::integer quarter,';
 replacement:=anchor||'case when l.snapshot ? ''rentEntitlement'' then private.aqari_rent_due_on(l.snapshot,l.start_date,g::date) else g::date end entitlement_due_on,';
 if position(replacement in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'ENTITLEMENT_RATING_PROJECTION_CHANGED';end if;
  definition:=replace(definition,anchor,replacement);
 end if;
 anchor:='p.paid_at<=least(m.period+4,as_of)';replacement:='p.paid_at<=least(m.entitlement_due_on+4,as_of)';
 if position(replacement in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'ENTITLEMENT_RATING_CUTOFF_CHANGED';end if;definition:=replace(definition,anchor,replacement);
 end if;
 anchor:='and l.start_date is not null and l.end_date is not null';
 replacement:=anchor||' and (not (l.snapshot ? ''rentEntitlement'') or private.aqari_rent_due_on(l.snapshot,l.start_date,g::date)<=as_of)';
 if position(replacement in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'ENTITLEMENT_RATING_RANGE_CHANGED';end if;definition:=replace(definition,anchor,replacement);
 end if;
 execute definition;
end $rating$;
commit;
