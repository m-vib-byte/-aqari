-- AQARI V267 owner experience controls: additive, no business-row rewrites.
begin;

create table if not exists private.aqari_owner_experience_settings(
  workspace_id uuid primary key,
  guest_enabled boolean not null default false,
  assistant_enabled boolean not null default true,
  report_enabled boolean not null default false,
  report_channel text not null default 'email' check (report_channel in ('email','whatsapp')),
  report_schedule text not null default 'weekly' check (report_schedule in ('daily','weekly','monthly')),
  report_hour smallint not null default 8 check (report_hour between 0 and 23),
  report_recipient text,
  revision bigint not null default 0 check (revision>=0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on private.aqari_owner_experience_settings from public,anon,authenticated;

create or replace function public.aqari_owner_experience_settings(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  r text; current_row private.aqari_owner_experience_settings%rowtype;
  expected bigint; next_recipient text; next_channel text; next_schedule text; next_hour integer;
begin
  select role::text into r from public.aqari_memberships
   where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
  if r is distinct from 'general_manager' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if p_action='read' then
    select * into current_row from private.aqari_owner_experience_settings where workspace_id=p_workspace_id;
    return jsonb_build_object(
      'workspace_id',p_workspace_id,'guest_enabled',coalesce(current_row.guest_enabled,false),
      'assistant_enabled',coalesce(current_row.assistant_enabled,true),'report_enabled',coalesce(current_row.report_enabled,false),
      'report_channel',coalesce(current_row.report_channel,'email'),'report_schedule',coalesce(current_row.report_schedule,'weekly'),
      'report_hour',coalesce(current_row.report_hour,8),'report_recipient',coalesce(current_row.report_recipient,''),
      'revision',coalesce(current_row.revision,0),'updated_at',current_row.updated_at
    );
  elsif p_action='save' then
    perform private.aqari_require_sensitive_aal2(p_workspace_id);
    if jsonb_typeof(coalesce(p_data,'{}'::jsonb))<>'object' or exists(
      select 1 from jsonb_object_keys(coalesce(p_data,'{}'::jsonb)) k
      where k not in ('guest_enabled','assistant_enabled','report_enabled','report_channel','report_schedule','report_hour','report_recipient','expected_revision')
    ) then raise exception 'INVALID_OWNER_EXPERIENCE_SETTINGS';end if;
    if jsonb_typeof(p_data->'guest_enabled')<>'boolean' or jsonb_typeof(p_data->'assistant_enabled')<>'boolean' or jsonb_typeof(p_data->'report_enabled')<>'boolean' then raise exception 'INVALID_OWNER_EXPERIENCE_SETTINGS';end if;
    if coalesce(p_data->>'expected_revision','')!~'^\d+$' then raise exception 'INVALID_OWNER_EXPERIENCE_SETTINGS';end if;
    expected=(p_data->>'expected_revision')::bigint;
    next_channel=coalesce(nullif(p_data->>'report_channel',''),'email');
    next_schedule=coalesce(nullif(p_data->>'report_schedule',''),'weekly');
    next_hour=coalesce((p_data->>'report_hour')::integer,8);
    next_recipient=trim(coalesce(p_data->>'report_recipient',''));
    if next_channel not in ('email','whatsapp') or next_schedule not in ('daily','weekly','monthly') or next_hour not between 0 and 23 or length(next_recipient)>254 or next_recipient~'[\x00-\x1f\x7f]' then raise exception 'INVALID_OWNER_EXPERIENCE_SETTINGS';end if;
    if (p_data->>'report_enabled')::boolean and length(next_recipient)<3 then raise exception 'OWNER_REPORT_RECIPIENT_REQUIRED';end if;
    select * into current_row from private.aqari_owner_experience_settings where workspace_id=p_workspace_id for update;
    if current_row.workspace_id is null then
      if expected<>0 then raise exception 'OWNER_EXPERIENCE_REVISION_CONFLICT';end if;
      insert into private.aqari_owner_experience_settings(workspace_id,guest_enabled,assistant_enabled,report_enabled,report_channel,report_schedule,report_hour,report_recipient,revision,updated_by)
      values(p_workspace_id,(p_data->>'guest_enabled')::boolean,(p_data->>'assistant_enabled')::boolean,(p_data->>'report_enabled')::boolean,next_channel,next_schedule,next_hour,nullif(next_recipient,''),1,auth.uid())
      returning * into current_row;
    else
      if current_row.revision<>expected then raise exception 'OWNER_EXPERIENCE_REVISION_CONFLICT';end if;
      update private.aqari_owner_experience_settings set
        guest_enabled=(p_data->>'guest_enabled')::boolean,
        assistant_enabled=(p_data->>'assistant_enabled')::boolean,
        report_enabled=(p_data->>'report_enabled')::boolean,
        report_channel=next_channel,report_schedule=next_schedule,report_hour=next_hour,
        report_recipient=nullif(next_recipient,''),revision=revision+1,updated_by=auth.uid(),updated_at=now()
      where workspace_id=p_workspace_id returning * into current_row;
    end if;
    return jsonb_build_object('workspace_id',current_row.workspace_id,'guest_enabled',current_row.guest_enabled,'assistant_enabled',current_row.assistant_enabled,'report_enabled',current_row.report_enabled,'report_channel',current_row.report_channel,'report_schedule',current_row.report_schedule,'report_hour',current_row.report_hour,'report_recipient',coalesce(current_row.report_recipient,''),'revision',current_row.revision,'updated_at',current_row.updated_at);
  else
    raise exception 'INVALID_OWNER_EXPERIENCE_ACTION';
  end if;
end $$;
revoke all on function public.aqari_owner_experience_settings(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_owner_experience_settings(uuid,text,jsonb) to authenticated;

-- Anonymous callers receive only a feature flag. No workspace or business data is exposed.
create or replace function public.aqari_guest_mode_status()
returns jsonb language sql stable security definer set search_path='' as $$
  with enabled as (select count(*)::int n from private.aqari_owner_experience_settings where guest_enabled)
  select case when n=1 then jsonb_build_object('enabled',true,'mode','demo_only','data_access',false)
              else jsonb_build_object('enabled',false,'mode','disabled','data_access',false) end from enabled
$$;
revoke all on function public.aqari_guest_mode_status() from public;
grant execute on function public.aqari_guest_mode_status() to anon,authenticated;

-- Cron/service delivery reads settings only through service_role.
create or replace function public.aqari_owner_report_delivery_settings()
returns table(workspace_id uuid,report_channel text,report_schedule text,report_hour smallint,report_recipient text)
language sql stable security definer set search_path='' as $$
  select s.workspace_id,s.report_channel,s.report_schedule,s.report_hour,s.report_recipient
  from private.aqari_owner_experience_settings s
  where s.report_enabled and s.report_recipient is not null
$$;
revoke all on function public.aqari_owner_report_delivery_settings() from public,anon,authenticated;
grant execute on function public.aqari_owner_report_delivery_settings() to service_role;

create or replace function public.aqari_owner_report_service(p_workspace_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare units_count bigint;active_leases bigint;actual numeric:=0;expenses numeric:=0;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then raise exception 'INVALID_REPORT_PERIOD';end if;
  select count(*) into units_count from public.aqari_units where workspace_id=p_workspace_id;
  select count(*) into active_leases from public.aqari_leases where workspace_id=p_workspace_id and status in ('signed','active') and start_date<=p_to and end_date>=p_from;
  select coalesce(sum(amount),0) into actual from public.aqari_rent_payments where workspace_id=p_workspace_id and paid_at between p_from and p_to and coalesce(status,'') not in ('cancelled','void');
  select coalesce(sum(amount),0) into expenses from private.aqari_financial_expenses where workspace_id=p_workspace_id and expense_date between p_from and p_to and state='approved';
  return jsonb_build_object('workspace_id',p_workspace_id,'from',p_from,'to',p_to,'currency','KWD','units',units_count,'active_leases',active_leases,'collections',actual,'approved_expenses',expenses,'net',actual-expenses,'generated_at',now());
end $$;
revoke all on function public.aqari_owner_report_service(uuid,date,date) from public,anon,authenticated;
grant execute on function public.aqari_owner_report_service(uuid,date,date) to service_role;

commit;
