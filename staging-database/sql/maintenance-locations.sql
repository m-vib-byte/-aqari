-- V267 independently verified isolated target only, after staff-property-scope.sql.
-- Read-only metadata projection: no new table access, role grants or business writes.
begin;
create function private.aqari_maintenance_locations(p_workspace_id uuid,p_request_ids uuid[])
returns table(request_id uuid,property_name text,unit_no text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.aqari_can(p_workspace_id,'maintenance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if p_request_ids is null or cardinality(p_request_ids)>50
  or coalesce(array_ndims(p_request_ids),1)<>1 or array_position(p_request_ids,null) is not null
  or cardinality(p_request_ids)<>(select count(distinct x) from unnest(p_request_ids)x) then
  raise invalid_parameter_value using message='INVALID_MAINTENANCE_REQUEST_IDS';
 end if;
 -- Missing, other-workspace and out-of-assignment IDs all fail identically.
 -- A partial result must never let the client retain a revoked location or draft.
 if cardinality(p_request_ids)<>(select count(*) from public.aqari_maintenance_requests r
  where r.workspace_id=p_workspace_id and r.id=any(p_request_ids)
   and private.aqari_can_lease(r.workspace_id,r.lease_id,'maintenance','read')) then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 return query
 select r.id,p.name,u.unit_no
 from public.aqari_maintenance_requests r
 join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
 join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
 where r.workspace_id=p_workspace_id and r.id=any(p_request_ids)
  and private.aqari_can_lease(r.workspace_id,r.lease_id,'maintenance','read');
end $$;
-- Only the small privileged lookup lives in the non-exposed schema. Its caller
-- still needs the explicit maintenance ACL above; no contract snapshot is returned.
revoke all on function private.aqari_maintenance_locations(uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_locations(uuid,uuid[]) to authenticated;
create function public.aqari_maintenance_locations(p_workspace_id uuid,p_request_ids uuid[])
returns table(request_id uuid,property_name text,unit_no text)
language sql stable security invoker set search_path='' as $$
 select request_id,property_name,unit_no
 from private.aqari_maintenance_locations(p_workspace_id,p_request_ids)
$$;
revoke all on function public.aqari_maintenance_locations(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.aqari_maintenance_locations(uuid,uuid[]) to authenticated;
commit;
