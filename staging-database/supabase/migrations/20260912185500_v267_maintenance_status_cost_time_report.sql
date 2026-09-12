-- AQARI V267 Staging/reporting only. No Production or V266 mutation.
begin;

create or replace function public.aqari_maintenance_report(
 p_workspace_id uuid,
 p_from date default null,
 p_to date default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null
  or not private.aqari_can(p_workspace_id,'maintenance','read')
  or not private.aqari_can(p_workspace_id,'reports','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if p_from is not null and p_to is not null and p_to<p_from then
  raise invalid_parameter_value using message='INVALID_DATE_RANGE';
 end if;

 with scoped as (
  select r.id,r.request_no,r.workspace_id,r.lease_id,r.tenant_id,r.request_type,r.description,
         r.status,r.cost,r.created_at,r.updated_at,p.id as property_id,p.name as property_name,
         u.unit_no,t.full_name as tenant_name
  from public.aqari_maintenance_requests r
  join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
  join public.aqari_tenants t on t.workspace_id=r.workspace_id and t.id=r.tenant_id
  where r.workspace_id=p_workspace_id
   and private.aqari_can_property(p_workspace_id,p.id,'maintenance','read')
   and (p_from is null or (r.created_at at time zone 'Asia/Kuwait')::date>=p_from)
   and (p_to is null or (r.created_at at time zone 'Asia/Kuwait')::date<=p_to)
 ), metrics as (
  select s.*,
         ev.first_response_at,ev.completed_at,
         case when ev.first_response_at is null then null else
          round(greatest(0::numeric,(extract(epoch from (ev.first_response_at-s.created_at))/60.0)::numeric),1) end as response_minutes,
         case when ev.completed_at is null then null else
          round(greatest(0::numeric,(extract(epoch from (ev.completed_at-s.created_at))/60.0)::numeric),1) end as resolution_minutes
  from scoped s
  left join lateral (
   select
    min(a.created_at) filter(where parsed.j->>'previous_status'='received' and parsed.j->>'status' in('assigned','in_progress','completed')) as first_response_at,
    min(a.created_at) filter(where parsed.j->>'status'='completed') as completed_at
   from public.aqari_operation_audit a
   cross join lateral (select a.action::jsonb as j) parsed
   where a.workspace_id=s.workspace_id
    and a.action like '{%'
    and parsed.j->>'operation'='maintenance_update'
    and parsed.j->>'request_id'=s.id::text
  ) ev on true
 )
 select jsonb_build_object(
  'from',p_from,
  'to',p_to,
  'summary',jsonb_build_object(
   'total_requests',count(*),
   'open_requests',count(*) filter(where status in('received','assigned','in_progress')),
   'completed_requests',count(*) filter(where status='completed'),
   'cancelled_requests',count(*) filter(where status='cancelled'),
   'total_cost',coalesce(sum(cost),0),
   'average_response_minutes',round(avg(response_minutes),1),
   'average_resolution_minutes',round(avg(resolution_minutes),1)
  ),
  'statuses',coalesce((
   select jsonb_object_agg(x.status,jsonb_build_object('count',x.count,'cost',x.cost) order by x.status)
   from (
    select status,count(*) as count,coalesce(sum(cost),0) as cost
    from metrics group by status
   ) x
  ),'{}'::jsonb),
  'truncated',count(*)>500,
  'requests',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',q.id,'request_no',q.request_no,'request_type',q.request_type,'status',q.status,'cost',q.cost,
    'property_id',q.property_id,'property_name',q.property_name,'unit_no',q.unit_no,'tenant_name',q.tenant_name,
    'created_at',q.created_at,'updated_at',q.updated_at,
    'first_response_at',q.first_response_at,'completed_at',q.completed_at,
    'response_minutes',q.response_minutes,'resolution_minutes',q.resolution_minutes
   ) order by q.created_at desc,q.request_no desc)
   from (select * from metrics order by created_at desc,request_no desc limit 500) q
  ),'[]'::jsonb)
 ) into result
 from metrics;

 return result;
end $$;

revoke all on function public.aqari_maintenance_report(uuid,date,date) from public,anon;
grant execute on function public.aqari_maintenance_report(uuid,date,date) to authenticated;

commit;
