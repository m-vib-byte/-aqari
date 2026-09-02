-- Aqari V167: minimum secure cloud identity model.
-- Apply only to the Aqari Supabase project after reviewing the role assignments.

create type public.aqari_role as enum (
  'general_manager',
  'accountant',
  'collections',
  'maintenance',
  'property_manager',
  'viewer'
);

create table public.aqari_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  role public.aqari_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table public.aqari_profiles from anon;
grant select, insert, update on table public.aqari_profiles to authenticated;
grant all on table public.aqari_profiles to service_role;

alter table public.aqari_profiles enable row level security;

create policy "profiles_select_own"
on public.aqari_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_insert_own"
on public.aqari_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id and role = 'viewer');

create policy "profiles_update_own_safe_fields"
on public.aqari_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke update (role, is_active, user_id, created_at)
on public.aqari_profiles
from authenticated;

create index aqari_profiles_active_role_idx
on public.aqari_profiles (is_active, role);

