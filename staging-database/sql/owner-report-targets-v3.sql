-- AQARI V267 owner-report target controls v3.
begin;

create table if not exists private.aqari_owner_report_delivery_log(
 target_id uuid not null,
 channel text not null check(channel in('whatsapp','email')),
 dispatch_key text not null,
 status text not null check(status in('pending','sent','failed')),
 attempts integer not null default 1 check(attempts between 1 and 50),
 provider_id text,
 error_code text,
 updated_at timestamptz not null default now(),
 primary key(target_id,channel,dispatch_key)
);
alter table private.aqari_owner_report_delivery_log enable row level security;
revoke all on private.aqari_owner_report_delivery_log from public,anon,authenticated;

create or replace function public.aqari_owner_report_targets(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 role_name text; settings private.aqari_owner_experience_settings%rowtype; expected bigint;
 targets jsonb:=coalesce(p_data->'targets','[]'::jsonb); item jsonb; canonical jsonb:='[]'::jsonb;
 target_id text; owner_name text; owner_user_text text; owner_user uuid; property_ids jsonb; channels jsonb;
 email text; whatsapp text; schedule text; report_hour integer; enabled boolean;
begin
 select role::text into role_name from public.aqari_memberships
  where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if role_name is distinct from 'general_manager' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 insert into private.aqari_owner_experience_settings(workspace_id) values(p_workspace_id) on conflict(workspace_id) do nothing;

 if p_action='read' then
  select * into settings from private.aqari_owner_experience_settings where workspace_id=p_workspace_id;
  return jsonb_build_object(
   'workspace_id',p_workspace_id,
   'targets',coalesce((
     select jsonb_agg((x - 'property_id') || jsonb_build_object('property_ids',case when jsonb_typeof(x->'property_ids')='array' then x->'property_ids' when nullif(x->>'property_id','') is not null then jsonb_build_array(x->>'property_id') else '[]'::jsonb end) order by x->>'owner_name',x->>'id')
     from jsonb_array_elements(coalesce(settings.report_targets,'[]'::jsonb)) x
   ),'[]'::jsonb),
   'revision',coalesce(settings.report_targets_revision,0),
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id) from public.aqari_properties p where p.workspace_id=p_workspace_id),'[]'::jsonb),
   'owners',coalesce((select jsonb_agg(jsonb_build_object('user_id',q.user_id,'display_name',q.display_name,'email',q.email,'property_ids',q.property_ids) order by q.display_name,q.user_id) from (select a.user_id,max(a.display_name) display_name,max(a.email) email,jsonb_agg(distinct a.property_id order by a.property_id) property_ids from private.aqari_partner_access a where a.workspace_id=p_workspace_id and a.is_active and a.user_id is not null group by a.user_id) q),'[]'::jsonb)
  );
 elsif p_action<>'save' then raise exception 'INVALID_OWNER_REPORT_TARGET_ACTION';end if;

 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 if jsonb_typeof(coalesce(p_data,'{}'::jsonb))<>'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('targets','expected_revision')) or jsonb_typeof(targets)<>'array' or jsonb_array_length(targets)>40 or coalesce(p_data->>'expected_revision','')!~'^\d+$' then raise exception 'INVALID_OWNER_REPORT_TARGETS';end if;
 expected=(p_data->>'expected_revision')::bigint;

 for item in select value from jsonb_array_elements(targets) loop
  if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in('id','owner_name','owner_user_id','property_ids','channels','email','whatsapp','schedule','hour','enabled')) then raise exception 'INVALID_OWNER_REPORT_TARGET';end if;
  target_id=trim(coalesce(item->>'id',''));owner_name=trim(coalesce(item->>'owner_name',''));owner_user_text=nullif(trim(coalesce(item->>'owner_user_id','')),'');owner_user=null;
  if owner_user_text is not null then
   if owner_user_text!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_OWNER_REPORT_OWNER';end if;
   owner_user=owner_user_text::uuid;
   if not exists(select 1 from private.aqari_partner_access a where a.workspace_id=p_workspace_id and a.user_id=owner_user and a.is_active) then raise exception 'OWNER_REPORT_OWNER_ACCESS_REQUIRED';end if;
   if length(owner_name)<2 then select max(a.display_name) into owner_name from private.aqari_partner_access a where a.workspace_id=p_workspace_id and a.user_id=owner_user and a.is_active;end if;
  end if;
  property_ids=coalesce(item->'property_ids','[]'::jsonb);channels=coalesce(item->'channels','[]'::jsonb);email=lower(trim(coalesce(item->>'email','')));whatsapp=regexp_replace(trim(coalesce(item->>'whatsapp','')),'[\s()\-]','','g');schedule=coalesce(nullif(item->>'schedule',''),'monthly');report_hour=coalesce((item->>'hour')::integer,8);enabled=coalesce((item->>'enabled')::boolean,false);
  if target_id!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or length(owner_name)<2 or length(owner_name)>120 then raise exception 'INVALID_OWNER_REPORT_TARGET';end if;
  if jsonb_typeof(property_ids)<>'array' or jsonb_array_length(property_ids)>50 or exists(select 1 from jsonb_array_elements_text(property_ids) x where x!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (select count(distinct value) from jsonb_array_elements_text(property_ids))<>jsonb_array_length(property_ids) then raise exception 'INVALID_OWNER_REPORT_PROPERTIES';end if;
  if exists(select 1 from jsonb_array_elements_text(property_ids) x where not exists(select 1 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=x::uuid)) then raise exception 'INVALID_OWNER_REPORT_PROPERTY';end if;
  if owner_user is null and jsonb_array_length(property_ids)=0 then raise exception 'OWNER_REPORT_PROPERTIES_REQUIRED';end if;
  if owner_user is not null and exists(select 1 from jsonb_array_elements_text(property_ids) x where not exists(select 1 from private.aqari_partner_access a where a.workspace_id=p_workspace_id and a.user_id=owner_user and a.property_id=x::uuid and a.is_active)) then raise exception 'OWNER_REPORT_OWNER_SCOPE_MISMATCH';end if;
  if jsonb_typeof(channels)<>'array' or jsonb_array_length(channels)<1 or jsonb_array_length(channels)>2 or exists(select 1 from jsonb_array_elements_text(channels) c where c not in('whatsapp','email')) or (select count(distinct value) from jsonb_array_elements_text(channels))<>jsonb_array_length(channels) then raise exception 'INVALID_OWNER_REPORT_CHANNELS';end if;
  if schedule not in('daily','weekly','monthly') or report_hour not between 0 and 23 then raise exception 'INVALID_OWNER_REPORT_SCHEDULE';end if;
  if channels ? 'email' and email='' and owner_user is not null then select lower(max(a.email)) into email from private.aqari_partner_access a where a.workspace_id=p_workspace_id and a.user_id=owner_user and a.is_active;end if;
  if channels ? 'email' and (length(email)>254 or email!~*'^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$') then raise exception 'INVALID_OWNER_REPORT_EMAIL';end if;
  if channels ? 'whatsapp' and (length(whatsapp)<8 or length(whatsapp)>20 or whatsapp!~'^\+?[0-9]+$') then raise exception 'INVALID_OWNER_REPORT_WHATSAPP';end if;
  canonical=canonical||jsonb_build_array(jsonb_build_object('id',target_id,'owner_name',owner_name,'owner_user_id',owner_user_text,'property_ids',property_ids,'channels',channels,'email',email,'whatsapp',whatsapp,'schedule',schedule,'hour',report_hour,'enabled',enabled));
 end loop;
 if (select count(*) from jsonb_array_elements(canonical))<>(select count(distinct value->>'id') from jsonb_array_elements(canonical)) then raise exception 'DUPLICATE_OWNER_REPORT_TARGET';end if;
 select * into settings from private.aqari_owner_experience_settings where workspace_id=p_workspace_id for update;
 if settings.report_targets_revision<>expected then raise exception 'OWNER_REPORT_TARGET_REVISION_CONFLICT';end if;
 update private.aqari_owner_experience_settings set report_targets=canonical,report_targets_revision=report_targets_revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=p_workspace_id returning * into settings;
 return public.aqari_owner_report_targets(p_workspace_id,'read','{}'::jsonb);
end $$;
revoke all on function public.aqari_owner_report_targets(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_owner_report_targets(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_owner_report_delivery_targets_v3()
returns table(target_id uuid,workspace_id uuid,owner_name text,owner_user_id uuid,property_ids uuid[],property_names text[],channels jsonb,email text,whatsapp text,report_schedule text,report_hour smallint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return query
 with targets as (
  select s.workspace_id,x,nullif(x->>'owner_user_id','')::uuid owner_user,array(select value::uuid from jsonb_array_elements_text(coalesce(x->'property_ids','[]'::jsonb))) saved_ids
  from private.aqari_owner_experience_settings s cross join lateral jsonb_array_elements(coalesce(s.report_targets,'[]'::jsonb)) x
  where s.report_enabled and coalesce((x->>'enabled')::boolean,false)
 ), resolved as (
  select t.*,case when t.owner_user is not null then array(select a.property_id from private.aqari_partner_access a where a.workspace_id=t.workspace_id and a.user_id=t.owner_user and a.is_active and (cardinality(t.saved_ids)=0 or a.property_id=any(t.saved_ids)) order by a.property_id) else t.saved_ids end resolved_ids from targets t
 )
 select (r.x->>'id')::uuid,r.workspace_id,r.x->>'owner_name',r.owner_user,r.resolved_ids,array(select p.name from public.aqari_properties p where p.workspace_id=r.workspace_id and p.id=any(r.resolved_ids) order by p.name,p.id),r.x->'channels',nullif(r.x->>'email',''),nullif(r.x->>'whatsapp',''),r.x->>'schedule',(r.x->>'hour')::smallint
 from resolved r where cardinality(r.resolved_ids)>0;
end $$;
revoke all on function public.aqari_owner_report_delivery_targets_v3() from public,anon,authenticated;
grant execute on function public.aqari_owner_report_delivery_targets_v3() to service_role;

create or replace function public.aqari_owner_report_service_v3(p_workspace_id uuid,p_property_ids uuid[],p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare month_start date:=date_trunc('month',p_to)::date;properties_json jsonb;tenants_json jsonb;arrears_json jsonb;collection_json jsonb;alerts_json jsonb;period_collections numeric:=0;period_expenses numeric:=0;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 or coalesce(cardinality(p_property_ids),0)<1 or cardinality(p_property_ids)>50 then raise exception 'INVALID_REPORT_PERIOD_OR_SCOPE';end if;
 if exists(select 1 from unnest(p_property_ids) id where not exists(select 1 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=id)) then raise exception 'OWNER_REPORT_PROPERTY_NOT_FOUND';end if;
 select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id) into properties_json from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=any(p_property_ids);
 with lines as (
  select p.id property_id,p.name property_name,l.id lease_id,l.contract_no,u.unit_no,t.full_name tenant_name,d.due_amount::numeric(15,3) due,d.paid_amount::numeric(15,3) paid,greatest(d.due_amount-d.paid_amount,0)::numeric(15,3) remaining,
   case when d.due_amount=0 then 'waived' when d.paid_amount>=d.due_amount then 'paid' when d.paid_amount>0 then 'partial' else 'unpaid' end state
  from private.aqari_rent_due_periods d
  join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
  left join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
  where d.workspace_id=p_workspace_id and d.period=month_start and p.id=any(p_property_ids)
 )
 select coalesce(jsonb_build_object('period',month_start,'due',sum(due),'collected',sum(least(paid,due)),'paid_total',sum(paid),'remaining',sum(remaining),'collection_rate_pct',case when sum(due)>0 then round(sum(least(paid,due))/sum(due)*100,2) else null end,'paid_count',count(*) filter(where state='paid'),'partial_count',count(*) filter(where state='partial'),'unpaid_count',count(*) filter(where state='unpaid'),'waived_count',count(*) filter(where state='waived')),jsonb_build_object('period',month_start,'due',0,'collected',0,'paid_total',0,'remaining',0,'paid_count',0,'partial_count',0,'unpaid_count',0,'waived_count',0)),
        coalesce(jsonb_agg(jsonb_build_object('property_id',property_id,'property_name',property_name,'lease_id',lease_id,'contract_no',contract_no,'unit_no',unit_no,'tenant_name',coalesce(tenant_name,'غير محدد'),'due',due,'paid',paid,'remaining',remaining,'state',state) order by property_name,unit_no,contract_no),'[]'::jsonb)
 into collection_json,tenants_json from lines;
 with old_due as (
  select p.id property_id,p.name property_name,u.unit_no,t.full_name tenant_name,d.period,greatest(d.due_amount-d.paid_amount,0)::numeric(15,3) remaining
  from private.aqari_rent_due_periods d
  join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
  left join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
  where d.workspace_id=p_workspace_id and d.period<month_start and p.id=any(p_property_ids) and d.due_amount>d.paid_amount
 )
 select jsonb_build_object('count',count(*),'remaining',coalesce(sum(remaining),0),'lines',coalesce(jsonb_agg(jsonb_build_object('property_id',property_id,'property_name',property_name,'unit_no',unit_no,'tenant_name',coalesce(tenant_name,'غير محدد'),'period',period,'remaining',remaining) order by period,property_name,unit_no) filter(where remaining>0),'[]'::jsonb)) into arrears_json from old_due;
 select coalesce(sum(pay.amount),0) into period_collections from public.aqari_rent_payments pay join public.aqari_leases l on l.workspace_id=pay.workspace_id and l.id=pay.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where pay.workspace_id=p_workspace_id and u.property_id=any(p_property_ids) and pay.paid_at between p_from and p_to and coalesce(pay.status,'') not in('cancelled','void');
 select coalesce(sum(e.amount),0) into period_expenses from private.aqari_financial_expenses e where e.workspace_id=p_workspace_id and e.property_id=any(p_property_ids) and e.expense_date between p_from and p_to and e.state='approved';
 select jsonb_build_object(
  'leases_expiring_30',(select count(*) from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and u.property_id=any(p_property_ids) and l.status in('signed','active') and l.end_date between p_to and p_to+30),
  'maintenance_open',(select count(*) from public.aqari_maintenance_requests m join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where m.workspace_id=p_workspace_id and u.property_id=any(p_property_ids) and lower(coalesce(m.status,'')) not in('completed','closed','cancelled','canceled','done')),
  'unpaid_current',coalesce((collection_json->>'unpaid_count')::integer,0)+coalesce((collection_json->>'partial_count')::integer,0),
  'arrears_count',coalesce((arrears_json->>'count')::integer,0)
 ) into alerts_json;
 return jsonb_build_object('workspace_id',p_workspace_id,'from',p_from,'to',p_to,'currency','KWD','properties',coalesce(properties_json,'[]'::jsonb),'collection',collection_json,'tenants',tenants_json,'arrears',arrears_json,'alerts',alerts_json,'period_activity',jsonb_build_object('collections',period_collections,'approved_expenses',period_expenses,'net',period_collections-period_expenses),'generated_at',now());
end $$;
revoke all on function public.aqari_owner_report_service_v3(uuid,uuid[],date,date) from public,anon,authenticated;
grant execute on function public.aqari_owner_report_service_v3(uuid,uuid[],date,date) to service_role;

create or replace function public.aqari_owner_report_delivery_claim(p_target_id uuid,p_channel text,p_dispatch_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare row_status text;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_target_id is null or p_channel not in('whatsapp','email') or p_dispatch_key is null or length(p_dispatch_key)>80 then raise exception 'INVALID_DELIVERY_CLAIM';end if;
 insert into private.aqari_owner_report_delivery_log(target_id,channel,dispatch_key,status) values(p_target_id,p_channel,p_dispatch_key,'pending')
 on conflict(target_id,channel,dispatch_key) do update set status='pending',attempts=private.aqari_owner_report_delivery_log.attempts+1,provider_id=null,error_code=null,updated_at=now()
 where (private.aqari_owner_report_delivery_log.status='failed' or (private.aqari_owner_report_delivery_log.status='pending' and private.aqari_owner_report_delivery_log.updated_at < now()-interval '30 minutes')) and private.aqari_owner_report_delivery_log.attempts<50
 returning status into row_status;
 if row_status is null then return jsonb_build_object('send',false);end if;
 return jsonb_build_object('send',true);
end $$;
revoke all on function public.aqari_owner_report_delivery_claim(uuid,text,text) from public,anon,authenticated;
grant execute on function public.aqari_owner_report_delivery_claim(uuid,text,text) to service_role;

create or replace function public.aqari_owner_report_delivery_complete(p_target_id uuid,p_channel text,p_dispatch_key text,p_success boolean,p_provider_id text,p_error_code text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare n integer;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 update private.aqari_owner_report_delivery_log set status=case when p_success then 'sent' else 'failed' end,provider_id=case when p_success then left(coalesce(p_provider_id,''),300) else null end,error_code=case when p_success then null else left(coalesce(p_error_code,'DELIVERY_FAILED'),160) end,updated_at=now()
 where target_id=p_target_id and channel=p_channel and dispatch_key=p_dispatch_key and status='pending';
 get diagnostics n=row_count;if n<>1 then raise exception 'DELIVERY_CLAIM_NOT_FOUND';end if;
 return jsonb_build_object('ok',true,'status',case when p_success then 'sent' else 'failed' end);
end $$;
revoke all on function public.aqari_owner_report_delivery_complete(uuid,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.aqari_owner_report_delivery_complete(uuid,text,text,boolean,text,text) to service_role;

commit;
