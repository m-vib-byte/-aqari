-- AQARI V267 MFA enforcement primitives.
-- CODE ONLY: apply to isolated Staging before exercising sensitive write RPCs.
begin;
create function private.aqari_sensitive_actor(w uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.aqari_memberships m
  left join private.aqari_staff_assignments s on s.workspace_id=m.workspace_id and s.user_id=m.user_id and s.is_active
  where m.workspace_id=w and m.user_id=auth.uid() and m.is_active
   and (m.role::text in ('owner','general_manager','accountant') or s.operational_role='accountant')
 )
$$;
create function private.aqari_require_sensitive_aal2(w uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 if private.aqari_sensitive_actor(w) and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
  raise insufficient_privilege using message='MFA_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_sensitive_actor(uuid),private.aqari_require_sensitive_aal2(uuid) from public,anon,authenticated;
commit;
