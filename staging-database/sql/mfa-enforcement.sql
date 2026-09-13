-- AQARI V267 MFA enforcement primitives.
-- CODE ONLY: apply to isolated Staging before exercising sensitive write RPCs.
-- Sensitive actors must present AAL2 backed by a second-factor AMR event no older
-- than 15 minutes. Token refreshes and first-factor methods do not refresh this
-- window. A one-minute future-skew allowance is accepted for clock differences.
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

create function private.aqari_recent_second_factor_at() returns timestamptz
language sql stable security definer set search_path='' as $$
 select to_timestamp(max((amr_entry->>'timestamp')::double precision))
 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) as amr_entry
 where amr_entry->>'method' in ('totp','otp')
   and coalesce(amr_entry->>'timestamp','') ~ '^[0-9]+$'
$$;

create function private.aqari_require_sensitive_aal2(w uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare
 recent_second_factor_at timestamptz;
 evaluation_time timestamptz := statement_timestamp();
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 if private.aqari_sensitive_actor(w) then
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
   raise insufficient_privilege using message='MFA_REQUIRED';
  end if;

  select private.aqari_recent_second_factor_at() into recent_second_factor_at;
  if recent_second_factor_at is null
     or recent_second_factor_at < evaluation_time - interval '15 minutes'
     or recent_second_factor_at > evaluation_time + interval '1 minute' then
   raise insufficient_privilege using message='MFA_RECENT_REAUTH_REQUIRED';
  end if;
 end if;
end $$;

revoke all on function private.aqari_sensitive_actor(uuid),private.aqari_recent_second_factor_at(),private.aqari_require_sensitive_aal2(uuid) from public,anon,authenticated;
commit;
