-- TARGET: djkpkkgoibruaezdrchb only. No accounts or grants are seeded.
-- Partner accounts have no staff membership in the same workspace.
create table private.aqari_partner_access (
 workspace_id uuid not null references public.aqari_workspaces(id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
 property_id uuid not null references public.aqari_properties(id),
 user_id uuid references auth.users(id),
 display_name text not null check(length(btrim(display_name)) between 1 and 120),
 is_active boolean not null default true,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,email,property_id)
);
create index aqari_partner_access_user on private.aqari_partner_access(user_id,workspace_id);
create index aqari_partner_access_property on private.aqari_partner_access(property_id);
create index aqari_partner_access_actor on private.aqari_partner_access(updated_by);
alter table private.aqari_partner_access enable row level security;
create policy partner_access_no_direct on private.aqari_partner_access for all to authenticated using(false) with check(false);
revoke all on private.aqari_partner_access from public,anon,authenticated;

create function private.aqari_partner_membership_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Serialize with provisioning of an existing account; revoked partner grants
 -- still cannot silently fall back to broad staff access.
 perform 1 from auth.users where id=new.user_id for update;
 if exists(select 1 from private.aqari_partner_access a where a.user_id=new.user_id and a.workspace_id=new.workspace_id) then
  raise exception 'PARTNER_STAFF_CONFLICT' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.aqari_partner_membership_guard() from public,anon,authenticated;
create trigger aqari_partner_membership_guard before insert or update on public.aqari_memberships
for each row execute function private.aqari_partner_membership_guard();

create function private.aqari_manage_partner_access(w uuid, email_address text, property uuid, partner_name text, enabled boolean, expected bigint, reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_email text:=lower(btrim(email_address)); target_user uuid; old_row private.aqari_partner_access%rowtype; saved private.aqari_partner_access%rowtype;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if target_email is null or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(target_email)>254
 or partner_name is null or length(btrim(partner_name)) not between 1 and 120 or enabled is null
 or reason is null or length(btrim(reason)) not between 3 and 500 or expected is null or expected<0 then raise exception 'INVALID_PARTNER_ACCESS';end if;
 perform 1 from public.aqari_workspaces where id=w for update;
 if not exists(select 1 from public.aqari_properties p where p.id=property and p.workspace_id=w) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select id into target_user from auth.users where lower(email)=target_email for update;
 if exists(select 1 from public.aqari_memberships m where m.user_id=target_user and m.workspace_id=w)
 or exists(select 1 from private.aqari_allowed_users a join public.aqari_workspaces x on x.slug=a.workspace_slug where a.email=target_email and x.id=w) then
  raise exception 'PARTNER_STAFF_CONFLICT' using errcode='42501';
 end if;
 select * into old_row from private.aqari_partner_access a where a.workspace_id=w and a.email=target_email and a.property_id=property;
 if coalesce(old_row.revision,0) is distinct from expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 insert into private.aqari_partner_access(workspace_id,email,property_id,user_id,display_name,is_active,revision,updated_by)
 values(w,target_email,property,target_user,btrim(partner_name),enabled,coalesce(old_row.revision,0)+1,auth.uid())
 on conflict(workspace_id,email,property_id) do update set user_id=excluded.user_id,display_name=excluded.display_name,is_active=excluded.is_active,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
 returning * into saved;
 insert into public.aqari_control_audit(workspace_id,actor_id,action,entity_ref,reason,before_value,after_value)
 values(w,auth.uid(),'partner.access',property::text,btrim(reason),to_jsonb(old_row),to_jsonb(saved));
 return to_jsonb(saved)-'updated_by';
end $$;

create function private.aqari_partner_access_list(w uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(a)-'updated_by' order by a.email,a.property_id) from private.aqari_partner_access a where a.workspace_id=w),'[]');
end $$;

