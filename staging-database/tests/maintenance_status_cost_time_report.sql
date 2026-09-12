-- Rollback-only acceptance for G07-11: maintenance status, cost and time report.
begin;

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values('maintenance-report-manager@example.invalid','مدير تقرير الصيانة','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at)
values('f2678000-0000-4000-8000-000000000090','maintenance-report-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','f2678000-0000-4000-8000-000000000090',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('maintenance.report.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);

insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
values('f2678000-0000-4000-8000-000000000001',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-property','اختبار تقرير الصيانة','{"fixture":true}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,is_active)
values('f2678000-0000-4000-8000-000000000002',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-tenant','مستأجر تقرير الصيانة','987654321012','59999888',null,'{"fixture":true}',true);
insert into public.aqari_units(id,workspace_id,property_id,unit_no)
values('f2678000-0000-4000-8000-000000000003',current_setting('maintenance.report.workspace')::uuid,'f2678000-0000-4000-8000-000000000001','MR-1');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source)
values('f2678000-0000-4000-8000-000000000004',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-lease','f2678000-0000-4000-8000-000000000002','f2678000-0000-4000-8000-000000000003','MR-TEST-1','2026-01-01','2026-12-31',100,0,'draft','{"property":"اختبار تقرير الصيانة","unit":"MR-1"}','{"fixture":true}');
insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,request_type)
values('f2678000-0000-4000-8000-000000000005',current_setting('maintenance.report.workspace')::uuid,'f2678000-0000-4000-8000-000000000004','f2678000-0000-4000-8000-000000000002','اختبار معزول لتقرير الصيانة','plumbing');
update public.aqari_maintenance_requests set status='assigned',cost=12.345 where id='f2678000-0000-4000-8000-000000000005';
update public.aqari_maintenance_requests set status='in_progress' where id='f2678000-0000-4000-8000-000000000005';
update public.aqari_maintenance_requests set status='completed' where id='f2678000-0000-4000-8000-000000000005';

set local role authenticated;
do $$
declare w uuid:=current_setting('maintenance.report.workspace')::uuid;r jsonb;
begin
 r:=public.aqari_maintenance_report(w,current_date,current_date);
 if (r#>>'{summary,total_requests}')::int<>1 then raise exception 'REPORT_COUNT_WRONG:%',r;end if;
 if (r#>>'{summary,completed_requests}')::int<>1 then raise exception 'REPORT_COMPLETED_WRONG:%',r;end if;
 if (r#>>'{summary,total_cost}')::numeric<>12.345 then raise exception 'REPORT_COST_WRONG:%',r;end if;
 if r#>>'{requests,0,request_type}'<>'plumbing' or r#>>'{requests,0,status}'<>'completed' then raise exception 'REPORT_DETAIL_WRONG:%',r;end if;
 if r#>'{requests,0,response_minutes}' is null or r#>'{requests,0,resolution_minutes}' is null then raise exception 'REPORT_TIMING_MISSING:%',r;end if;
 begin
  perform public.aqari_maintenance_report(w,current_date+1,current_date);
  raise exception 'INVALID_RANGE_ACCEPTED';
 exception when invalid_parameter_value then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','f2678000-0000-4000-8000-000000000099',true);
do $$
declare w uuid:=current_setting('maintenance.report.workspace')::uuid;
begin
 begin
  perform public.aqari_maintenance_report(w,null,null);
  raise exception 'UNAUTHORIZED_REPORT_ACCEPTED';
 exception when insufficient_privilege then null;
 end;
end $$;

reset role;
rollback;
select 'PASS: maintenance report returns scoped status/cost/time metrics and rejects invalid range and unauthorized read; fixtures rolled back.' as result;
