-- Run only in an independently verified development target, after staff-property-scope.sql
-- and financial-register.sql. Does not create accounts, assignments or business records.
begin;
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
   'maintenance_report',private.aqari_can(p_workspace_id,'reports','read') and private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_maintenance_report(uuid,date,date)') is not null,
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
