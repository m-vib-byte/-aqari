-- AQARI V267: evidenced monthly percentage-rent charges and append-only reversals.
-- Apply after financial-register.sql, operations-register.sql, vacating-release.sql and compliance-register.sql.
-- No hosted deployment is performed by this source file.
begin;
create table private.aqari_commercial_sales (
 id uuid primary key, workspace_id uuid not null, lease_id uuid not null,
 month date not null check(extract(day from month)=1), period_start date not null, period_end date not null,
 gross_sales numeric(15,3) not null check(gross_sales>=0), sales_percentage numeric(7,4) not null check(sales_percentage>0 and sales_percentage<=100),
 amount numeric(15,3) not null check(amount>=0), terms_revision integer not null check(terms_revision>0),
 calculation_basis text not null check(calculation_basis='additional_to_base_rent'),
 source_document_id uuid not null, source_checksum text not null check(source_checksum~'^[a-f0-9]{64}$'),
 source_reference text not null check(length(btrim(source_reference)) between 3 and 200),
 request_data jsonb not null, recorded_by uuid not null, recorded_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(source_document_id) references public.aqari_documents(id),
 unique(workspace_id,id), check(period_start<=period_end),
 check(period_start>=month and period_end<(month+interval '1 month')::date)
);
create index aqari_commercial_sales_period on private.aqari_commercial_sales(workspace_id,lease_id,month);
create table private.aqari_commercial_sales_reversals (
 id uuid primary key, workspace_id uuid not null, sale_id uuid not null, occurred_on date not null,
 reason text not null check(length(btrim(reason)) between 5 and 500), request_data jsonb not null,
 recorded_by uuid not null, recorded_at timestamptz not null default now(),
 unique(workspace_id,sale_id), foreign key(workspace_id,sale_id) references private.aqari_commercial_sales(workspace_id,id)
);
alter table private.aqari_commercial_sales enable row level security;
alter table private.aqari_commercial_sales_reversals enable row level security;
revoke all on private.aqari_commercial_sales,private.aqari_commercial_sales_reversals from public,anon,authenticated;
create trigger aqari_commercial_sales_immutable before update or delete on private.aqari_commercial_sales
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_commercial_sales_reversal_immutable before update or delete on private.aqari_commercial_sales_reversals
 for each row execute function private.aqari_reject_immutable_change();
alter table private.aqari_tenant_adjustments drop constraint aqari_tenant_adjustments_kind_check;
alter table private.aqari_tenant_adjustments add constraint aqari_tenant_adjustments_kind_check
 check(kind in ('cheque_return','legal_cost','common_charge','manual_correction','commercial_sales'));

-- Private SECURITY DEFINER is needed solely for the revoked, immutable financial
-- tables. Its public invoker wrapper adds no privilege; every action checks the
-- authenticated manager, workspace, property and MFA before writing.
create function private.aqari_commercial_sales_register(w uuid,action text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); ident uuid; lid uuid; mon date; first_day date; last_day date; posted_on date;
 today date:=(now() at time zone 'Asia/Kuwait')::date;
 l public.aqari_leases; prop public.aqari_properties; terms private.aqari_commercial_terms;
 saved private.aqari_commercial_sales; reversed private.aqari_commercial_sales_reversals;
 document_row public.aqari_documents; amount numeric(15,3); sales numeric(15,3); request jsonb; result jsonb;
