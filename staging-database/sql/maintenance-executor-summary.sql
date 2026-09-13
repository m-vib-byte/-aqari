-- AQARI V267 Preview/Staging only. G08-04 executor visibility for maintenance desk.
begin;
create or replace function public.aqari_maintenance_executor_summary(
 p_workspace_id uuid,
 p_request_ids uuid[]
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;
 requested_count integer:=coalesce(cardinality(p_request_ids),0);
 visible_count integer;
begin
 if auth.uid() is null or not private.aqari_can(w,'maintenance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if requested_count<1 or requested_count>50 then
  raise exception 'INVALID_REQUEST_IDS' using errcode='22023';
 end if;
 if (select count(*) from (select distinct x from unnest(p_request_ids) x) q)<>requested_count then
  raise exception 'DUPLICATE_REQUEST_IDS' using errcode='22023';
 end if;
 select count(*) into visible_count
 from public.aqari_maintenance_requests r
 join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
 join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where r.workspace_id=w and r.id=any(p_request_ids)
   and private.aqari_can_property(w,u.property_id,'maintenance','read');
 if visible_count<>requested_count then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 return (
  select coalesce(jsonb_agg(jsonb_build_object(
   'request_id',r.id,
   'work_order_id',o.id,
   'order_no',o.order_no,
   'work_order_status',o.status,
   'vendor_id',v.id,
   'vendor_name',v.name,
   'approved_at',o.approved_at,
   'completed_at',o.completed_at,
   'approved_amount',o.approved_amount,
   'invoice_amount',o.invoice_amount
  ) order by r.request_no),'[]'::jsonb)
  from public.aqari_maintenance_requests r
  join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  left join private.aqari_work_orders o on o.workspace_id=r.workspace_id and o.maintenance_request_id=r.id
  left join private.aqari_vendors v on v.workspace_id=o.workspace_id and v.id=o.vendor_id
  where r.workspace_id=w and r.id=any(p_request_ids)
   and private.aqari_can_property(w,u.property_id,'maintenance','read')
 );
end $$;
revoke all on function public.aqari_maintenance_executor_summary(uuid,uuid[]) from public,anon;
grant execute on function public.aqari_maintenance_executor_summary(uuid,uuid[]) to authenticated;
commit;
