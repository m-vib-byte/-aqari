-- V267 isolated Staging only. No memberships, accounts or grants are seeded.
begin;
create table private.aqari_staff_assignments(
 workspace_id uuid not null,user_id uuid not null,
 operational_role text not null check(operational_role in('collector','accountant','maintenance','property_manager','viewer')),
 property_ids uuid[] not null,is_active boolean not null,revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id),foreign key(workspace_id,user_id) references public.aqari_memberships(workspace_id,user_id),
 check(not is_active or cardinality(property_ids)>0)
);
create table private.aqari_staff_assignment_audit(
 id bigint generated always as identity primary key,workspace_id uuid not null,user_id uuid not null,
 actor_id uuid not null,actor_name text not null,recorded_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 3 and 500),before_snapshot jsonb,after_snapshot jsonb not null
);
create index aqari_staff_assignment_actor on private.aqari_staff_assignments(updated_by);
create index aqari_staff_assignment_audit_workspace on private.aqari_staff_assignment_audit(workspace_id,recorded_at desc);
alter table private.aqari_staff_assignments enable row level security;
alter table private.aqari_staff_assignment_audit enable row level security;
revoke all on private.aqari_staff_assignments,private.aqari_staff_assignment_audit from public,anon,authenticated;

create function private.aqari_staff_ceiling(r text,s text,a text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case when a='read' then
  case r when 'collector' then s in('home','properties','tenants','contracts','collections','documents','notifications','reports')
   when 'accountant' then s in('home','properties','tenants','contracts','collections','finance','documents','notifications','reports','employees')
   when 'maintenance' then s in('home','properties','maintenance','reports')
   when 'property_manager' then s in('home','properties','tenants','contracts','maintenance','documents','notifications','reports')
   when 'viewer' then s in('home','properties','tenants','contracts','maintenance','documents') else false end
 when a='write' then
  case r when 'collector' then s='collections'
   when 'accountant' then s in('collections','finance','employees')
   when 'maintenance' then s='maintenance'
   when 'property_manager' then s in('properties','tenants','contracts','maintenance','documents') else false end
 else false end,false)
$$;
revoke all on function private.aqari_staff_ceiling(text,text,text) from public,anon,authenticated;

