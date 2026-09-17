-- AQARI V267 owner-report target controls v2.
-- Additive only: existing owner experience settings and business records remain intact.
begin;

alter table private.aqari_owner_experience_settings
  add column if not exists report_targets jsonb not null default '[]'::jsonb,
  add column if not exists report_targets_revision bigint not null default 0 check (report_targets_revision>=0);

create or replace function public.aqari_owner_report_targets(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  role_name text; settings private.aqari_owner_experience_settings%rowtype; expected bigint;
  targets jsonb:=coalesce(p_data->'targets','[]'::jsonb); item jsonb; canonical jsonb:='[]'::jsonb;
  target_id text; owner_name text; property_text text; channels jsonb; email text; whatsapp text; schedule text; report_hour integer; enabled boolean;
begin
  select role::text into role_name from public.aqari_memberships
   where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
  if role_name is distinct from 'general_manager' then raise insufficient_privilege using message='ACCESS_DENIED';end if;

  insert into private.aqari_owner_experience_settings(workspace_id)
  values(p_workspace_id) on conflict(workspace_id) do nothing;

  if p_action='read' then
    select * into settings from private.aqari_owner_experience_settings where workspace_id=p_workspace_id;
    return jsonb_build_object(
      'workspace_id',p_workspace_id,'targets',coalesce(settings.report_targets,'[]'::jsonb),
      'revision',coalesce(settings.report_targets_revision,0),
      'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
        from public.aqari_properties p where p.workspace_id=p_workspace_id),'[]'::jsonb)
    );
  elsif p_action<>'save' then raise exception 'INVALID_OWNER_REPORT_TARGET_ACTION';end if;

  perform private.aqari_require_sensitive_aal2(p_workspace_id);
  if jsonb_typeof(coalesce(p_data,'{}'::jsonb))<>'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('targets','expected_revision')) then raise exception 'INVALID_OWNER_REPORT_TARGETS';end if;
  if jsonb_typeof(targets)<>'array' or jsonb_array_length(targets)>40 or coalesce(p_data->>'expected_revision','')!~'^\d+$' then raise exception 'INVALID_OWNER_REPORT_TARGETS';end if;
  expected=(p_data->>'expected_revision')::bigint;

  for item in select value from jsonb_array_elements(targets) loop
    if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in('id','owner_name','property_id','channels','email','whatsapp','schedule','hour','enabled')) then raise exception 'INVALID_OWNER_REPORT_TARGET';end if;
    target_id=trim(coalesce(item->>'id',''));owner_name=trim(coalesce(item->>'owner_name',''));property_text=nullif(trim(coalesce(item->>'property_id','')),'');
    channels=coalesce(item->'channels','[]'::jsonb);email=lower(trim(coalesce(item->>'email','')));whatsapp=regexp_replace(trim(coalesce(item->>'whatsapp','')),'[\s()\-]','','g');
    schedule=coalesce(nullif(item->>'schedule',''),'monthly');report_hour=coalesce((item->>'hour')::integer,8);enabled=coalesce((item->>'enabled')::boolean,false);
    if target_id!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or length(owner_name)<2 or length(owner_name)>120 then raise exception 'INVALID_OWNER_REPORT_TARGET';end if;
    if property_text is not null and (property_text!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not exists(select 1 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=property_text::uuid)) then raise exception 'INVALID_OWNER_REPORT_PROPERTY';end if;
    if jsonb_typeof(channels)<>'array' or jsonb_array_length(channels)<1 or jsonb_array_length(channels)>2 or exists(select 1 from jsonb_array_elements_text(channels) c where c not in('whatsapp','email')) then raise exception 'INVALID_OWNER_REPORT_CHANNELS';end if;
    if (select count(distinct value) from jsonb_array_elements_text(channels))<>jsonb_array_length(channels) then raise exception 'INVALID_OWNER_REPORT_CHANNELS';end if;
    if schedule not in('daily','weekly','monthly') or report_hour not between 0 and 23 then raise exception 'INVALID_OWNER_REPORT_SCHEDULE';end if;
    if channels ? 'email' and (length(email)>254 or email!~*'^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$') then raise exception 'INVALID_OWNER_REPORT_EMAIL';end if;
    if channels ? 'whatsapp' and (length(whatsapp)<8 or length(whatsapp)>20 or whatsapp!~'^\+?[0-9]+$') then raise exception 'INVALID_OWNER_REPORT_WHATSAPP';end if;
    canonical=canonical||jsonb_build_array(jsonb_build_object('id',target_id,'owner_name',owner_name,'property_id',property_text,'channels',channels,'email',email,'whatsapp',whatsapp,'schedule',schedule,'hour',report_hour,'enabled',enabled));
  end loop;
  if (select count(*) from jsonb_array_elements(canonical))<>(select count(distinct value->>'id') from jsonb_array_elements(canonical)) then raise exception 'DUPLICATE_OWNER_REPORT_TARGET';end if;

  select * into settings from private.aqari_owner_experience_settings where workspace_id=p_workspace_id for update;
  if settings.report_targets_revision<>expected then raise exception 'OWNER_REPORT_TARGET_REVISION_CONFLICT';end if;
  update private.aqari_owner_experience_settings set report_targets=canonical,report_targets_revision=report_targets_revision+1,updated_by=auth.uid(),updated_at=now()
   where workspace_id=p_workspace_id returning * into settings;
  return jsonb_build_object('workspace_id',p_workspace_id,'targets',settings.report_targets,'revision',settings.report_targets_revision,
    'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id) from public.aqari_properties p where p.workspace_id=p_workspace_id),'[]'::jsonb));
end $$;
revoke all on function public.aqari_owner_report_targets(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_owner_report_targets(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_owner_report_delivery_targets()
returns table(target_id uuid,workspace_id uuid,owner_name text,property_id uuid,property_name text,channels jsonb,email text,whatsapp text,report_schedule text,report_hour smallint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return query
 select (x->>'id')::uuid,s.workspace_id,x->>'owner_name',nullif(x->>'property_id','')::uuid,p.name,x->'channels',nullif(x->>'email',''),nullif(x->>'whatsapp',''),x->>'schedule',(x->>'hour')::smallint
 from private.aqari_owner_experience_settings s
 cross join lateral jsonb_array_elements(coalesce(s.report_targets,'[]'::jsonb)) x
 left join public.aqari_properties p on p.workspace_id=s.workspace_id and p.id=nullif(x->>'property_id','')::uuid
 where s.report_enabled and coalesce((x->>'enabled')::boolean,false);
end $$;
revoke all on function public.aqari_owner_report_delivery_targets() from public,anon,authenticated;
grant execute on function public.aqari_owner_report_delivery_targets() to service_role;

create or replace function public.aqari_owner_report_service_v2(p_workspace_id uuid,p_property_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare units_count bigint;active_leases bigint;actual numeric:=0;expenses numeric:=0;property_name text;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then raise exception 'INVALID_REPORT_PERIOD';end if;
 if p_property_id is not null then select p.name into property_name from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=p_property_id;if property_name is null then raise exception 'OWNER_REPORT_PROPERTY_NOT_FOUND';end if;end if;
 select count(*) into units_count from public.aqari_units u where u.workspace_id=p_workspace_id and (p_property_id is null or u.property_id=p_property_id);
 select count(*) into active_leases from public.aqari_leases l join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id where l.workspace_id=p_workspace_id and (p_property_id is null or u.property_id=p_property_id) and l.status in('signed','active') and l.start_date<=p_to and l.end_date>=p_from;
 select coalesce(sum(pay.amount),0) into actual from public.aqari_rent_payments pay join public.aqari_leases l on l.id=pay.lease_id and l.workspace_id=pay.workspace_id join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id where pay.workspace_id=p_workspace_id and (p_property_id is null or u.property_id=p_property_id) and pay.paid_at between p_from and p_to and coalesce(pay.status,'') not in('cancelled','void');
 select coalesce(sum(e.amount),0) into expenses from private.aqari_financial_expenses e where e.workspace_id=p_workspace_id and (p_property_id is null or e.property_id=p_property_id) and e.expense_date between p_from and p_to and e.state='approved';
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'property_name',property_name,'from',p_from,'to',p_to,'currency','KWD','units',units_count,'active_leases',active_leases,'collections',actual,'approved_expenses',expenses,'net',actual-expenses,'generated_at',now());
end $$;
revoke all on function public.aqari_owner_report_service_v2(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.aqari_owner_report_service_v2(uuid,uuid,date,date) to service_role;

commit;
