-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Rollback-only acceptance for requirement 80: maintenance status, cost and time report.
begin;
insert into public.aqari_workspaces(id,slug,name) values('f2678000-0000-4000-8000-000000000080','aqari-v267-maintenance-report-test','Synthetic maintenance report acceptance');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values('maintenance-report-manager@example.invalid','مدير تقرير الصيانة','general_manager','aqari-v267-maintenance-report-test');
insert into auth.users(id,email,email_confirmed_at)
values('f2678000-0000-4000-8000-000000000090','maintenance-report-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','f2678000-0000-4000-8000-000000000090',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('maintenance.report.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);

insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
values('f2678000-0000-4000-8000-000000000001',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-property','اختبار تقرير الصيانة','{"fixture":true}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,is_active)
values('f2678000-0000-4000-8000-000000000002',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-tenant','مستأجر تقرير الصيانة','987654321012','59999888',null,'{"fixture":true}',true);
insert into public.aqari_units(id,workspace_id,property_id,unit_no)
values('f2678000-0000-4000-8000-000000000003',current_setting('maintenance.report.workspace')::uuid,'f2678000-0000-4000-8000-000000000001','MR-1');
do $$declare r jsonb;begin
 r:=public.aqari_unit_readiness_register(current_setting('maintenance.report.workspace')::uuid,'record',jsonb_build_object(
 'id',gen_random_uuid(),'property_id','f2678000-0000-4000-8000-000000000001','unit_no','MR-1','expected_revision',0,
 'state','ready','inspected_on','2026-01-01','source_ref','Synthetic report inspection','reason','Isolated report readiness'));
 if r->>'state' is distinct from 'ready' then raise exception 'REPORT_FIXTURE_NOT_READY';end if;
end $$;
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source)
values('f2678000-0000-4000-8000-000000000004',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-lease','f2678000-0000-4000-8000-000000000002','f2678000-0000-4000-8000-000000000003','MR-TEST-1','2026-01-01','2026-12-31',100,0,'draft','{"property":"اختبار تقرير الصيانة","unit":"MR-1"}','{"fixture":true}');
insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description)
values('f2678000-0000-4000-8000-000000000005',current_setting('maintenance.report.workspace')::uuid,'f2678000-0000-4000-8000-000000000004','f2678000-0000-4000-8000-000000000002','اختبار معزول لتقرير الصيانة');
update public.aqari_maintenance_requests set status='assigned',cost=12.345 where id='f2678000-0000-4000-8000-000000000005';
update public.aqari_maintenance_requests set status='in_progress' where id='f2678000-0000-4000-8000-000000000005';
update public.aqari_maintenance_requests set status='completed' where id='f2678000-0000-4000-8000-000000000005';

-- Old plain-text and malformed audit entries must not break report reads.
insert into public.aqari_operation_audit(workspace_id,user_id,action,revision)
select current_setting('maintenance.report.workspace')::uuid,auth.uid(),v,1
from unnest(array['legacy plain text','{malformed legacy audit','{"operation":"unrelated","status":"completed"}','[]']) v;
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
values('f2678000-0000-4000-8000-000000000011',current_setting('maintenance.report.workspace')::uuid,'maintenance-report-outside','Outside assigned property','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values('maintenance-report-scoped@example.invalid','Synthetic scoped maintenance reader','property_manager','aqari-v267-maintenance-report-test');
insert into auth.users(id,email,email_confirmed_at)
values('f2678000-0000-4000-8000-000000000091','maintenance-report-scoped@example.invalid',now());
insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by)
values(current_setting('maintenance.report.workspace')::uuid,'f2678000-0000-4000-8000-000000000091','maintenance',array['f2678000-0000-4000-8000-000000000011'::uuid],true,auth.uid());
set local role authenticated;
do $$
declare w uuid:=current_setting('maintenance.report.workspace')::uuid;r jsonb;
begin
 if public.aqari_workspace_access(w)#>>'{features,maintenance_report}' is distinct from 'true' then raise exception 'REPORT_NOT_DISCOVERABLE';end if;
 r:=public.aqari_maintenance_status_report(w,(now() at time zone 'Asia/Kuwait')::date,(now() at time zone 'Asia/Kuwait')::date);
 if (r#>>'{summary,total_requests}')::int is distinct from 1 then raise exception 'REPORT_COUNT_WRONG:%',r;end if;
 if (r#>>'{summary,completed_requests}')::int is distinct from 1 then raise exception 'REPORT_COMPLETED_WRONG:%',r;end if;
 if (r#>>'{summary,total_cost}')::numeric is distinct from 12.345 then raise exception 'REPORT_COST_WRONG:%',r;end if;
 if r#>>'{requests,0,request_type}' is not null or r#>>'{requests,0,status}' is distinct from 'completed' then raise exception 'REPORT_DETAIL_WRONG:%',r;end if;
 if r#>>'{requests,0,response_minutes}' is null or r#>>'{requests,0,resolution_minutes}' is null then raise exception 'REPORT_TIMING_MISSING:%',r;end if;
 begin
  perform public.aqari_maintenance_status_report(w,current_date+1,current_date);
  raise exception 'INVALID_RANGE_ACCEPTED';
 exception when invalid_parameter_value then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','f2678000-0000-4000-8000-000000000091',true);
do $$declare r jsonb;begin
 r:=public.aqari_maintenance_status_report(current_setting('maintenance.report.workspace')::uuid,null,null);
 if r#>>'{summary,total_requests}' is distinct from '0' or r->'requests' is distinct from '[]'::jsonb
  then raise exception 'REPORT_PROPERTY_SCOPE_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','f2678000-0000-4000-8000-000000000099',true);
do $$
declare w uuid:=current_setting('maintenance.report.workspace')::uuid;
begin
 begin
  perform public.aqari_maintenance_status_report(w,null,null);
  raise exception 'UNAUTHORIZED_REPORT_ACCEPTED';
 exception when insufficient_privilege then null;
 end;
end $$;

reset role;
rollback;
select 'PASS: maintenance report returns scoped status/cost/time metrics and rejects invalid range and unauthorized read; fixtures rolled back.' as result;
