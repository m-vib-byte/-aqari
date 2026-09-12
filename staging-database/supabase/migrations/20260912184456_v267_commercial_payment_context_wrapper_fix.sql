-- The public wrapper performs the auth/role/property checks itself and is the
-- only authenticated entry point. The private data helper remains non-callable.
create or replace function public.aqari_commercial_payment_context(p_workspace_id uuid,p_lease_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prop uuid;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 select u.property_id into prop
 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where l.workspace_id=p_workspace_id and l.id=p_lease_id;
 if prop is null or not private.aqari_can_property(p_workspace_id,prop,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 return private.aqari_commercial_payment_context_data(p_workspace_id,p_lease_id);
end $$;
revoke all on function private.aqari_commercial_payment_context_data(uuid,uuid) from public,anon,authenticated;
revoke all on function public.aqari_commercial_payment_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_commercial_payment_context(uuid,uuid) to authenticated;
