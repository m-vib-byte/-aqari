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
