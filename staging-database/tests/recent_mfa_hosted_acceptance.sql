-- AQARI V267 hosted recent-MFA acceptance probe.
-- Run only against the isolated Preview/Staging Supabase project.
-- The transaction must roll back completely; Production is out of scope.

begin;

insert into public.aqari_workspaces(id,slug,name)
values (
  '76760000-0000-4000-8000-000000000099',
  'recent-mfa-hosted-fixture',
  'Synthetic recent MFA acceptance'
);

insert into public.aqari_app_state(workspace_id,payload)
values ('76760000-0000-4000-8000-000000000099','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values (
  'recent-mfa-hosted-manager@example.invalid',
  'مدير اختبار MFA حديث',
  'general_manager',
  'recent-mfa-hosted-fixture'
);

insert into auth.users(id,email,email_confirmed_at)
values (
  '76760000-0000-4000-8000-000000000001',
  'recent-mfa-hosted-manager@example.invalid',
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '76760000-0000-4000-8000-000000000001',
  true
);

-- AAL2 alone is not enough: a recent supported second-factor AMR event is required.
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$
begin
  begin
    perform private.aqari_require_sensitive_aal2('76760000-0000-4000-8000-000000000099');
    raise exception 'MISSING_AMR_WAS_ACCEPTED';
  exception when insufficient_privilege then
    if sqlerrm <> 'MFA_RECENT_REAUTH_REQUIRED' then raise; end if;
  end;
end
$$;

-- A TOTP event outside the 15-minute freshness window must fail closed.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'aal','aal2',
    'amr',jsonb_build_array(
      jsonb_build_object(
        'method','totp',
        'timestamp',extract(epoch from now()-interval '16 minutes')::bigint
      )
    )
  )::text,
  true
);
do $$
begin
  begin
    perform private.aqari_require_sensitive_aal2('76760000-0000-4000-8000-000000000099');
    raise exception 'STALE_AMR_WAS_ACCEPTED';
  exception when insufficient_privilege then
    if sqlerrm <> 'MFA_RECENT_REAUTH_REQUIRED' then raise; end if;
  end;
end
$$;

-- A current TOTP event inside the freshness window is accepted.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'aal','aal2',
    'amr',jsonb_build_array(
      jsonb_build_object(
        'method','totp',
        'timestamp',extract(epoch from now())::bigint
      )
    )
  )::text,
  true
);
select private.aqari_require_sensitive_aal2('76760000-0000-4000-8000-000000000099');

rollback;

-- Must be zero after the transaction so the probe leaves no fixture behind.
select count(*)::int as fixture_workspaces_remaining
from public.aqari_workspaces
where id='76760000-0000-4000-8000-000000000099';
