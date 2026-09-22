-- LOCAL IN-MEMORY DATABASE ONLY. Synthetic identities and all data roll back.
-- Run after staff-property-scope.sql and staff-membership-ceiling.sql.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('membership-ceiling-manager@example.invalid','Synthetic ceiling manager','general_manager','aqari-v267-staging'),
 ('membership-ceiling-accountant@example.invalid','Synthetic ceiling accountant','accountant','aqari-v267-staging'),
 ('membership-ceiling-unassigned@example.invalid','Synthetic unassigned accountant','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('79400000-0000-4000-8000-000000000001','membership-ceiling-manager@example.invalid',now()),
 ('79400000-0000-4000-8000-000000000002','membership-ceiling-accountant@example.invalid',now()),
 ('79400000-0000-4000-8000-000000000003','membership-ceiling-unassigned@example.invalid',now());
select set_config('aqari.test.ceiling.workspace',(select workspace_id::text from public.aqari_memberships where user_id='79400000-0000-4000-8000-000000000001'),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('79400000-0000-4000-8000-000000000011',current_setting('aqari.test.ceiling.workspace')::uuid,'membership-ceiling-a','Synthetic ceiling property A','{}'),
 ('79400000-0000-4000-8000-000000000012',current_setting('aqari.test.ceiling.workspace')::uuid,'membership-ceiling-b','Synthetic ceiling property B','{}');
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;begin
 perform public.aqari_staff_access(w,'save','{"user_id":"79400000-0000-4000-8000-000000000002","operational_role":"accountant","property_ids":["79400000-0000-4000-8000-000000000011"],"is_active":true,"revision":0,"reason":"Synthetic scope for runtime membership downgrade test"}');
 perform public.aqari_hr(w,'grant','{"user_id":"79400000-0000-4000-8000-000000000002","property_ids":["79400000-0000-4000-8000-000000000011"],"revision":0,"permissions":{"read":true,"add":true,"edit":true,"approve_admin":true,"approve_chairman":false}}');
 perform public.aqari_hr(w,'save_employee','{"employee_id":"79400000-0000-4000-8000-000000000021","revision":0,"property_ids":["79400000-0000-4000-8000-000000000011"],"basic":"100","allowances":"0","hired_on":"2026-01-01","status":"active","profile":{"name_ar":"موظف اختبار","name_en":"Synthetic employee","civil_id":"794000000001","passport":"CEILING-1","nationality":"اختبار","phone":"79400001","job_ar":"محاسب اختبار","job_en":"Synthetic accountant","work_location":"Synthetic property A"}}');
end $$;
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;p uuid:='79400000-0000-4000-8000-000000000011';begin
 if not private.aqari_can_property(w,p,'finance','write') or jsonb_array_length(public.aqari_hr(w,'list')->'employees')<>1 or not (public.aqari_hr(w,'get','{"employee_id":"79400000-0000-4000-8000-000000000021"}')#>>'{permissions,edit}')::boolean then raise exception 'VALID_ACCOUNTANT_SCOPE_LOST';end if;
 if private.aqari_can_property(w,'79400000-0000-4000-8000-000000000012','finance','read') then raise exception 'FOREIGN_PROPERTY_EXPOSED';end if;
end $$;
reset role;
-- Every role and per-user override explicitly allows these sections. The current
-- membership ceiling must still prevail over a previously valid stored assignment.
insert into public.aqari_workspace_controls(workspace_id,settings,updated_by)
values(current_setting('aqari.test.ceiling.workspace')::uuid,
 '{"sections":{},"permissions":{"role:viewer":{"finance":{"read":true,"write":true},"employees":{"read":true,"write":true}},"role:property_manager":{"finance":{"read":true,"write":true},"employees":{"read":true,"write":true}},"role:accountant":{"finance":{"read":true,"write":true},"employees":{"read":true,"write":true}},"user:79400000-0000-4000-8000-000000000002":{"finance":{"read":true,"write":true},"employees":{"read":true,"write":true},"maintenance":{"read":true,"write":true}}}}',
 '79400000-0000-4000-8000-000000000001')
on conflict(workspace_id) do update set settings=excluded.settings;
update public.aqari_memberships set role='viewer' where workspace_id=current_setting('aqari.test.ceiling.workspace')::uuid and user_id='79400000-0000-4000-8000-000000000002';
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;p uuid:='79400000-0000-4000-8000-000000000011';begin
 if private.aqari_can_property(w,p,'finance','read') or private.aqari_can(w,'employees','read') then raise exception 'DOWNGRADED_VIEWER_RETAINS_ACCOUNTANT_READ';end if;
 if private.aqari_can(w,'finance','write') or private.aqari_can(w,'employees','write') then raise exception 'DOWNGRADED_VIEWER_RETAINS_ACCOUNTANT_WRITE';end if;
 begin perform public.aqari_hr(w,'list');raise exception 'DOWNGRADED_VIEWER_HR_RPC_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.aqari_memberships set role='property_manager' where workspace_id=current_setting('aqari.test.ceiling.workspace')::uuid and user_id='79400000-0000-4000-8000-000000000002';
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;p uuid:='79400000-0000-4000-8000-000000000011';begin
 if private.aqari_can_property(w,p,'finance','read') or private.aqari_can_property(w,p,'finance','write') or private.aqari_can(w,'employees','read') or private.aqari_can(w,'employees','write') then raise exception 'CHANGED_MEMBERSHIP_RETAINS_ACCOUNTANT_SCOPE';end if;
end $$;
-- A manager can explicitly replace the stale assignment with a valid role;
-- current property-manager operations work while finance and HR stay denied.
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000001',true);
do $$begin
 perform public.aqari_staff_access(current_setting('aqari.test.ceiling.workspace')::uuid,'save','{"user_id":"79400000-0000-4000-8000-000000000002","operational_role":"property_manager","property_ids":["79400000-0000-4000-8000-000000000011"],"is_active":true,"revision":1,"reason":"Synthetic explicit correction after membership change"}');
end $$;
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;begin
 if not private.aqari_can(w,'maintenance','write') or not private.aqari_can(w,'contracts','write') then raise exception 'VALID_PROPERTY_MANAGER_SCOPE_LOST';end if;
 if private.aqari_can(w,'finance','read') or private.aqari_can(w,'employees','read') then raise exception 'OPERATIONAL_CEILING_OVERRIDDEN';end if;
end $$;
reset role;
-- The reverse membership change must also invalidate the stored operational role.
update public.aqari_memberships set role='accountant' where workspace_id=current_setting('aqari.test.ceiling.workspace')::uuid and user_id='79400000-0000-4000-8000-000000000002';
set local role authenticated;
do $$begin
 if private.aqari_can(current_setting('aqari.test.ceiling.workspace')::uuid,'maintenance','write') then raise exception 'ACCOUNTANT_RETAINS_PROPERTY_MANAGER_WRITE';end if;
end $$;
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000001',true);
do $$begin
 perform public.aqari_staff_access(current_setting('aqari.test.ceiling.workspace')::uuid,'save','{"user_id":"79400000-0000-4000-8000-000000000002","operational_role":"accountant","property_ids":["79400000-0000-4000-8000-000000000011"],"is_active":true,"revision":2,"reason":"Restore valid synthetic scope to test existing deny rules"}');
end $$;
reset role;
-- Existing configured denials remain effective for a valid pair.
update public.aqari_workspace_controls set settings=jsonb_set(settings,'{permissions,user:79400000-0000-4000-8000-000000000002,finance,write}','false') where workspace_id=current_setting('aqari.test.ceiling.workspace')::uuid;
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;begin
 if not private.aqari_can(w,'finance','read') or private.aqari_can(w,'finance','write') then raise exception 'EXPLICIT_DENY_CHANGED';end if;
end $$;
reset role;
update public.aqari_workspace_controls set settings=jsonb_set(settings,'{sections,finance}','false') where workspace_id=current_setting('aqari.test.ceiling.workspace')::uuid;
set local role authenticated;
do $$begin
 if private.aqari_can(current_setting('aqari.test.ceiling.workspace')::uuid,'finance','read') then raise exception 'DISABLED_SECTION_OVERRIDDEN';end if;
end $$;
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000001',true);
do $$declare w uuid:=current_setting('aqari.test.ceiling.workspace')::uuid;begin
 if not private.aqari_can(w,'administration','write') or not private.aqari_can(w,'finance','read') or private.aqari_can(w,'finance','write') then raise exception 'GENERAL_MANAGER_BEHAVIOR_CHANGED';end if;
end $$;
select set_config('request.jwt.claim.sub','79400000-0000-4000-8000-000000000003',true);
do $$begin
 if private.aqari_can(current_setting('aqari.test.ceiling.workspace')::uuid,'home','read') then raise exception 'UNASSIGNED_MEMBERSHIP_GRANTED_ACCESS';end if;
end $$;
reset role;
do $$begin
 if (select count(*) from private.aqari_staff_assignment_audit where workspace_id=current_setting('aqari.test.ceiling.workspace')::uuid and user_id='79400000-0000-4000-8000-000000000002')<>3 then raise exception 'EXPLICIT_GRANT_AUDIT_CHANGED';end if;
end $$;
rollback;
select 'PASS: runtime membership changes deny stale operational roles despite configured allows; scoped HR and finance, explicit role correction, existing denials, manager behavior, no default grant.' as result;
