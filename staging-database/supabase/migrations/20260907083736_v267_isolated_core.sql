-- TARGET: djkpkkgoibruaezdrchb ONLY. Fresh staging schema; no production data.
-- Aqari V168: workspace-scoped Supabase Auth, authorization, and cloud state.
-- The production migration was applied as version 20260902214925.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.aqari_role as enum (
  'general_manager',
  'property_manager',
  'accountant',
  'viewer'
);

revoke usage on type public.aqari_role from public, anon;
grant usage on type public.aqari_role to authenticated;

create table public.aqari_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.aqari_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.aqari_memberships (
  workspace_id uuid not null references public.aqari_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.aqari_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.aqari_app_state (
  workspace_id uuid primary key references public.aqari_workspaces(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index aqari_memberships_user_idx
  on public.aqari_memberships (user_id, is_active);

create table private.aqari_allowed_users (
  email text primary key check (email = lower(btrim(email))),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  role public.aqari_role not null,
  workspace_slug text not null references public.aqari_workspaces(slug) on update cascade on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function private.aqari_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.aqari_prepare_state_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  new.updated_by := auth.uid();

  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;

  return new;
end;
$$;

create or replace function private.aqari_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_user private.aqari_allowed_users%rowtype;
  target_workspace uuid;
begin
  select *
    into allowed_user
    from private.aqari_allowed_users
   where email = lower(btrim(coalesce(new.email, '')))
     and is_active = true;

  if not found then
    raise exception using
      errcode = '28000',
      message = 'This email is not authorized for Aqari.';
  end if;

  select id
    into target_workspace
    from public.aqari_workspaces
   where slug = allowed_user.workspace_slug;

  if target_workspace is null then
    raise exception using
      errcode = '23503',
      message = 'The Aqari workspace is not configured.';
  end if;

  insert into public.aqari_profiles (user_id, display_name)
  values (new.id, allowed_user.display_name)
  on conflict (user_id) do nothing;

  insert into public.aqari_memberships (workspace_id, user_id, role, is_active)
  values (target_workspace, new.id, allowed_user.role, true)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role, is_active = true;

  return new;
end;
$$;

revoke all on function private.aqari_touch_updated_at() from public, anon, authenticated;
revoke all on function private.aqari_prepare_state_write() from public, anon, authenticated;
revoke all on function private.aqari_handle_new_user() from public, anon, authenticated;

create trigger aqari_profiles_touch_updated_at
before update on public.aqari_profiles
for each row execute function private.aqari_touch_updated_at();

create trigger aqari_app_state_prepare_write
before insert or update on public.aqari_app_state
for each row execute function private.aqari_prepare_state_write();

create trigger aqari_auth_user_created
after insert on auth.users
for each row execute function private.aqari_handle_new_user();

insert into public.aqari_workspaces (name, slug)
values ('AQARI V267 — معاينة', 'aqari-v267-staging');

-- Authorized users are provisioned out-of-band in private.aqari_allowed_users.
-- Do not commit email addresses or other account identifiers to source control.

insert into public.aqari_app_state (workspace_id, payload)
select id, '{"properties":[],"tenants":[],"tenantProfilesV267":[],"contractsV202":[],"tenantDirectoryV202":[],"collections":[],"rentLedgerV202":[],"rentReceiptsV267":[]}'::jsonb
from public.aqari_workspaces
where slug = 'aqari-v267-staging';

alter table public.aqari_profiles enable row level security;
alter table public.aqari_profiles force row level security;
alter table public.aqari_workspaces enable row level security;
alter table public.aqari_workspaces force row level security;
alter table public.aqari_memberships enable row level security;
alter table public.aqari_memberships force row level security;
alter table public.aqari_app_state enable row level security;
alter table public.aqari_app_state force row level security;

create policy aqari_profiles_select_own
on public.aqari_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy aqari_profiles_update_own
on public.aqari_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy aqari_memberships_select_own
on public.aqari_memberships for select to authenticated
using ((select auth.uid()) = user_id);

create policy aqari_workspaces_select_member
on public.aqari_workspaces for select to authenticated
using (
  exists (
    select 1
    from public.aqari_memberships membership
    where membership.workspace_id = id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  )
);

create policy aqari_app_state_select_member
on public.aqari_app_state for select to authenticated
using (
  exists (
    select 1
    from public.aqari_memberships membership
    where membership.workspace_id = aqari_app_state.workspace_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  )
);

create policy aqari_app_state_insert_editor
on public.aqari_app_state for insert to authenticated
with check (
  exists (
    select 1
    from public.aqari_memberships membership
    where membership.workspace_id = aqari_app_state.workspace_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('general_manager', 'property_manager', 'accountant')
  )
);

create policy aqari_app_state_update_editor
on public.aqari_app_state for update to authenticated
using (
  exists (
    select 1
    from public.aqari_memberships membership
    where membership.workspace_id = aqari_app_state.workspace_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('general_manager', 'property_manager', 'accountant')
  )
)
with check (
  exists (
    select 1
    from public.aqari_memberships membership
    where membership.workspace_id = aqari_app_state.workspace_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('general_manager', 'property_manager', 'accountant')
  )
);

revoke all on table public.aqari_profiles from anon, authenticated;
revoke all on table public.aqari_workspaces from anon, authenticated;
revoke all on table public.aqari_memberships from anon, authenticated;
revoke all on table public.aqari_app_state from anon, authenticated;

grant select (user_id, display_name, created_at, updated_at)
  on public.aqari_profiles to authenticated;
grant update (display_name)
  on public.aqari_profiles to authenticated;
grant select (id, name, slug, created_at)
  on public.aqari_workspaces to authenticated;
grant select (workspace_id, user_id, role, is_active, created_at)
  on public.aqari_memberships to authenticated;
grant select (workspace_id, payload, revision, updated_by, updated_at)
  on public.aqari_app_state to authenticated;
grant insert (workspace_id, payload)
  on public.aqari_app_state to authenticated;
grant update (payload)
  on public.aqari_app_state to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;

-- Aqari V168: normalize effective privileges and add foreign-key indexes.
-- Applied to project qtavnufzbkdfeauyukot as migration 20260902215319.

revoke all on type public.aqari_role
from public, anon, authenticated, service_role;
grant usage on type public.aqari_role
to authenticated, service_role;

revoke all on table
  public.aqari_profiles,
  public.aqari_workspaces,
  public.aqari_memberships,
  public.aqari_app_state
from public, anon, authenticated, service_role;

grant select (user_id, display_name, created_at, updated_at)
  on public.aqari_profiles to authenticated;
grant update (display_name)
  on public.aqari_profiles to authenticated;
grant select (id, name, slug, created_at)
  on public.aqari_workspaces to authenticated;
grant select (workspace_id, user_id, role, is_active, created_at)
  on public.aqari_memberships to authenticated;
grant select (workspace_id, payload, revision, updated_by, updated_at)
  on public.aqari_app_state to authenticated;
grant insert (workspace_id, payload)
  on public.aqari_app_state to authenticated;
grant update (payload)
  on public.aqari_app_state to authenticated;

grant select, insert, update, delete
  on public.aqari_profiles,
     public.aqari_workspaces,
     public.aqari_memberships,
     public.aqari_app_state
  to service_role;

revoke all on table private.aqari_allowed_users
from public, anon, authenticated, service_role;

create index aqari_allowed_users_workspace_slug_idx
  on private.aqari_allowed_users (workspace_slug);

create index aqari_app_state_updated_by_idx
  on public.aqari_app_state (updated_by);

-- Read-only startup snapshot. The caller's JWT/RLS, not a privileged key,
-- controls every table read. Never return auth tokens or auth.users rows.
create or replace function public.aqari_startup_snapshot_v266(
  p_workspace_id uuid default null,
  p_expected_role text default null,
  p_include_payload boolean default true
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
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
    select jsonb_build_object('workspace_id',a.workspace_id,'payload',a.payload,
      'revision',a.revision,'updated_by',a.updated_by,'updated_at',a.updated_at)
      into v_app from public.aqari_app_state a where a.workspace_id = v_member.workspace_id;
  end if;
  return jsonb_build_object('user_id',v_uid,'membership',to_jsonb(v_member),
    'workspace',to_jsonb(v_workspace),'profile',to_jsonb(v_profile),'app_state',v_app);
end;
$$;
revoke all on function public.aqari_startup_snapshot_v266(uuid,text,boolean) from public, anon;
grant execute on function public.aqari_startup_snapshot_v266(uuid,text,boolean) to authenticated;
