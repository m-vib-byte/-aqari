-- AQARI V267 Staging: zero contract grace means no post-due grace days.
create or replace function private.aqari_effective_grace_days(w uuid,lid uuid,fallback integer) returns integer
language sql stable security definer set search_path='' as $$
 select greatest(0,least(366,coalesce((select t.grace_days from private.aqari_commercial_terms t where t.workspace_id=w and t.lease_id=lid),fallback,1)))
$$;
revoke all on function private.aqari_effective_grace_days(uuid,uuid,integer) from public,anon,authenticated;
