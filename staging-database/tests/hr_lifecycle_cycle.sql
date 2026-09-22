-- Synthetic HR lifecycle acceptance. Run after the lifecycle SQL in one transaction; always ROLLBACK.
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('cycle-manager@example.invalid','Synthetic cycle manager','general_manager','aqari-v267-staging'),
 ('cycle-employee@example.invalid','Synthetic cycle employee','viewer','aqari-v267-staging');
insert into auth.users(id,email) values
 ('c2670000-0000-4000-8000-000000000001','cycle-manager@example.invalid'),
 ('c2670000-0000-4000-8000-000000000002','cycle-employee@example.invalid');
select set_config('aqari.test.cycle.workspace',(select workspace_id::text from public.aqari_memberships where user_id='c2670000-0000-4000-8000-000000000001' and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('c2670000-0000-4000-8000-000000000011',current_setting('aqari.test.cycle.workspace')::uuid,'cycle-a','Synthetic Cycle A','{"address_ar":"عنوان أ"}'),
 ('c2670000-0000-4000-8000-000000000012',current_setting('aqari.test.cycle.workspace')::uuid,'cycle-b','Synthetic Cycle B','{"address_ar":"عنوان ب"}');
select set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);
set local role authenticated;

do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';result jsonb;
begin
 result:=public.aqari_hr(w,'save_employee',jsonb_build_object('employee_id',e,'revision',0,'user_id','c2670000-0000-4000-8000-000000000002','property_ids',jsonb_build_array('c2670000-0000-4000-8000-000000000011','c2670000-0000-4000-8000-000000000012'),'basic','500','allowances','25','hired_on','2026-01-01','status','active','profile',jsonb_build_object('name_ar','موظف دورة اصطناعي','name_en','Synthetic cycle employee','civil_id','CYCLE-CIVIL','passport','CYCLE-PASS','nationality','Synthetic','phone','55500000','job_ar','محاسب','job_en','Accountant','work_location','Synthetic')));
 perform public.aqari_hr_cycle(w,'save_details',jsonb_build_object('employee_id',e,'revision',0,'email','cycle-employee@example.invalid','civil_expires_on','2026-10-10','passport_expires_on','2027-10-10','work_permit_expires_on','2026-11-01','contract_starts_on','2026-01-01','contract_ends_on','2027-01-01','employment',jsonb_build_object('department','Finance','supervisor','Synthetic manager'),'emergency_contact',jsonb_build_object('name','Synthetic contact')));
 result:=public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id','c2670000-0000-4000-8000-000000000011','share',40),jsonb_build_object('property_id','c2670000-0000-4000-8000-000000000012','share',60))));
 if result#>>'{saved}'<>'true' or jsonb_array_length(result->'allocations')<>2 then raise exception 'ALLOCATION_SAVE_FAILED';end if;
 result:=public.aqari_hr_cycle(w,'add_record',jsonb_build_object('employee_id',e,'id','c2670000-0000-4000-8000-000000000031','property_id','c2670000-0000-4000-8000-000000000011','kind','overtime','starts_at','2026-09-10T09:00:00Z','ends_at','2026-09-10T11:00:00Z','minutes',120,'amount','12.500','title','Synthetic overtime','details','Synthetic only'));
 perform public.aqari_hr_cycle(w,'decide_record',jsonb_build_object('employee_id',e,'id',result->>'id','revision',result->>'revision','status','approved','reason','Approved synthetic overtime'));
 result:=public.aqari_hr(w,'prepare',jsonb_build_object('employee_id',e,'month','2026-09-01'));
 perform set_config('aqari.test.cycle.payroll',result#>>'{payroll,0,id}',true);
 result:=public.aqari_hr_cycle(w,'sync_payroll',jsonb_build_object('employee_id',e,'month','2026-09-01'));
 if (result->>'overtime')::numeric<>12.500 then raise exception 'PAYROLL_SYNC_FAILED';end if;
 result:=public.aqari_hr_payroll_cycle(w,'save_draft',jsonb_build_object('employee_id',e,'payroll_id',result->>'id','revision',result->>'revision','overtime',result->>'overtime','reward','0','loan_payment','0','housing','0','indemnity','0','holidays','0','late','0','absence','0','deductions','0','advance_repayment','0','method','knet','reference','SYNTHETIC-KNET-1','notes','Synthetic draft save'));
 if result->>'method'<>'knet' or result->>'reference'<>'SYNTHETIC-KNET-1' then raise exception 'KNET_DRAFT_SAVE_FAILED';end if;
end $$;

select set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000002',true);
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';result jsonb;
begin
 result:=public.aqari_hr_cycle(w,'context');if result->>'self_employee_id'<>e::text or jsonb_array_length(result->'employees')<>1 then raise exception 'SELF_CONTEXT_FAILED';end if;
 result:=public.aqari_hr_cycle(w,'add_record',jsonb_build_object('employee_id',e,'id','c2670000-0000-4000-8000-000000000032','kind','leave_request','starts_at','2026-10-01T00:00:00Z','ends_at','2026-10-02T00:00:00Z','title','Synthetic leave request','details','Self service request'));
 begin perform public.aqari_hr_cycle(w,'add_record',jsonb_build_object('employee_id',e,'id','c2670000-0000-4000-8000-000000000033','kind','task','starts_at','2026-10-01T00:00:00Z','title','Forbidden self task'));raise exception 'SELF_TASK_ALLOWED';exception when insufficient_privilege then null;end;
 if (public.aqari_hr_cycle(w,'employee',jsonb_build_object('employee_id',e))#>>'{self}')<>'true' then raise exception 'SELF_FILE_FAILED';end if;
end $$;

reset role;
update private.aqari_hr_payroll set state='paid',voucher_no='CYCLE-202609-1',issued_at=now(),paid_at=now() where id=current_setting('aqari.test.cycle.payroll')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';result jsonb;again jsonb;registry uuid;
begin
 result:=public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id','c2670000-0000-4000-8000-000000000011'));
 if result#>>'{rows,0,share}'<>'40.00' or (result#>>'{rows,0,allocated_net}')::numeric<=0 then raise exception 'PROPERTY_COST_REPORT_FAILED';end if;
 result:=public.aqari_hr_cycle(w,'salary_export',jsonb_build_object('employee_id',e,'payroll_id',current_setting('aqari.test.cycle.payroll')));registry:=(result#>>'{registry,id}')::uuid;
 again:=public.aqari_hr_cycle(w,'salary_export',jsonb_build_object('employee_id',e,'payroll_id',current_setting('aqari.test.cycle.payroll')));if again#>>'{registry,id}'<>registry::text then raise exception 'SALARY_REGISTRY_NOT_IDEMPOTENT';end if;
 if (public.aqari_salary_verify((result->>'verification_token')::uuid)->>'valid')<>'true' then raise exception 'SALARY_VERIFY_FAILED';end if;
 perform public.aqari_hr_cycle(w,'void_salary',jsonb_build_object('employee_id',e,'registry_id',registry,'reason','Synthetic correction reason'));
 if (public.aqari_salary_verify((result->>'verification_token')::uuid)->>'valid')<>'false' then raise exception 'VOID_VERIFY_FAILED';end if;
 begin perform public.aqari_hr_cycle(w,'correct_salary',jsonb_build_object('employee_id',e,'replaces_id',registry,'reason','Invalid synthetic corrected version','snapshot',(result->'payload')||'{"net":"999.000"}'::jsonb));raise exception 'INVALID_SNAPSHOT_ALLOWED';exception when raise_exception then if sqlerrm='INVALID_SNAPSHOT_ALLOWED' then raise;elsif sqlerrm<>'INVALID_SALARY_SNAPSHOT_TOTAL' then raise;end if;end;
 perform public.aqari_hr_cycle(w,'correct_salary',jsonb_build_object('employee_id',e,'replaces_id',registry,'reason','Synthetic corrected version','snapshot',result->'payload'));
 perform public.aqari_hr_cycle(w,'month_action',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id','c2670000-0000-4000-8000-000000000011','state','reviewed','reason','Synthetic review','revision',0));
 perform public.aqari_hr_cycle(w,'month_action',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id','c2670000-0000-4000-8000-000000000011','state','approved','reason','Synthetic approval','revision',1));
 perform public.aqari_hr_cycle(w,'month_action',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id','c2670000-0000-4000-8000-000000000011','state','closed','reason','Synthetic close after paid payroll','revision',2));
 result:=public.aqari_hr_cycle(w,'archive_employee',jsonb_build_object('employee_id',e,'id','c2670000-0000-4000-8000-000000000041','last_working_day','2026-09-30','reason','Synthetic end of service','salary_due','50','leave_due','20','indemnity','100','deductions','10','custody_cleared',true,'clearance_notes','Synthetic clearance'));
 result:=public.aqari_hr_cycle(w,'settlement_action',jsonb_build_object('employee_id',e,'state','approved','revision',result->>'revision'));
 result:=public.aqari_hr_cycle(w,'settlement_action',jsonb_build_object('employee_id',e,'state','paid','revision',result->>'revision'));
 if result->>'state'<>'paid' or (result->>'net')::numeric<>160 then raise exception 'SETTLEMENT_FAILED';end if;
 result:=public.aqari_hr(w,'get',jsonb_build_object('employee_id',e));if not exists(select 1 from jsonb_array_elements(result->'audit') x where x->>'entity'='aqari_hr_salary_registry') then raise exception 'CYCLE_AUDIT_FAILED';end if;
end $$;

reset role;
do $$ begin
 begin update private.aqari_hr_payroll set notes='forbidden' where id=current_setting('aqari.test.cycle.payroll')::uuid;raise exception 'CLOSED_MONTH_MUTATED';exception when raise_exception then if sqlerrm='CLOSED_MONTH_MUTATED' then raise;elsif sqlerrm<>'PAYROLL_MONTH_CLOSED' then raise;end if;end;
 begin delete from private.aqari_hr_records where id='c2670000-0000-4000-8000-000000000031';raise exception 'IMMUTABLE_DELETE_ALLOWED';exception when raise_exception then if sqlerrm='IMMUTABLE_DELETE_ALLOWED' then raise;end if;end;
end $$;
select 'PASS: HR lifecycle self-service, expiry, allocation, attendance, payroll sync, property report, immutable salary correction, month close, settlement and audit' as result;
rollback;
