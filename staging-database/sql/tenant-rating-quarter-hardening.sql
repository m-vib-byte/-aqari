-- Non-destructive V267 upgrade, after final-gap-readback-hardening.sql and
-- vacating-release.sql. Uses the existing contract terms and day-five cutoff.
-- No lease, receipt, archived year, balance, or stored rating changes on install.
begin;

do $$begin
 if to_regprocedure('private.aqari_contract_due(jsonb,text)') is null
  or to_regprocedure('public.aqari_final_gap_register(uuid,text,jsonb)') is null
  or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='aqari_leases' and column_name='vacated_on') then
  raise exception 'TENANT_RATING_PREREQUISITES_REQUIRED';
 end if;
end $$;

create or replace function private.aqari_tenant_rating_evidence(w uuid,tenant uuid,rating_year integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;as_of date:=(now() at time zone 'Asia/Kuwait')::date;
begin
 if auth.uid() is null or not private.aqari_manager(w) then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if rating_year is null or rating_year not between 2000 and 2200 then
  raise exception 'INVALID_RATING_YEAR' using errcode='22023';
 end if;
 if tenant is null or not exists(select 1 from public.aqari_tenants t where t.workspace_id=w and t.id=tenant) then
  raise insufficient_privilege using message='TENANT_NOT_AVAILABLE';
 end if;
 with lease_months as (
  select l.id lease_id,g::date period,extract(quarter from g)::integer quarter,
   case when l.snapshot->>'rentalTermsVersion'='1'
    then coalesce(private.aqari_contract_due(l.snapshot,to_char(g,'YYYY-MM')),l.monthly_rent)
    else l.monthly_rent end due
  from public.aqari_leases l
  cross join lateral generate_series(
   date_trunc('month',greatest(l.start_date,make_date(rating_year,1,1)))::date,
   date_trunc('month',least(l.end_date,coalesce(l.vacated_on,l.end_date),make_date(rating_year,12,31),as_of))::date,
   interval '1 month')g
  where l.workspace_id=w and l.tenant_id=tenant and l.status in ('signed','expired')
   and l.start_date is not null and l.end_date is not null
 ), paid as (
  select m.*,coalesce(p.amount,0) paid_early,coalesce(p.receipt_ids,'[]'::jsonb) receipt_ids
  from lease_months m left join lateral (
   select sum(p.amount) amount,jsonb_agg(p.id order by p.id) receipt_ids
   from public.aqari_rent_payments p
   where p.workspace_id=w and p.lease_id=m.lease_id and p.period=m.period
    and p.paid_at<=least(m.period+4,as_of) and p.status in ('paid','partial','مدفوع','جزئي')
    and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  )p on true
 ), calendar_months as (
  -- Parallel contracts do not turn one calendar month into three months.
  -- Every payable contract in that month must be settled independently.
  select quarter,period,bool_and(due>=0 and (due=0 or paid_early>=due)) settled,
   bool_and(due=0) zero_due,
   jsonb_agg(jsonb_build_object('lease_id',lease_id,'due',due,'paid_early',paid_early,
    'receipt_ids',receipt_ids,'zero_due',due=0,'settled',due>=0 and (due=0 or paid_early>=due)) order by lease_id) leases
  from paid group by quarter,period
 ), evidence as (
  select quarter,count(*) due_months,count(*)filter(where settled and not zero_due) paid_early_months,
   count(*)filter(where zero_due) zero_due_months,count(*)filter(where settled) settled_months,
   -- A prepaid future quarter cannot create a star before its three months end.
   (make_date(rating_year,quarter*3,1)+interval '1 month'-interval '1 day')::date<=as_of quarter_complete,
   jsonb_agg(jsonb_build_object('period',period,'settled',settled,'zero_due',zero_due,'leases',leases) order by period) months
  from calendar_months group by quarter
 ), summary as (
  select count(*)filter(where due_months=3 and settled_months=3 and quarter_complete)::integer stars,
   coalesce(jsonb_agg(jsonb_build_object('quarter',quarter,'due_months',due_months,
    'paid_early_months',paid_early_months,'zero_due_months',zero_due_months,'settled_months',settled_months,
    'quarter_complete',quarter_complete,'eligible',due_months=3 and settled_months=3 and quarter_complete,
    'policy','calendar-quarter-v2','months',months) order by quarter),'[]'::jsonb) proof
  from evidence
 )select jsonb_build_object('stars',least(4,stars),'proof',proof) into result from summary;
 return result;
end $$;
revoke all on function private.aqari_tenant_rating_evidence(uuid,uuid,integer) from public,anon,authenticated;

-- Replace only the known rating branch. Preserve unrelated concurrent fixes,
-- ownership, manager/AAL2 checks, financial locks and the existing RPC grants.
do $patch$
declare source text;before_branch text;after_branch text;first_pos integer;last_pos integer;
begin
 source:=pg_get_functiondef('public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure);
 if position('private.aqari_tenant_rating_evidence(w,tenant,(d->>''year'')::integer)' in source)>0 then return;end if;
 first_pos:=position(' if p_action=''rate'' then tenant:=(d->>''tenant_id'')::uuid;' in source);
 last_pos:=position(' return public.aqari_final_gap_register(w,''list'');' in source);
 if first_pos=0 or last_pos<=first_pos then raise exception 'TENANT_RATING_SOURCE_CHANGED';end if;
 before_branch:=substring(source from first_pos for last_pos-first_pos);
 -- Exact known branch fingerprint: stop if another revision changed its policy.
 if md5(before_branch)<>'8c43768373c60d76ea7a9ed4ba95ab6a' then raise exception 'TENANT_RATING_SOURCE_CHANGED';end if;
 if position('due_months>0 and due_months=paid_early_months' in before_branch)=0
  or position('p.status<>''cancelled''' in before_branch)=0
  or position('private.aqari_receipt_cancellations' in before_branch)=0
  or position('on conflict(workspace_id,tenant_id,rating_year)' in before_branch)=0 then
  raise exception 'TENANT_RATING_SOURCE_CHANGED';
 end if;
 after_branch:=$branch$ if p_action='rate' then tenant:=(d->>'tenant_id')::uuid;
  with summary as(select private.aqari_tenant_rating_evidence(w,tenant,(d->>'year')::integer) result)
  insert into private.aqari_tenant_year_ratings(workspace_id,tenant_id,rating_year,stars,rating,quarter_evidence,calculated_at,source_revision)
  select w,tenant,(d->>'year')::integer,(s.result->>'stars')::integer,
   case when (s.result->>'stars')::integer=4 then 'ممتاز' when (s.result->>'stars')::integer>=2 then 'ملتزم' else 'بحاجة إلى متابعة'end,
   s.result->'proof',now(),md5(w::text||tenant::text||(d->>'year')||(s.result->'proof')::text)
  from summary s
  on conflict(workspace_id,tenant_id,rating_year)do update set stars=excluded.stars,rating=excluded.rating,
   quarter_evidence=excluded.quarter_evidence,calculated_at=now(),source_revision=excluded.source_revision;
 end if;
$branch$;
 execute replace(source,before_branch,after_branch);
end $patch$;
commit;
