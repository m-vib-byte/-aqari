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
 with eligible as materialized(
  select l.id,l.contract_no,l.start_date,l.end_date,l.status,l.monthly_rent::text monthly_rent,
   p.id property_id,p.name property_name,u.unit_no,t.full_name tenant_name,l.end_date-today days_remaining
  from public.aqari_leases l
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
  join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
  where l.workspace_id=p_workspace_id and l.start_date<=today and private.aqari_can_lease(p_workspace_id,l.id,'contracts','read')
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
revoke all on function public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer) to authenticated;
create or replace function public.aqari_workspace_access(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;access jsonb:='{}';s text;r text;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 foreach s in array private.aqari_section_keys() loop
  access:=access||jsonb_build_object(s,jsonb_build_object('read',private.aqari_can(p_workspace_id,s,'read'),'write',private.aqari_can(p_workspace_id,s,'write')));
 end loop;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'role',r,
  'sections',coalesce(cfg->'sections','{}'),'permissions',access,'labels',coalesce(cfg->'labels','{}'),
  'features',jsonb_build_object(
   'lease_expiry_report',private.aqari_can(p_workspace_id,'reports','read') and private.aqari_can(p_workspace_id,'contracts','read') and to_regprocedure('public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer)') is not null,
   'staff_circulars',to_regprocedure('public.aqari_staff_circulars(uuid,text,jsonb)') is not null,
   'final_gap_register',r='general_manager' and to_regprocedure('public.aqari_final_gap_register(uuid,text,jsonb)') is not null,
   'official_documents',r='general_manager' and to_regprocedure('public.aqari_official_document_register(uuid,text,jsonb)') is not null and to_regprocedure('public.aqari_official_document_context(uuid,text,uuid,uuid,jsonb)') is not null,
   'external_integrations',r='general_manager' and to_regprocedure('public.aqari_external_integrations(uuid,text,jsonb)') is not null,
   'financial_archive',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_archive(uuid,text)') is not null,
   'compliance_register',r='general_manager' and to_regprocedure('public.aqari_compliance_register(uuid,text,text,jsonb)') is not null,
   'kpi_dashboard',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_kpi_dashboard(uuid,date,date)') is not null,
   'maintenance_plans',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_maintenance_plans(uuid,text,jsonb)') is not null,
   'operations_register',r='general_manager' and to_regprocedure('public.aqari_operations_register(uuid,text,text,jsonb)') is not null,
   'unit_readiness',private.aqari_can(p_workspace_id,'properties','read') and to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null,
   'unit_meter_readings',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_unit_meter_register(uuid,text,jsonb)') is not null,
   'vacating_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_review(uuid,text,jsonb)') is not null,
   'vacating_settlement',private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_settlement(uuid,text,jsonb)') is not null,
   'exit_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and to_regprocedure('public.aqari_exit_review(uuid,text,jsonb)') is not null,
   'staff_access',r='general_manager' and to_regprocedure('public.aqari_staff_access(uuid,text,jsonb)') is not null,
   'financial_register',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_register(uuid,text,jsonb)') is not null,
   'deposit_register',private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_deposit_register(uuid,text,jsonb)') is not null));
end $$;
revoke all on function public.aqari_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.aqari_workspace_access(uuid) to authenticated;
commit;

