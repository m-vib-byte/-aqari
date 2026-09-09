-- Staging only. Additive controls; no business-data seed/import or account changes.
-- Authenticated RPCs use the caller UID; no user metadata is trusted.
create table public.aqari_workspace_controls (
 workspace_id uuid primary key references public.aqari_workspaces(id),
 settings jsonb not null default '{"sections":{},"permissions":{},"labels":{}}',
 revision bigint not null default 1,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table public.aqari_control_audit (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 actor_id uuid not null references auth.users(id),
 action text not null, entity_ref text not null, reason text not null,
 before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create index aqari_control_audit_workspace_time on public.aqari_control_audit(workspace_id,created_at desc,id);
create index aqari_control_audit_actor on public.aqari_control_audit(actor_id);
create index aqari_workspace_controls_actor on public.aqari_workspace_controls(updated_by);
alter table public.aqari_workspace_controls enable row level security;
alter table public.aqari_control_audit enable row level security;
revoke all on public.aqari_workspace_controls,public.aqari_control_audit from public,anon,authenticated;
grant select on public.aqari_workspace_controls,public.aqari_control_audit to authenticated;

create function private.aqari_manager(w uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=(select auth.uid()) and m.is_active and m.role='general_manager')
$$;
revoke all on function private.aqari_manager(uuid) from public,anon;
grant execute on function private.aqari_manager(uuid) to authenticated;
create policy controls_manager_read on public.aqari_workspace_controls for select to authenticated using(private.aqari_manager(workspace_id));
create policy control_audit_manager_read on public.aqari_control_audit for select to authenticated using(private.aqari_manager(workspace_id));

create function private.aqari_section_keys() returns text[] language sql immutable set search_path='' as $$
 select array['home','collections','properties','tenants','contracts','maintenance','finance','employees','partners','documents','notifications','reports']::text[]
$$;
create function private.aqari_state_section(k text) returns text language sql immutable set search_path='' as $$
 select case
 when k in ('properties','units','propertyFilesV202','propertyBankAccountsV267') then 'properties'
 when k in ('tenants','tenantProfilesV267','tenantDirectoryV202') then 'tenants'
 when k in ('leases','contractsV202','contractTemplatesV202') then 'contracts'
 when k in ('collections','rentLedgerV202','rentReceiptsV267','depositReceiptsV267','depositRefundsV267') then 'collections'
 when k in ('maintenance','maintenanceContracts','maintenanceRequestsV267') then 'maintenance'
 when k in ('expenses','services','invoices','accounts','bankAccounts','journalEntries','openingBalancesV267') then 'finance'
 when k in ('employees','payroll') then 'employees'
 when k in ('propertySharesV267','propertyPartnersV267','partnerDistributionsV267','partnerAdjustmentsV267','partnerReservesV267') then 'partners'
 when k in ('documents','documentsV267','documentArchiveV267') then 'documents'
 when k in ('notifications','reminders','notificationSettingsV267') then 'notifications'
 else 'administration' end
$$;
-- Definer is necessary to read the one controls row without exposing ACLs to members.
-- All subject choices come from auth.uid() and the real active membership.
create function private.aqari_can(w uuid,s text,a text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r text;cfg jsonb;v jsonb;allowed boolean;
begin
 if auth.uid() is null or a not in ('read','write') then return false;end if;
 select role::text into r from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active;
 if r is null then return false;end if;
 if s='administration' then return r='general_manager';end if;
 if not(s=any(private.aqari_section_keys())) then return false;end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=w;
 if r='general_manager' and a='read' then return true;end if;
 if coalesce((cfg#>>array['sections',s])::boolean,true)=false then return false;end if;
 if r='general_manager' then return true;end if;
 allowed:=case when a='read' then s not in ('partners','employees') or (r='accountant' and s='employees')
   when r='property_manager' then s in ('properties','tenants','contracts','maintenance','documents')
   when r='accountant' then s in ('collections','finance','employees','notifications') else false end;
 v:=cfg#>array['permissions','role:'||r,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 v:=cfg#>array['permissions','user:'||auth.uid()::text,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 -- Existing immutable role ceilings still apply; a viewer cannot become a writer here.
 if a='write' and (r='viewer' or (r='accountant' and s in ('properties','tenants','contracts','partners'))) then return false;end if;
 return allowed and (a='read' or private.aqari_can(w,s,'read'));
end $$;
revoke all on function private.aqari_section_keys(),private.aqari_state_section(text),private.aqari_can(uuid,text,text) from public,anon;
grant execute on function private.aqari_can(uuid,text,text) to authenticated;

create function public.aqari_workspace_access(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;access jsonb:='{}';s text;r text;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 foreach s in array private.aqari_section_keys() loop
  access:=access||jsonb_build_object(s,jsonb_build_object('read',private.aqari_can(p_workspace_id,s,'read'),'write',private.aqari_can(p_workspace_id,s,'write')));
 end loop;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'role',r,'sections',coalesce(cfg->'sections','{}'),'permissions',access,'labels',coalesce(cfg->'labels','{}'));
end $$;
create function public.aqari_control_center(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb;
begin
 if not private.aqari_manager(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select to_jsonb(x) into c from public.aqari_workspace_controls x where workspace_id=p_workspace_id;
 return jsonb_build_object('control',coalesce(c,jsonb_build_object('workspace_id',p_workspace_id,'settings','{"sections":{},"permissions":{},"labels":{}}'::jsonb,'revision',0)),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'is_active',m.is_active,'display_name',p.display_name) order by m.created_at),'[]') from public.aqari_memberships m left join public.aqari_profiles p on p.user_id=m.user_id where m.workspace_id=p_workspace_id));
end $$;
create function public.aqari_save_controls(p_workspace_id uuid,p_settings jsonb,p_expected_revision bigint,p_reason text) returns bigint language plpgsql security definer set search_path='' as $$
declare old_row public.aqari_workspace_controls%rowtype;item record;subject record;section record;action record;lang record;label record;new_rev bigint;
begin
 if not private.aqari_manager(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 500 or p_settings is null or jsonb_typeof(p_settings)<>'object' or octet_length(p_settings::text)>65536 then raise exception 'INVALID_CONTROLS';end if;
 if not(p_settings ?& array['sections','permissions','labels']) then raise exception 'INVALID_CONTROLS';end if;
 for item in select * from jsonb_each(p_settings) loop if item.key not in ('sections','permissions','labels') or jsonb_typeof(item.value)<>'object' then raise exception 'INVALID_CONTROLS';end if;end loop;
 for item in select * from jsonb_each(p_settings->'sections') loop
  if not(item.key=any(private.aqari_section_keys())) or jsonb_typeof(item.value)<>'boolean' then raise exception 'INVALID_SECTION';end if;
 end loop;
 for subject in select * from jsonb_each(p_settings->'permissions') loop
  if subject.key not in ('role:property_manager','role:accountant','role:viewer') and not exists(select 1 from public.aqari_memberships where workspace_id=p_workspace_id and 'user:'||user_id::text=subject.key and role<>'general_manager' and is_active) then raise exception 'INVALID_SUBJECT';end if;
  if jsonb_typeof(subject.value)<>'object' then raise exception 'INVALID_PERMISSIONS';end if;
  for section in select * from jsonb_each(subject.value) loop
   if not(section.key=any(private.aqari_section_keys())) or jsonb_typeof(section.value)<>'object' then raise exception 'INVALID_PERMISSIONS';end if;
   for action in select * from jsonb_each(section.value) loop
    if action.key not in ('read','write') or jsonb_typeof(action.value)<>'boolean' then raise exception 'INVALID_PERMISSIONS';end if;
   end loop;
   if section.value->>'write'='true' and section.value->>'read'='false' then raise exception 'WRITE_REQUIRES_READ';end if;
  end loop;
 end loop;
 for lang in select * from jsonb_each(p_settings->'labels') loop
  if lang.key not in ('ar','en','hi','ur','ml') or jsonb_typeof(lang.value)<>'object' then raise exception 'INVALID_LANGUAGE';end if;
  for label in select * from jsonb_each(lang.value) loop
   if not(label.key=any(private.aqari_section_keys()||array['more','control_center','scan_document'])) or jsonb_typeof(label.value)<>'string' or length(btrim(label.value#>>'{}')) not between 1 and 80 or (label.value#>>'{}') ~ '[<>[:cntrl:]]' then raise exception 'INVALID_LABEL';end if;
  end loop;
 end loop;
 -- Lock workspace even before the first settings row: concurrent initial saves cannot overwrite.
 perform 1 from public.aqari_workspaces where id=p_workspace_id for update;
 select * into old_row from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 if coalesce(old_row.revision,0) is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 new_rev:=coalesce(old_row.revision,0)+1;
 insert into public.aqari_workspace_controls(workspace_id,settings,revision,updated_by) values(p_workspace_id,p_settings,new_rev,auth.uid())
 on conflict(workspace_id) do update set settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 insert into public.aqari_control_audit(workspace_id,actor_id,action,entity_ref,reason,before_value,after_value) values(p_workspace_id,auth.uid(),'controls.update',p_workspace_id::text,btrim(p_reason),old_row.settings,p_settings);
 return new_rev;
end $$;
revoke all on function public.aqari_workspace_access(uuid),public.aqari_control_center(uuid),public.aqari_save_controls(uuid,jsonb,bigint,text) from public,anon;
grant execute on function public.aqari_workspace_access(uuid),public.aqari_control_center(uuid),public.aqari_save_controls(uuid,jsonb,bigint,text) to authenticated;

-- Bulk state is manager-only. Other members get a filtered, explicit-key projection.
-- This closes the legacy bypass where a hidden menu still exposed all workspace JSON.
create function private.aqari_unwrap(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when p->>'format'='aqari-cloud-state-v1' then p#>'{snapshot,values,aqari_v30}' when p->>'schema'='aqari-local-snapshot-v1' then p#>'{values,aqari_v30}' else p end
$$;
create function public.aqari_read_state_v267(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row_data public.aqari_app_state%rowtype;d jsonb;filtered jsonb;
begin
 if not private.aqari_staff(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into row_data from public.aqari_app_state where workspace_id=p_workspace_id;
 if not found then return null;end if;
 d:=private.aqari_unwrap(row_data.payload);
 select coalesce(jsonb_object_agg(key,value),'{}') into filtered from jsonb_each(d) where private.aqari_can(p_workspace_id,private.aqari_state_section(key),'read');
 return jsonb_build_object('workspace_id',row_data.workspace_id,'payload',filtered,'revision',row_data.revision,'updated_by',row_data.updated_by,'updated_at',row_data.updated_at);
end $$;
create function public.aqari_save_state_v267(p_workspace_id uuid,p_payload jsonb,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.aqari_app_state%rowtype;old_data jsonb;incoming jsonb;k text;merged jsonb;r text;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null or r='viewer' then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into current_row from public.aqari_app_state where workspace_id=p_workspace_id for update;
 if not found or current_row.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 incoming:=private.aqari_unwrap(p_payload);old_data:=private.aqari_unwrap(current_row.payload);merged:=old_data;
 if incoming is null or jsonb_typeof(incoming)<>'object' then raise exception 'INVALID_STATE';end if;
 for k in select jsonb_object_keys(incoming) loop
  if k='audit' and r<>'general_manager' then continue;end if;
  if incoming->k is distinct from old_data->k then
   if not private.aqari_can(p_workspace_id,private.aqari_state_section(k),'write') then raise exception 'SECTION_WRITE_DENIED:%',k using errcode='42501';end if;
   merged:=jsonb_set(merged,array[k],incoming->k,true);
  end if;
 end loop;
 -- Absent keys are preserved, never treated as deletion of hidden data.
 update public.aqari_app_state set payload=merged where workspace_id=p_workspace_id;
 return public.aqari_read_state_v267(p_workspace_id);
end $$;
revoke all on function private.aqari_unwrap(jsonb),public.aqari_read_state_v267(uuid),public.aqari_save_state_v267(uuid,jsonb,bigint) from public,anon;
grant execute on function public.aqari_read_state_v267(uuid),public.aqari_save_state_v267(uuid,jsonb,bigint) to authenticated;
create policy v267_bulk_manager_only on public.aqari_app_state as restrictive for all to authenticated using(private.aqari_manager(workspace_id)) with check(private.aqari_manager(workspace_id));
create function private.aqari_guard_section_write() returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb;new_data jsonb;k text;
begin
 new_data:=private.aqari_unwrap(new.payload);old_data:=case when tg_op='INSERT' then '{}'::jsonb else private.aqari_unwrap(old.payload) end;
 for k in select jsonb_object_keys(coalesce(old_data,'{}')||coalesce(new_data,'{}')) loop
  if old_data->k is distinct from new_data->k and not private.aqari_can(new.workspace_id,private.aqari_state_section(k),'write') then raise exception 'SECTION_WRITE_DENIED:%',k using errcode='42501';end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_guard_section_write() from public,anon,authenticated;
create trigger aqari_section_write_guard before insert or update of payload on public.aqari_app_state for each row execute function private.aqari_guard_section_write();

-- Existing tenant ownership policies stay intact; staff access is narrowed per section.
alter policy staff_read on public.aqari_properties using(private.aqari_can(workspace_id,'properties','read'));
alter policy staff_read on public.aqari_units using(private.aqari_can(workspace_id,'properties','read'));
alter policy staff_read on public.aqari_tenants using(private.aqari_can(workspace_id,'tenants','read') or private.aqari_owns_tenant(workspace_id,id));
alter policy staff_read on public.aqari_leases using(private.aqari_can(workspace_id,'contracts','read') or private.aqari_owns_tenant(workspace_id,tenant_id));
alter policy staff_read on public.aqari_rent_payments using(private.aqari_can(workspace_id,'collections','read') or exists(select 1 from public.aqari_leases l where l.id=lease_id and private.aqari_owns_tenant(l.workspace_id,l.tenant_id)));
alter policy staff_read on public.aqari_notification_outbox using(private.aqari_can(workspace_id,'notifications','read'));
alter policy staff_read on public.aqari_operation_audit using(private.aqari_manager(workspace_id));
alter policy maintenance_read on public.aqari_maintenance_requests using(private.aqari_can(workspace_id,'maintenance','read') or private.aqari_owns_tenant(workspace_id,tenant_id));
alter policy maintenance_update on public.aqari_maintenance_requests using(private.aqari_can(workspace_id,'maintenance','write')) with check(private.aqari_can(workspace_id,'maintenance','write'));
-- A restrictive policy also guards the existing staff-or-tenant insert path.
create policy v267_maintenance_section on public.aqari_maintenance_requests as restrictive for insert to authenticated with check(private.aqari_can(workspace_id,'maintenance','write') or private.aqari_owns_tenant(workspace_id,tenant_id));
CREATE OR REPLACE FUNCTION public.aqari_startup_snapshot_v266(p_workspace_id uuid DEFAULT NULL::uuid, p_expected_role text DEFAULT NULL::text, p_include_payload boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member record;
  v_workspace record;
  v_profile record;
  v_app jsonb := null;
begin
  if v_uid is null then
    raise exception 'AQARI_ACCESS_DENIED' using errcode = '42501';
  end if;
  select m.workspace_id, m.user_id, m.role, m.is_active, m.created_at
    into v_member from public.aqari_memberships m
    where m.user_id = v_uid and m.is_active is true
      and (p_workspace_id is null or m.workspace_id = p_workspace_id)
      and (p_expected_role is null or m.role::text = p_expected_role)
    order by m.created_at, m.workspace_id limit 1;
  if not found then
    raise exception 'AQARI_ACCESS_DENIED' using errcode = '42501';
  end if;
  select w.id, w.name, w.slug, w.created_at into v_workspace
    from public.aqari_workspaces w where w.id = v_member.workspace_id;
  if not found then
    raise exception 'AQARI_ACCESS_DENIED' using errcode = '42501';
  end if;
  select p.user_id, p.display_name, p.created_at, p.updated_at into v_profile
    from public.aqari_profiles p where p.user_id = v_uid;
  if not found then
    raise exception 'AQARI_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_include_payload then
    v_app := public.aqari_read_state_v267(v_member.workspace_id);
  end if;
  return jsonb_build_object('user_id',v_uid,'membership',to_jsonb(v_member),
    'workspace',to_jsonb(v_workspace),'profile',to_jsonb(v_profile),'app_state',v_app);
end;
$function$;


-- Keep the direct reminder RPC subject to the same section permission.
create or replace function public.aqari_prepare_rent_reminders(p_workspace_id uuid,p_as_of date,p_grace_day integer) returns integer language plpgsql security definer set search_path='' as $$
begin
 if not private.aqari_can(p_workspace_id,'notifications','write') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return private.aqari_v267_prepare_reminders(p_workspace_id,p_as_of,p_grace_day);
end $$;
-- Do not expose the internal privileged implementation as a callable authenticated function.
revoke execute on function private.aqari_v267_prepare_reminders(uuid,date,integer) from authenticated;