create or replace function private.aqari_can(w uuid,s text,a text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare b text;r text;cfg jsonb;v jsonb;allowed boolean;
begin
 if auth.uid() is null or a not in('read','write') then return false;end if;
 select role::text into b from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active;
 if b is null then return false;end if;
 if s='administration' then return b='general_manager';end if;
 if not(s=any(private.aqari_section_keys())) then return false;end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=w;
 if b='general_manager' and a='read' then return true;end if;
 if coalesce((cfg#>>array['sections',s])::boolean,true)=false then return false;end if;
 if b='general_manager' then return true;end if;
 select operational_role into r from private.aqari_staff_assignments where workspace_id=w and user_id=auth.uid() and is_active and cardinality(property_ids)>0;
 if r is null or not private.aqari_staff_ceiling(r,s,a) then return false;end if;
 -- Membership and operational ceilings both survive every configured override.
 if a='write' and (b='viewer' or (b='accountant' and s in('properties','tenants','contracts','partners'))) then return false;end if;
 if a='read' and s='contracts' and (not private.aqari_can(w,'tenants','read') or not private.aqari_can(w,'properties','read')) then return false;end if;
 if a='read' and s='collections' and not private.aqari_can(w,'contracts','read') then return false;end if;
 allowed:=true;
 v:=cfg#>array['permissions','role:'||b,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 v:=cfg#>array['permissions','role:'||r,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 v:=cfg#>array['permissions','user:'||auth.uid()::text,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 return allowed and (a='read' or private.aqari_can(w,s,'read'));
end $$;

create function private.aqari_can_property(w uuid,p uuid,s text,a text) returns boolean
language sql stable security definer set search_path='' as $$
 select p is not null and private.aqari_can(w,s,a)
 and exists(select 1 from public.aqari_properties x where x.workspace_id=w and x.id=p)
 and (private.aqari_manager(w) or exists(select 1 from private.aqari_staff_assignments g
  where g.workspace_id=w and g.user_id=auth.uid() and g.is_active and p=any(g.property_ids)))
$$;
create function private.aqari_can_lease(w uuid,l uuid,s text,a text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aqari_leases x join public.aqari_units u on u.workspace_id=x.workspace_id and u.id=x.unit_id
  where x.workspace_id=w and x.id=l and private.aqari_can_property(w,u.property_id,s,a))
$$;
create function private.aqari_can_tenant(w uuid,t uuid,s text,a text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aqari_tenants q where q.workspace_id=w and q.id=t and private.aqari_can(w,s,a)
  and (private.aqari_manager(w) or exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.tenant_id=t and private.aqari_can_lease(w,l.id,s,a))))
$$;
revoke all on function private.aqari_can_property(uuid,uuid,text,text),private.aqari_can_lease(uuid,uuid,text,text),private.aqari_can_tenant(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.aqari_can_property(uuid,uuid,text,text),private.aqari_can_lease(uuid,uuid,text,text),private.aqari_can_tenant(uuid,uuid,text,text) to authenticated;

create function public.aqari_staff_access(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid;props uuid[];base text;effective text;enabled boolean;expected bigint;why text;who text;old_row private.aqari_staff_assignments%rowtype;saved private.aqari_staff_assignments%rowtype;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='list' then
  return jsonb_build_object('manager',true,
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.aqari_properties p where p.workspace_id=p_workspace_id),'[]'),
   'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',q.display_name,'role',m.role,'is_active',m.is_active) order by q.display_name) from public.aqari_memberships m join public.aqari_profiles q on q.user_id=m.user_id where m.workspace_id=p_workspace_id and m.role<>'general_manager'),'[]'),
   'assignments',coalesce((select jsonb_agg(to_jsonb(g)-'updated_by' order by g.updated_at desc) from private.aqari_staff_assignments g where g.workspace_id=p_workspace_id),'[]'),
   'audit',coalesce((select jsonb_agg(to_jsonb(q) order by q.id desc) from(select actor_name,recorded_at,reason,before_snapshot,after_snapshot,id from private.aqari_staff_assignment_audit where workspace_id=p_workspace_id order by id desc limit 100)q),'[]'));
 end if;
 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 if p_action is distinct from 'save' or jsonb_typeof(p_data) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in('user_id','operational_role','property_ids','is_active','revision','reason')) then raise exception 'بيانات صلاحية الموظف غير صالحة.';end if;
 uid:=(p_data->>'user_id')::uuid;effective:=p_data->>'operational_role';expected:=(p_data->>'revision')::bigint;why:=btrim(p_data->>'reason');
 if jsonb_typeof(p_data->'is_active') is distinct from 'boolean' or jsonb_typeof(p_data->'property_ids') is distinct from 'array'
  or expected is null or expected<0 or why is null or length(why) not between 3 and 500 then raise exception 'أكمل الحساب والعقارات وسبب التعديل ورقم المراجعة.';end if;
 enabled:=(p_data->>'is_active')::boolean;
 perform 1 from public.aqari_workspaces where id=p_workspace_id for update;
 select role::text into base from public.aqari_memberships where workspace_id=p_workspace_id and user_id=uid and is_active for update;
 if base is null or base='general_manager' then raise insufficient_privilege using message='اختر عضوية موظف نشطة؛ صلاحية المدير العام لا تتغير هنا.';end if;
 if not coalesce((base='accountant' and effective in('collector','accountant','viewer')) or (base='property_manager' and effective in('collector','maintenance','property_manager','viewer')) or (base='viewer' and effective='viewer'),false) then raise insufficient_privilege using message='الدور التشغيلي يتجاوز حدود عضوية الحساب الحالية.';end if;
 if exists(select 1 from private.aqari_partner_access where workspace_id=p_workspace_id and user_id=uid) then raise insufficient_privilege using message='PARTNER_STAFF_CONFLICT';end if;
 select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into props from jsonb_array_elements_text(p_data->'property_ids')x;
 if (enabled and cardinality(props)=0) or array_position(props,null) is not null then raise invalid_parameter_value using message='حدد عقاراً محفوظاً واحداً على الأقل للحساب النشط.';end if;
 if exists(select 1 from unnest(props)p where not exists(select 1 from public.aqari_properties where workspace_id=p_workspace_id and id=p)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into old_row from private.aqari_staff_assignments where workspace_id=p_workspace_id and user_id=uid for update;
 if coalesce(old_row.revision,0) is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT';end if;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,revision,updated_by)
 values(p_workspace_id,uid,effective,props,enabled,expected+1,auth.uid())
 on conflict(workspace_id,user_id) do update set operational_role=excluded.operational_role,property_ids=excluded.property_ids,is_active=excluded.is_active,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
 select display_name into who from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_staff_assignment_audit(workspace_id,user_id,actor_id,actor_name,reason,before_snapshot,after_snapshot)
 values(p_workspace_id,uid,auth.uid(),coalesce(who,auth.uid()::text),why,case when old_row.user_id is null then null else to_jsonb(old_row) end,to_jsonb(saved));
 return to_jsonb(saved)-'updated_by';
end $$;
revoke all on function public.aqari_staff_access(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_staff_access(uuid,text,jsonb) to authenticated;

-- Stable, property-attributable legacy rows only. Unknown shapes stay manager-only.
create function private.aqari_staff_state_key(k text) returns boolean language sql immutable set search_path='' as $$
 select k in('properties','tenants','tenantProfilesV267','leases','contractsV202','tenantDirectoryV202','collections','rentLedgerV202','rentReceiptsV267')
$$;
create function private.aqari_staff_row_id(k text,v jsonb) returns text language sql immutable set search_path='' as $$
 select nullif(case when k='properties' and jsonb_typeof(v)='array' then v->>0
  when k in('tenants','leases') and jsonb_typeof(v)='array' then v->>4
  when k='collections' and jsonb_typeof(v)='array' then v->>0
  when k='tenantDirectoryV202' and jsonb_typeof(v)='object' then case when nullif(v->>'property','') is not null and nullif(v->>'unit','') is not null then jsonb_build_array(v->>'property',v->>'unit')::text end
  when k='rentLedgerV202' and jsonb_typeof(v)='object' then coalesce(nullif(v->>'receiptNo',''),v->>'id')
  when k in('tenantProfilesV267','contractsV202','rentReceiptsV267') and jsonb_typeof(v)='object' then v->>'id' end,'')
$$;
create function private.aqari_staff_row_allowed(w uuid,k text,v jsonb,a text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare prop text;ref text;s text:=private.aqari_state_section(k);
begin
 if not private.aqari_staff_state_key(k) or private.aqari_staff_row_id(k,v) is null or not private.aqari_can(w,s,a) then return false;end if;
 if k in('tenantProfilesV267','tenants') then
  ref:=case when k='tenants' then v->>4 else v->>'id' end;
  return exists(select 1 from public.aqari_tenants t where t.workspace_id=w and t.external_ref=ref and private.aqari_can_tenant(w,t.id,s,a));
 elsif k='leases' then
  return exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.external_ref=v->>4 and private.aqari_can_lease(w,l.id,s,a));
 end if;
 prop:=case when k='properties' then v->>0 when k='collections' then v->>4 when k='rentReceiptsV267' then v#>>'{contract,property}' else v->>'property' end;
 return exists(select 1 from public.aqari_properties p where p.workspace_id=w and p.name=prop and private.aqari_can_property(w,p.id,s,a));
end $$;
revoke all on function private.aqari_staff_state_key(text),private.aqari_staff_row_id(text,jsonb),private.aqari_staff_row_allowed(uuid,text,jsonb,text) from public,anon,authenticated;

-- Keep the full original manager projection in a private implementation. The public
-- caller for staff receives only whitelisted rows and never owner financial state.
create function private.aqari_read_state_v267_unscoped(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row_data public.aqari_app_state%rowtype;d jsonb;filtered jsonb;source_properties jsonb;
begin
 if not private.aqari_staff(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into row_data from public.aqari_app_state where workspace_id=p_workspace_id;
 if not found then return null;end if;
 d:=private.aqari_unwrap(row_data.payload);
 -- Expose independently imported properties only to the manager with property-read access.
 -- Existing property rows and every other state key are preserved.
 if private.aqari_manager(p_workspace_id) and private.aqari_can(p_workspace_id,'properties','read') then
  select coalesce(jsonb_agg(jsonb_build_array(p.name,'غير مدون',(select count(*) from public.aqari_units u where u.workspace_id=p.workspace_id and u.property_id=p.id),(select sum((r->>'current_rent_kd')::numeric) from jsonb_array_elements(s.content->'rows') r))),'[]') into source_properties
  from public.aqari_properties p join lateral(select st.content from public.aqari_property_statements st where st.workspace_id=p.workspace_id and st.property_id=p.id order by st.period desc limit 1)s on true
  where p.workspace_id=p_workspace_id and not exists(select 1 from jsonb_array_elements(coalesce(d->'properties','[]')) r where r->>0=p.name);
  d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||source_properties);
 end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into filtered from jsonb_each(d) where private.aqari_can(p_workspace_id,private.aqari_state_section(key),'read');
 return jsonb_build_object('workspace_id',row_data.workspace_id,'payload',filtered,'revision',row_data.revision,'updated_by',row_data.updated_by,'updated_at',row_data.updated_at);
end $$;
revoke all on function private.aqari_read_state_v267_unscoped(uuid) from public,anon,authenticated;
create or replace function public.aqari_read_state_v267(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare saved public.aqari_app_state%rowtype;d jsonb;filtered jsonb:='{}';k text;rows jsonb;
begin
 if private.aqari_manager(p_workspace_id) then return private.aqari_read_state_v267_unscoped(p_workspace_id);end if;
 if auth.uid() is null or not private.aqari_can(p_workspace_id,'home','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into saved from public.aqari_app_state where workspace_id=p_workspace_id;if not found then return null;end if;d:=private.aqari_unwrap(saved.payload);
 for k in select jsonb_object_keys(d) loop
  if not private.aqari_staff_state_key(k) or not private.aqari_can(p_workspace_id,private.aqari_state_section(k),'read') or jsonb_typeof(d->k)<>'array' then continue;end if;
  select coalesce(jsonb_agg(v order by n),'[]') into rows from jsonb_array_elements(d->k) with ordinality q(v,n) where private.aqari_staff_row_allowed(p_workspace_id,k,v,'read');
  filtered:=jsonb_set(filtered,array[k],rows,true);
 end loop;
 return jsonb_build_object('workspace_id',saved.workspace_id,'payload',filtered,'revision',saved.revision,'updated_by',saved.updated_by,'updated_at',saved.updated_at);
end $$;
revoke all on function public.aqari_read_state_v267(uuid) from public,anon,authenticated;
grant execute on function public.aqari_read_state_v267(uuid) to authenticated;

create or replace function public.aqari_save_state_v267(p_workspace_id uuid,p_payload jsonb,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.aqari_app_state%rowtype;old_data jsonb;incoming jsonb;merged jsonb;k text;v jsonb;prior jsonb;combined jsonb;ident text;duplicates boolean;
begin
 if auth.uid() is null or not private.aqari_staff(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into saved from public.aqari_app_state where workspace_id=p_workspace_id for update;
 if not found or saved.revision is distinct from p_expected_revision then raise serialization_failure using message='REVISION_CONFLICT';end if;
 incoming:=private.aqari_unwrap(p_payload);old_data:=private.aqari_unwrap(saved.payload);merged:=old_data;
 if incoming is null or jsonb_typeof(incoming)<>'object' then raise exception 'INVALID_STATE';end if;
 for k in select jsonb_object_keys(incoming) loop
  if private.aqari_manager(p_workspace_id) then
   if incoming->k is distinct from old_data->k then
    if not private.aqari_can(p_workspace_id,private.aqari_state_section(k),'write') then raise insufficient_privilege using message='SECTION_WRITE_DENIED';end if;
    merged:=jsonb_set(merged,array[k],incoming->k,true);
   end if;continue;
  end if;
  -- Client audit decoration never substitutes for the server audit trail.
  if k='audit' then continue;end if;
  if not private.aqari_staff_state_key(k) or jsonb_typeof(incoming->k) is distinct from 'array' then raise insufficient_privilege using message='STAFF_STATE_KEY_DENIED';end if;
  if jsonb_typeof(coalesce(old_data->k,'[]'))<>'array' then raise insufficient_privilege using message='STAFF_STATE_KEY_DENIED';end if;
  select exists(select 1 from jsonb_array_elements(incoming->k)x group by private.aqari_staff_row_id(k,x) having count(*)>1) into duplicates;
  if duplicates then raise exception 'STAFF_DUPLICATE_ROW';end if;
  combined:=coalesce(old_data->k,'[]');
  for v in select value from jsonb_array_elements(incoming->k) loop
   ident:=private.aqari_staff_row_id(k,v);
   if ident is null or not private.aqari_staff_row_allowed(p_workspace_id,k,v,'read') then raise insufficient_privilege using message='STAFF_PROPERTY_DENIED';end if;
   select x into prior from jsonb_array_elements(coalesce(old_data->k,'[]'))x where private.aqari_staff_row_id(k,x)=ident;
   if prior=v then continue;end if;
   if not private.aqari_staff_row_allowed(p_workspace_id,k,v,'write') or (prior is not null and not private.aqari_staff_row_allowed(p_workspace_id,k,prior,'write')) then raise insufficient_privilege using message='STAFF_PROPERTY_DENIED';end if;
   -- A property assignment cannot opt out of contract approval and signed-file
   -- validation by submitting a legacy shape. Unchanged history stays readable.
   if k='contractsV202' and (v->>'source' is distinct from 'v267-cloud' or v->>'detailsVersion' is distinct from '2' or v->>'rentalTermsVersion' is distinct from '1') then
    raise insufficient_privilege using message='STAFF_CURRENT_CONTRACT_REQUIRED';
   end if;
   if prior is not null then
    select coalesce(jsonb_agg(case when private.aqari_staff_row_id(k,x)=ident then v else x end order by n),'[]') into combined from jsonb_array_elements(combined)with ordinality q(x,n);
   else combined:=combined||jsonb_build_array(v);end if;
  end loop;
  -- Omission is never deletion, including every row the caller could not see.
  merged:=jsonb_set(merged,array[k],combined,true);
 end loop;
 if not private.aqari_manager(p_workspace_id) and not private.aqari_can(p_workspace_id,'home','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 update public.aqari_app_state set payload=merged where workspace_id=p_workspace_id;
 return public.aqari_read_state_v267(p_workspace_id);
end $$;

-- Normalized reads and direct maintenance writes enforce the same property fence.
alter policy staff_read on public.aqari_properties using(private.aqari_can_property(workspace_id,id,'properties','read'));
alter policy staff_read on public.aqari_units using(private.aqari_can_property(workspace_id,property_id,'properties','read'));
alter policy staff_read on public.aqari_tenants using(private.aqari_can_tenant(workspace_id,id,'tenants','read') or private.aqari_owns_tenant(workspace_id,id));
alter policy staff_read on public.aqari_leases using(private.aqari_can_lease(workspace_id,id,'contracts','read') or private.aqari_owns_tenant(workspace_id,tenant_id));
alter policy staff_read on public.aqari_rent_payments using(private.aqari_can_lease(workspace_id,lease_id,'collections','read') or exists(select 1 from public.aqari_leases l where l.workspace_id=aqari_rent_payments.workspace_id and l.id=lease_id and private.aqari_owns_tenant(l.workspace_id,l.tenant_id)));
alter policy staff_read on public.aqari_notification_outbox using(private.aqari_can_lease(workspace_id,lease_id,'notifications','read'));
alter policy maintenance_read on public.aqari_maintenance_requests using(private.aqari_can_lease(workspace_id,lease_id,'maintenance','read') or private.aqari_owns_tenant(workspace_id,tenant_id));
alter policy maintenance_update on public.aqari_maintenance_requests using(private.aqari_can_lease(workspace_id,lease_id,'maintenance','write')) with check(private.aqari_can_lease(workspace_id,lease_id,'maintenance','write'));
create function private.aqari_staff_maintenance_insert(w uuid,l uuid,t uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aqari_leases x where x.workspace_id=w and x.id=l and x.tenant_id=t and x.status='signed'
  and (now() at time zone 'Asia/Kuwait')::date between x.start_date and x.end_date
  and (private.aqari_can_lease(w,l,'maintenance','write') or private.aqari_owns_tenant(w,t)))
$$;
revoke all on function private.aqari_staff_maintenance_insert(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.aqari_staff_maintenance_insert(uuid,uuid,uuid) to authenticated;
alter policy maintenance_insert on public.aqari_maintenance_requests with check(created_by=auth.uid() and status='received' and cost=0 and private.aqari_staff_maintenance_insert(workspace_id,lease_id,tenant_id));
alter policy v267_maintenance_section on public.aqari_maintenance_requests with check(private.aqari_staff_maintenance_insert(workspace_id,lease_id,tenant_id));
create function private.aqari_staff_maintenance_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.lease_id is distinct from old.lease_id or new.tenant_id is distinct from old.tenant_id or new.created_by is distinct from old.created_by then raise insufficient_privilege using message='MAINTENANCE_IDENTITY_IMMUTABLE';end if;return new;
end $$;
revoke all on function private.aqari_staff_maintenance_identity() from public,anon,authenticated;
create trigger aqari_maintenance_00_identity before update on public.aqari_maintenance_requests for each row execute function private.aqari_staff_maintenance_identity();
alter policy statement_link_read on public.aqari_statement_links using(private.aqari_can_property(workspace_id,property_id,'tenants','read') and private.aqari_can_property(workspace_id,property_id,'contracts','read'));
alter policy source_review_read on public.aqari_source_lease_reviews using(private.aqari_can_lease(workspace_id,lease_id,'contracts','read') and private.aqari_can_lease(workspace_id,lease_id,'documents','read'));
alter policy utility_meter_read on public.aqari_utility_meters using(private.aqari_can_property(workspace_id,property_id,'finance','read'));
alter policy utility_entry_read on public.aqari_utility_entries using(private.aqari_can_property(workspace_id,property_id,'finance','read'));
alter policy utility_entry_insert on public.aqari_utility_entries with check(private.aqari_can_property(workspace_id,property_id,'finance','write') and recorded_by=auth.uid() and entry_type in('reading','bill'));

create or replace function private.aqari_document_entity(w uuid,t text,r text,a text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if t='property' then return exists(select 1 from public.aqari_properties p where p.workspace_id=w and p.external_ref=r and private.aqari_can_property(w,p.id,'properties',a));
 elsif t='lease' then return exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.external_ref=r and private.aqari_can_lease(w,l.id,'contracts',a));
 elsif t='tenant' then
  -- A tenant document has no property column: only expose it when every linked
  -- property is authorized, rather than guessing which property owns the file.
  return exists(select 1 from public.aqari_tenants q where q.workspace_id=w and q.external_ref=r and private.aqari_can(w,'tenants',a)
   and (private.aqari_manager(w) or (exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.tenant_id=q.id)
    and not exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.tenant_id=q.id and not private.aqari_can_lease(w,l.id,'tenants',a)))));
 end if;return false;
end $$;
create or replace function public.aqari_contract_history(p_workspace_id uuid,p_contract_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.aqari_leases l where l.workspace_id=p_workspace_id and l.external_ref=p_contract_ref and private.aqari_can_lease(p_workspace_id,l.id,'contracts','read')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from(select * from private.aqari_contract_versions where workspace_id=p_workspace_id and contract_ref=p_contract_ref order by id desc limit 100)x),'[]');
end $$;
create or replace function private.aqari_hr_can(w uuid,props uuid[],action text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and action in('read','add','edit','approve_admin','approve_chairman')
 and private.aqari_can(w,'employees',case when action='read' then 'read' else 'write' end)
 and (private.aqari_manager(w) or exists(select 1 from private.aqari_hr_grants g where g.workspace_id=w and g.user_id=auth.uid()
  and cardinality(props)>0 and props <@ g.property_ids and (g.permissions->>'read')::boolean is true and (g.permissions->>action)::boolean is true
  and not exists(select 1 from unnest(props)p where not private.aqari_can_property(w,p,'employees',case when action='read' then 'read' else 'write' end))))
$$;
commit;