create function private.aqari_partner_summary(property uuid default null, month_start date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account auth.users%rowtype; result jsonb; p public.aqari_properties%rowtype; scope_id uuid;
begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into account from auth.users where id=auth.uid();
 if account.email_confirmed_at is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if property is null then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'workspace_id',x.workspace_id,'name',x.name) order by x.name,x.id),'[]') into result
  from public.aqari_properties x where exists(select 1 from private.aqari_partner_access a where a.property_id=x.id and a.workspace_id=x.workspace_id and a.user_id=auth.uid() and a.email=lower(account.email) and a.is_active)
  and not exists(select 1 from public.aqari_memberships m where m.user_id=auth.uid() and m.workspace_id=x.workspace_id);
  return jsonb_build_object('user_id',auth.uid(),'properties',result);
 end if;
 select a.workspace_id into scope_id from private.aqari_partner_access a where a.property_id=property and a.user_id=auth.uid() and a.email=lower(account.email) and a.is_active
 and not exists(select 1 from public.aqari_memberships m where m.user_id=auth.uid() and m.workspace_id=a.workspace_id);
 if scope_id is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if month_start is null or month_start<>date_trunc('month',month_start)::date or month_start not between date '2000-01-01' and date '2100-12-01' then raise exception 'INVALID_MONTH';end if;
 select * into strict p from public.aqari_properties where id=property and workspace_id=scope_id;
 return jsonb_build_object('user_id',auth.uid(),'workspace_id',scope_id,'property_id',p.id,'name',p.name,'month',month_start,
 'unit_count',(select count(*) from public.aqari_units u where u.workspace_id=scope_id and u.property_id=p.id),
 'draft_leases',(select count(*) from public.aqari_leases l join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id where l.workspace_id=scope_id and u.property_id=p.id and l.status='draft'),
 'receipt_count',(select count(*) from public.aqari_rent_payments r join public.aqari_leases l on l.id=r.lease_id and l.workspace_id=r.workspace_id join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id where r.workspace_id=scope_id and u.property_id=p.id and r.paid_at>=month_start and r.paid_at<(month_start+interval '1 month')::date),
 'recorded_receipts',(select coalesce(sum(r.amount),0) from public.aqari_rent_payments r join public.aqari_leases l on l.id=r.lease_id and l.workspace_id=r.workspace_id join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id where r.workspace_id=scope_id and u.property_id=p.id and r.paid_at>=month_start and r.paid_at<(month_start+interval '1 month')::date));
end $$;

-- Preserve staff and tenant signup; add only pre-authorized partner signup.
create or replace function private.aqari_handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare allowed private.aqari_allowed_users%rowtype;w uuid;t public.aqari_tenants%rowtype;partner_name text;
begin
 select a.display_name into partner_name from private.aqari_partner_access a where a.email=lower(btrim(coalesce(new.email,''))) and a.is_active order by a.updated_at desc limit 1;
 if partner_name is not null then
  if exists(select 1 from private.aqari_allowed_users where email=lower(new.email) and is_active) then raise exception 'PARTNER_STAFF_CONFLICT';end if;
  insert into public.aqari_profiles(user_id,display_name) values(new.id,partner_name);
  update private.aqari_partner_access set user_id=new.id where email=lower(new.email);
  return new;
 end if;
 select * into allowed from private.aqari_allowed_users where email=lower(btrim(coalesce(new.email,''))) and is_active;
 if found then
  select id into w from public.aqari_workspaces where slug=allowed.workspace_slug;
  if w is null then raise exception 'WORKSPACE_NOT_CONFIGURED';end if;
  insert into public.aqari_profiles(user_id,display_name) values(new.id,allowed.display_name);
  insert into public.aqari_memberships(workspace_id,user_id,role,is_active) values(w,new.id,allowed.role,true);
 else
  if (select count(*) from public.aqari_tenants where lower(email)=lower(new.email) and is_active)<>1 then raise exception 'EMAIL_NOT_AUTHORIZED' using errcode='28000';end if;
  select * into t from public.aqari_tenants where lower(email)=lower(new.email) and is_active;
  insert into public.aqari_profiles(user_id,display_name) values(new.id,t.full_name);
  insert into public.aqari_portal_accounts(user_id,workspace_id,tenant_id) values(new.id,t.workspace_id,t.id);
 end if;
 return new;
end $$;

-- Invoker wrappers expose only these constrained operations; private tables stay private.
create function public.aqari_manage_partner_access(p_workspace_id uuid,p_email text,p_property_id uuid,p_name text,p_enabled boolean,p_expected_revision bigint,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.aqari_manage_partner_access(p_workspace_id,p_email,p_property_id,p_name,p_enabled,p_expected_revision,p_reason)$$;
create function public.aqari_partner_access_list(p_workspace_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.aqari_partner_access_list(p_workspace_id)$$;
create function public.aqari_partner_summary(p_property_id uuid default null,p_month date default null) returns jsonb
language sql stable security invoker set search_path='' as $$select private.aqari_partner_summary(p_property_id,p_month)$$;
revoke all on function private.aqari_manage_partner_access(uuid,text,uuid,text,boolean,bigint,text),private.aqari_partner_access_list(uuid),private.aqari_partner_summary(uuid,date),public.aqari_manage_partner_access(uuid,text,uuid,text,boolean,bigint,text),public.aqari_partner_access_list(uuid),public.aqari_partner_summary(uuid,date) from public,anon;
grant execute on function private.aqari_manage_partner_access(uuid,text,uuid,text,boolean,bigint,text),private.aqari_partner_access_list(uuid),private.aqari_partner_summary(uuid,date),public.aqari_manage_partner_access(uuid,text,uuid,text,boolean,bigint,text),public.aqari_partner_access_list(uuid),public.aqari_partner_summary(uuid,date) to authenticated;
