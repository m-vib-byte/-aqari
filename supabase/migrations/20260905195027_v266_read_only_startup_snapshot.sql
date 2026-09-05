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
