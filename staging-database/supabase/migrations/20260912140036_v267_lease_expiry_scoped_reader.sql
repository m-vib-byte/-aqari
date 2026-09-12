-- Read-only report with an explicitly validated workspace/property scope.
-- Public wrapper remains invoker; the guarded reader is in the private schema.
begin;
create or replace function private.aqari_lease_expiry_report(
 p_workspace_id uuid,p_status text default 'upcoming',p_days integer default 30,
 p_property_id uuid default null,p_search text default '',p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(current_timestamp at time zone 'Asia/Kuwait')::date;q text;result jsonb;properties jsonb;allowed uuid[];
begin
 if auth.uid() is null or not coalesce(private.aqari_can(p_workspace_id,'reports','read'),false)
  or not coalesce(private.aqari_can(p_workspace_id,'contracts','read'),false) then
  raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_status is null or p_status not in ('upcoming','expired') or p_days is null or p_days not in (30,60,90)
  or p_offset is null or p_offset<0 or p_offset>1000000 or length(coalesce(p_search,''))>120 then
  raise exception 'INVALID_REPORT_FILTER' using errcode='22023';end if;
 -- Validate the same property/contract permissions used by table policies once
 -- per property, then reuse that explicit scope for every returned row.
 select coalesce(array_agg(p.id),'{}'::uuid[]) into allowed from public.aqari_properties p
  where p.workspace_id=p_workspace_id and private.aqari_can_property(p_workspace_id,p.id,'contracts','read')
   and private.aqari_can_property(p_workspace_id,p.id,'properties','read');
 if p_property_id is not null and not(p_property_id=any(allowed)) then
  raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 q:=lower(translate(regexp_replace(btrim(coalesce(p_search,'')),'[ً-ٰٟـ]','','g'),'أإآٱى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','ااااي01234567890123456789'));
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') into properties
 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=any(allowed);
 with eligible as materialized(
  select l.id,l.contract_no,l.start_date,l.end_date,l.status,l.monthly_rent::text monthly_rent,
   p.id property_id,p.name property_name,u.unit_no,t.full_name tenant_name,l.end_date-today days_remaining
  from public.aqari_leases l
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
  join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
  where l.workspace_id=p_workspace_id and p.id=any(allowed) and l.start_date<=today
   and (p_property_id is null or p.id=p_property_id)
   and ((p_status='upcoming' and l.status='signed' and l.end_date between today and today+p_days)
    or (p_status='expired' and l.status in ('signed','expired') and l.end_date<today))
   and (q='' or strpos(lower(translate(regexp_replace(concat_ws(' ',l.contract_no,p.name,u.unit_no,t.full_name),'[ً-ٰٟـ]','','g'),'أإآٱى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','ااااي01234567890123456789')),q)>0)
 ),page as(select * from eligible order by end_date,id limit 50 offset p_offset)
 select jsonb_build_object('as_of',today,'timezone','Asia/Kuwait','status',p_status,'days',p_days,
  'property_id',p_property_id,'search',coalesce(p_search,''),'offset',p_offset,'page_size',50,'total',(select count(*) from eligible),
  'rows',coalesce((select jsonb_agg(to_jsonb(page) order by end_date,id) from page),'[]'),'properties',properties) into result;
 return result;
end $$;
revoke all on function private.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) from public,anon,authenticated;
grant execute on function private.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) to authenticated;
create or replace function public.aqari_lease_expiry_report(
 p_workspace_id uuid,p_status text default 'upcoming',p_days integer default 30,
 p_property_id uuid default null,p_search text default '',p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path='' as $$
 select private.aqari_lease_expiry_report(p_workspace_id,p_status,p_days,p_property_id,p_search,p_offset)
$$;
revoke all on function public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) to authenticated;
commit;