begin
 if actor is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if jsonb_typeof(d) is distinct from 'object' or action is null or action not in ('list','record','reverse') then
  raise exception 'INVALID_COMMERCIAL_SALES_ACTION' using errcode='22023';
 end if;
 if coalesce(d->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
  raise exception 'INVALID_SALES_MONTH' using errcode='22023';
 end if;
 mon:=(d->>'month'||'-01')::date;
 if action='list' then
  return jsonb_build_object('month',to_char(mon,'YYYY-MM'),
   'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'external_ref',q.external_ref,'contract_no',q.contract_no,'property_ref',p.external_ref,'property_id',p.id,'property_name',p.name,'sales_percentage',t.sales_percentage,'terms_revision',t.revision) order by q.contract_no),'[]')
    from public.aqari_leases q join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id
    join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
    join private.aqari_commercial_terms t on t.workspace_id=q.workspace_id and t.lease_id=q.id
    where q.workspace_id=w and t.sales_percentage>0 and q.status in ('signed','expired') and private.aqari_can_property(w,p.id,'finance','read')),
   'documents',(select coalesce(jsonb_agg(to_jsonb(z)),'[]') from (
    select doc.id,doc.title,doc.entity_type,doc.entity_ref from public.aqari_documents doc
    join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
    where doc.workspace_id=w and doc.entity_type in ('property','lease') and doc.status='uploaded'
     and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type
     and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,doc.entity_type,doc.entity_ref,'read')
    order by doc.created_at desc,doc.id limit 200)z),
   'entries',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('reversal',(select to_jsonb(r) from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) order by s.recorded_at desc,s.id),'[]')
    from private.aqari_commercial_sales s join public.aqari_leases q on q.workspace_id=s.workspace_id and q.id=s.lease_id
    join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id
    where s.workspace_id=w and s.month=mon and private.aqari_can_property(w,u.property_id,'finance','read')));
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 ident:=nullif(d->>'id','')::uuid;
 if ident is null then raise exception 'SALES_ID_REQUIRED' using errcode='22023';end if;
 -- Same lock order as financial closing: workspace first, then lease/terms.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;

 if action='record' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in ('id','lease_id','month','gross_sales','terms_revision','source_document_id','source_reference','calculation_basis'))
   or coalesce(d->>'gross_sales','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
   or coalesce(d->>'terms_revision','') !~ '^[1-9][0-9]{0,8}$'
   or d->>'calculation_basis' is distinct from 'additional_to_base_rent'
   or length(btrim(coalesce(d->>'source_reference',''))) not between 3 and 200 then
   raise exception 'INVALID_COMMERCIAL_SALES' using errcode='22023';
  end if;
  lid:=nullif(d->>'lease_id','')::uuid;sales:=(d->>'gross_sales')::numeric;
  request:=d||jsonb_build_object('gross_sales',to_char(sales,'FM999999999990.000'),'source_reference',btrim(d->>'source_reference'));
  select * into saved from private.aqari_commercial_sales where id=ident;
  if found then
   if saved.workspace_id<>w or saved.request_data is distinct from request then raise exception 'SALES_RETRY_CONFLICT' using errcode='23505';end if;
   return to_jsonb(saved);
  end if;
  select * into l from public.aqari_leases where workspace_id=w and id=lid for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select p.* into prop from public.aqari_properties p join public.aqari_units u on u.workspace_id=p.workspace_id and u.property_id=p.id where u.workspace_id=w and u.id=l.unit_id;
  if not private.aqari_can_property(w,prop.id,'finance','write') or not private.aqari_can_property(w,prop.id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  first_day:=greatest(mon,l.start_date);last_day:=least((mon+interval '1 month - 1 day')::date,l.end_date,coalesce(l.vacated_on,l.end_date));
  if l.status not in ('signed','expired') or l.start_date is null or l.end_date is null or first_day>last_day or first_day<mon or first_day>=(mon+interval '1 month')::date or last_day>today then
   raise exception 'SALES_PERIOD_OUTSIDE_COMPLETED_LEASE_MONTH' using errcode='23514';
  end if;
  perform private.aqari_financial_open(w,last_day);
  select * into terms from private.aqari_commercial_terms where workspace_id=w and lease_id=lid for share;
  if not found or terms.sales_percentage<=0 or terms.compliance_reviewed_at is null then raise exception 'APPROVED_SALES_TERMS_REQUIRED' using errcode='23514';end if;
  if terms.revision<>(d->>'terms_revision')::integer then raise serialization_failure using message='SALES_TERMS_REVISION_CONFLICT';end if;
  if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.month=mon
   and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) then
   raise exception 'SALES_MONTH_ALREADY_POSTED' using errcode='23505';
  end if;
  select doc.* into document_row from public.aqari_documents doc join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
   where doc.workspace_id=w and doc.id=nullif(d->>'source_document_id','')::uuid and doc.status='uploaded'
    and ((doc.entity_type='property' and doc.entity_ref=prop.external_ref) or (doc.entity_type='lease' and doc.entity_ref=l.external_ref))
    and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type
    and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,doc.entity_type,doc.entity_ref,'read');
  if not found then raise exception 'SALES_SOURCE_DOCUMENT_UNVERIFIED' using errcode='23514';end if;
  amount:=round(sales*terms.sales_percentage/100,3);
  insert into private.aqari_commercial_sales(id,workspace_id,lease_id,month,period_start,period_end,gross_sales,sales_percentage,amount,terms_revision,calculation_basis,source_document_id,source_checksum,source_reference,request_data,recorded_by)
   values(ident,w,lid,mon,first_day,last_day,sales,terms.sales_percentage,amount,terms.revision,'additional_to_base_rent',document_row.id,document_row.checksum_sha256,btrim(d->>'source_reference'),request,actor) returning to_jsonb(aqari_commercial_sales) into result;
  if amount>0 then
   insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
    values(gen_random_uuid(),w,lid,'commercial_sales','debit',amount,last_day,'commercial_sales',ident,'استحقاق نسبة مبيعات '||to_char(mon,'YYYY-MM')||' — '||btrim(d->>'source_reference'),actor);
  end if;
 else
  if exists(select 1 from jsonb_object_keys(d)k where k not in ('id','sale_id','month','occurred_on','reason'))
   or length(btrim(coalesce(d->>'reason',''))) not between 5 and 500
   or coalesce(d->>'occurred_on','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise exception 'INVALID_SALES_REVERSAL' using errcode='22023';end if;
  posted_on:=(d->>'occurred_on')::date;request:=d||jsonb_build_object('reason',btrim(d->>'reason'));
  select * into reversed from private.aqari_commercial_sales_reversals where id=ident;
  if found then
   if reversed.workspace_id<>w or reversed.request_data is distinct from request then raise exception 'SALES_RETRY_CONFLICT' using errcode='23505';end if;
   return to_jsonb(reversed);
  end if;
  select * into saved from private.aqari_commercial_sales where workspace_id=w and id=nullif(d->>'sale_id','')::uuid and month=mon for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select p.* into prop from public.aqari_properties p join public.aqari_units u on u.workspace_id=p.workspace_id and u.property_id=p.id join public.aqari_leases q on q.workspace_id=u.workspace_id and q.unit_id=u.id where q.workspace_id=w and q.id=saved.lease_id;
  if not private.aqari_can_property(w,prop.id,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if posted_on<saved.period_end or posted_on>today then raise exception 'INVALID_SALES_REVERSAL_DATE' using errcode='23514';end if;
  perform private.aqari_financial_open(w,posted_on);
  if exists(select 1 from private.aqari_commercial_sales_reversals where workspace_id=w and sale_id=saved.id) then raise exception 'SALES_ALREADY_REVERSED' using errcode='23505';end if;
  insert into private.aqari_commercial_sales_reversals(id,workspace_id,sale_id,occurred_on,reason,request_data,recorded_by)
   values(ident,w,saved.id,posted_on,btrim(d->>'reason'),request,actor) returning to_jsonb(aqari_commercial_sales_reversals) into result;
  if saved.amount>0 then
   insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
    values(gen_random_uuid(),w,saved.lease_id,'commercial_sales','credit',saved.amount,posted_on,'commercial_sales_reversal',ident,btrim(d->>'reason'),actor);
  end if;
 end if;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
  values(w,'commercial_sales',ident,action,actor,coalesce(auth.jwt()->>'email',actor::text),coalesce(result->>'source_reference',result->>'reason'),result);
 return result;
end $$;
revoke all on function private.aqari_commercial_sales_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_commercial_sales_register(uuid,text,jsonb) to authenticated;
create function public.aqari_commercial_sales(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select private.aqari_commercial_sales_register(p_workspace_id,p_action,p_data)
$$;
revoke all on function public.aqari_commercial_sales(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_commercial_sales(uuid,text,jsonb) to authenticated;
commit;
