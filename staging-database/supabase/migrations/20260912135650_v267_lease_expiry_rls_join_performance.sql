-- Read-only report. Invoke as the signed-in user; table RLS remains effective.
begin;
create or replace function public.aqari_lease_expiry_report(
 p_workspace_id uuid,p_status text default 'upcoming',p_days integer default 30,
 p_property_id uuid default null,p_search text default '',p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date:=(current_timestamp at time zone 'Asia/Kuwait')::date;q text;result jsonb;properties jsonb;
begin
 if auth.uid() is null or not coalesce(private.aqari_can(p_workspace_id,'reports','read'),false)
  or not coalesce(private.aqari_can(p_workspace_id,'contracts','read'),false) then
  raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_status is null or p_status not in ('upcoming','expired') or p_days is null or p_days not in (30,60,90)
  or p_offset is null or p_offset<0 or p_offset>1000000 or length(coalesce(p_search,''))>120 then
  raise exception 'INVALID_REPORT_FILTER' using errcode='22023';end if;
 if p_property_id is not null and not coalesce(private.aqari_can_property(p_workspace_id,p_property_id,'contracts','read'),false) then
  raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 q:=lower(translate(regexp_replace(btrim(coalesce(p_search,'')),'[ً-ٰٟـ]','','g'),'أإآٱى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','ااااي01234567890123456789'));
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') into properties
 from public.aqari_properties p where p.workspace_id=p_workspace_id and private.aqari_can_property(p_workspace_id,p.id,'contracts','read');
 -- Materialize each RLS-protected relation before joining it. Otherwise the
 -- planner can repeatedly evaluate nested row-policy functions across joins.
 with scoped_leases as materialized(
  select l.* from public.aqari_leases l where l.workspace_id=p_workspace_id and l.start_date<=today
   and private.aqari_can_lease(p_workspace_id,l.id,'contracts','read')
   and ((p_status='upcoming' and l.status='signed' and l.end_date between today and today+p_days)
    or (p_status='expired' and l.status in ('signed','expired') and l.end_date<today))
 ),scoped_units as materialized(
  select u.id,u.property_id,u.unit_no from public.aqari_units u where u.workspace_id=p_workspace_id
   and u.id in(select unit_id from scoped_leases) and (p_property_id is null or u.property_id=p_property_id)
 ),scoped_properties as materialized(
  select p.id,p.name from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id in(select property_id from scoped_units)
 ),scoped_tenants as materialized(
  select t.id,t.full_name from public.aqari_tenants t where t.workspace_id=p_workspace_id and t.id in(select tenant_id from scoped_leases)
 ),eligible as materialized(
  select l.id,l.contract_no,l.start_date,l.end_date,l.status,l.monthly_rent::text monthly_rent,
   p.id property_id,p.name property_name,u.unit_no,t.full_name tenant_name,l.end_date-today days_remaining
  from scoped_leases l join scoped_units u on u.id=l.unit_id join scoped_properties p on p.id=u.property_id join scoped_tenants t on t.id=l.tenant_id
  where true
   and (q='' or strpos(lower(translate(regexp_replace(concat_ws(' ',l.contract_no,p.name,u.unit_no,t.full_name),'[ً-ٰٟـ]','','g'),'أإآٱى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','ااااي01234567890123456789')),q)>0)
 ),page as(select * from eligible order by end_date,id limit 50 offset p_offset)
 select jsonb_build_object('as_of',today,'timezone','Asia/Kuwait','status',p_status,'days',p_days,
  'property_id',p_property_id,'search',coalesce(p_search,''),'offset',p_offset,'page_size',50,'total',(select count(*) from eligible),
  'rows',coalesce((select jsonb_agg(to_jsonb(page) order by end_date,id) from page),'[]'),'properties',properties) into result;
 return result;
end $$;
revoke all on function public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) to authenticated;
commit;

