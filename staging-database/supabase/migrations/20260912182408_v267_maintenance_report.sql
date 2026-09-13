begin;

create or replace function private.aqari_maintenance_audit_status(p_action text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare j jsonb;
begin
  if p_action is null or left(ltrim(p_action),1)<>'{' then return null; end if;
  begin j:=p_action::jsonb; exception when others then return null; end;
  if j->>'operation' not in ('maintenance_INSERT','maintenance_UPDATE') then return null; end if;
  return j->>'status';
end $$;

revoke all on function private.aqari_maintenance_audit_status(text) from public,anon,authenticated;

create or replace function public.aqari_maintenance_report(
  p_workspace_id uuid,
  p_from date,
  p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare w uuid:=p_workspace_id; d1 date:=p_from; d2 date:=p_to; result jsonb;
begin
  if auth.uid() is null or not private.aqari_can(w,'maintenance','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  if d1 is null or d2 is null or d1>d2 or d2-d1>366 then
    raise exception 'INVALID_MAINTENANCE_REPORT_PERIOD' using errcode='22023';
  end if;

  with scoped as (
    select r.*,u.property_id,p.name property_name,
      (
        select min(a.created_at)
        from public.aqari_operation_audit a
        where a.workspace_id=w
          and private.aqari_maintenance_audit_status(a.action) in ('assigned','in_progress','completed','cancelled')
          and a.action like '%'||r.id::text||'%'
      ) first_response_at,
      (
        select min(a.created_at)
        from public.aqari_operation_audit a
        where a.workspace_id=w
          and private.aqari_maintenance_audit_status(a.action) in ('completed','cancelled')
          and a.action like '%'||r.id::text||'%'
      ) closed_at
    from public.aqari_maintenance_requests r
    join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
    join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
    join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
    where r.workspace_id=w
      and r.created_at::date between d1 and d2
      and private.aqari_can_property(w,u.property_id,'maintenance','read')
  ), by_status as (
    select status,count(*)::int count,coalesce(sum(cost),0)::numeric(15,3) cost
    from scoped group by status
  ), by_property as (
    select property_id,property_name,count(*)::int requests,coalesce(sum(cost),0)::numeric(15,3) cost
    from scoped group by property_id,property_name
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',d1,'to',d2),
    'summary',jsonb_build_object(
      'requests',(select count(*) from scoped),
      'cost',coalesce((select sum(cost) from scoped),0)::numeric(15,3),
      'average_response_minutes',(
        select case when count(first_response_at)=0 then null else round(avg(extract(epoch from (first_response_at-created_at))/60)::numeric,2) end from scoped
      ),
      'average_close_minutes',(
        select case when count(closed_at)=0 then null else round(avg(extract(epoch from (closed_at-created_at))/60)::numeric,2) end from scoped
      ),
      'timed_responses',(select count(first_response_at) from scoped),
      'timed_closures',(select count(closed_at) from scoped)
    ),
    'by_status',coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',count,'cost',cost) order by status) from by_status),'[]'::jsonb),
    'by_property',coalesce((select jsonb_agg(jsonb_build_object('property_id',property_id,'property_name',property_name,'requests',requests,'cost',cost) order by property_name,property_id) from by_property),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'request_no',request_no,'property_id',property_id,'property_name',property_name,
      'status',status,'cost',cost,'created_at',created_at,'updated_at',updated_at,
      'first_response_at',first_response_at,'closed_at',closed_at,
      'response_minutes',case when first_response_at is null then null else round((extract(epoch from (first_response_at-created_at))/60)::numeric,2) end,
      'close_minutes',case when closed_at is null then null else round((extract(epoch from (closed_at-created_at))/60)::numeric,2) end
    ) order by created_at desc,id) from scoped),'[]'::jsonb),
    'source','public.aqari_maintenance_requests + public.aqari_operation_audit'
  ) into result;
  return result;
end $$;

revoke all on function public.aqari_maintenance_report(uuid,date,date) from public,anon,authenticated;
grant execute on function public.aqari_maintenance_report(uuid,date,date) to authenticated;

commit;