-- Synthetic users, employee, properties and storage metadata. Always ROLLBACK.
-- Storage metadata below tests finalization/RLS, not an actual file upload.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('hr-manager@example.invalid','Synthetic HR manager','general_manager','aqari-v267-staging'),
 ('hr-admin@example.invalid','Synthetic HR administrator','accountant','aqari-v267-staging'),
 ('hr-isolated@example.invalid','Synthetic isolated accountant','accountant','aqari-v267-staging');
insert into auth.users(id,email) values
 ('f2670000-0000-4000-8000-000000000001','hr-manager@example.invalid'),
 ('f2670000-0000-4000-8000-000000000002','hr-admin@example.invalid'),
 ('f2670000-0000-4000-8000-000000000003','hr-isolated@example.invalid');
select set_config('aqari.test.hr.workspace',(select workspace_id::text from public.aqari_memberships where user_id='f2670000-0000-4000-8000-000000000001' and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f2670000-0000-4000-8000-000000000011',current_setting('aqari.test.hr.workspace')::uuid,'hr-test-property-a','Synthetic HR property A','{}'),
 ('f2670000-0000-4000-8000-000000000012',current_setting('aqari.test.hr.workspace')::uuid,'hr-test-property-b','Synthetic HR property B','{}');
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
set local role authenticated;
-- HR grants supplement operational property scope; both are required.

do $fixture$
declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;
begin
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f2670000-0000-4000-8000-000000000002','operational_role','accountant','property_ids',jsonb_build_array('f2670000-0000-4000-8000-000000000011'),'is_active',true,'revision',0,'reason','Synthetic accountant A operational scope required by current staff access gate'));
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f2670000-0000-4000-8000-000000000003','operational_role','accountant','property_ids',jsonb_build_array('f2670000-0000-4000-8000-000000000012'),'is_active',true,'revision',0,'reason','Synthetic accountant B operational scope required by current staff access gate'));
end $fixture$;
do $$
declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid; eid uuid:='f2670000-0000-4000-8000-000000000021';r jsonb; p jsonb; payload jsonb;
begin
 payload:=jsonb_build_object('employee_id',eid,'revision',0,'property_ids',jsonb_build_array('f2670000-0000-4000-8000-000000000011'),'basic','500.001','allowances','25.009','hired_on','2026-01-01','status','active',
 'profile',jsonb_build_object('name_ar','موظف اصطناعي للاختبار','name_en','Synthetic employee','civil_id','SYNTHETIC-CIVIL','passport','SYNTHETIC-PASSPORT','nationality','Synthetic','nationality_en','Synthetic English','phone','SYNTHETIC-PHONE','job_ar','اختبار','job_en','Test','work_location','Test property'));
 r:=public.aqari_hr(w,'save_employee',payload);
 if r#>>'{employee,profile,name_en}'<>'Synthetic employee' then raise exception 'CREATE_FAILED';end if;
 payload:=jsonb_set(payload,'{revision}','1');payload:=jsonb_set(payload,'{profile,job_en}','"Updated test role"');r:=public.aqari_hr(w,'save_employee',payload);
 if r#>>'{employee,profile,job_en}'<>'Updated test role' or r#>>'{employee,revision}'<>'2' then raise exception 'EDIT_FAILED';end if;
 begin perform public.aqari_hr(w,'save_employee',payload);raise exception 'STALE_ACCEPTED';exception when serialization_failure then null;end;
 r:=public.aqari_hr(w,'get',jsonb_build_object('employee_id',eid));
 if jsonb_array_length(r->'audit')<>2 or r#>>'{audit,0,actor_name}'<>'Synthetic HR manager' or r#>>'{audit,0,before_value,profile,job_en}'<>'Test' then raise exception 'AUDIT_FAILED';end if;
 perform public.aqari_hr(w,'grant','{"user_id":"f2670000-0000-4000-8000-000000000002","revision":0,"property_ids":["f2670000-0000-4000-8000-000000000011"],"permissions":{"read":true,"add":true,"edit":true,"approve_admin":true,"approve_chairman":false}}');
 perform public.aqari_hr(w,'grant','{"user_id":"f2670000-0000-4000-8000-000000000003","revision":0,"property_ids":["f2670000-0000-4000-8000-000000000012"],"permissions":{"read":true,"add":false,"edit":false,"approve_admin":false,"approve_chairman":false}}');
 perform public.aqari_hr(w,'event',jsonb_build_object('employee_id',eid,'id','f2670000-0000-4000-8000-000000000031','kind','advance','on_date','2026-09-01','amount','100','notes','Synthetic advance evidence'));
 perform public.aqari_hr(w,'event',jsonb_build_object('employee_id',eid,'id','f2670000-0000-4000-8000-000000000032','kind','leave','on_date','2026-09-02','until_date','2026-09-03','notes','Synthetic leave approval'));
 r:=public.aqari_hr(w,'prepare',jsonb_build_object('employee_id',eid,'month','2026-09-01'));p:=r#>'{payroll,0}';
 r:=public.aqari_hr(w,'prepare',jsonb_build_object('employee_id',eid,'month','2026-09-01'));if jsonb_array_length(r->'payroll')<>1 then raise exception 'DUPLICATE_SALARY';end if;
 perform set_config('hr.test.payroll',p->>'id',true);
 r:=public.aqari_hr(w,'save_payroll',jsonb_build_object('employee_id',eid,'payroll_id',p->>'id','revision',1,'loan_payment','30','reward','2','housing','3','indemnity','10','holidays','10','late','1','absence','2','slip_details',jsonb_build_object('template','dhahawi-v1','payer_ar','مسؤول اختبار','payer_en','Test payer'),'overtime','20','deductions','5.010','advance_repayment','10','method','transfer','reference','TEST-REF','notes','Synthetic payroll adjustment'));
 p:=r#>'{payroll,0}';if (p->>'net')::numeric<>582 then raise exception 'NET_FAILED';end if;
 r:=public.aqari_hr(w,'issue',jsonb_build_object('employee_id',eid,'payroll_id',p->>'id','revision',2));
 if r#>>'{payroll,0,voucher_no}' !~ '^DT-[0-9]{8}-[0-9]{6,}$' or r#>>'{payroll,0,issued_at}' is null or r#>>'{payroll,0,slip_details,payer_en}'<>'Test payer' then raise exception 'SLIP_IDENTITY_FAILED';end if;
 r:=public.aqari_hr(w,'get',jsonb_build_object('employee_id',eid));if (r#>>'{payroll,0,net}')::numeric<>582 or r#>>'{payroll,0,snapshot,nationality_en}'<>'Synthetic English' then raise exception 'READBACK_FAILED';end if;
 begin perform public.aqari_hr(w,'save_payroll',jsonb_build_object('employee_id',eid,'payroll_id',p->>'id','revision',3,'overtime','999','deductions','0','advance_repayment','0','method','cash'));raise exception 'ISSUED_MUTABLE';exception when raise_exception then if sqlerrm='ISSUED_MUTABLE' then raise;end if;end;
 begin perform public.aqari_hr(w,'paid',jsonb_build_object('employee_id',eid,'payroll_id',p->>'id','revision',3));raise exception 'UNAPPROVED_PAID';exception when raise_exception then if sqlerrm='UNAPPROVED_PAID' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000003',true);
do $$ declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;begin
 if jsonb_array_length(public.aqari_hr(w,'list')->'employees')<>0 then raise exception 'CROSS_PROPERTY_LIST';end if;
 begin perform public.aqari_hr(w,'get','{"employee_id":"f2670000-0000-4000-8000-000000000021"}');raise exception 'CROSS_PROPERTY_READ';exception when insufficient_privilege then null;end;
 begin perform public.aqari_hr(w,'access');raise exception 'NON_MANAGER_GRANTS';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000002',true);
do $$ declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;data jsonb:=jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','payroll_id',current_setting('hr.test.payroll'),'revision',3);begin
 begin perform public.aqari_hr(w,'approve_chairman',data);raise exception 'WRONG_APPROVER';exception when insufficient_privilege then null;end;
 perform public.aqari_hr(w,'approve_admin',data);
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
do $$ declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;r jsonb;begin
 perform public.aqari_hr(w,'approve_chairman',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','payroll_id',current_setting('hr.test.payroll'),'revision',4));
 r:=public.aqari_hr(w,'reserve',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','id','f2670000-0000-4000-8000-000000000041','payroll_id',current_setting('hr.test.payroll'),'kind','signed_salary','filename','synthetic-test.pdf','mime_type','application/pdf','size_bytes',12));
 if r->>'storage_path' not like '%/2026/09/%' then raise exception 'MONTH_ARCHIVE_FAILED';end if;
 perform set_config('hr.test.path',r->>'storage_path',true);
 begin perform public.aqari_hr(w,'finalize','{"employee_id":"f2670000-0000-4000-8000-000000000021","id":"f2670000-0000-4000-8000-000000000041","attestations":{"signature":true,"fingerprint":true,"stamp":true}}');raise exception 'MISSING_FILE_FINALIZED';exception when raise_exception then if sqlerrm='MISSING_FILE_FINALIZED' then raise;end if;end;
end $$;
reset role;
-- Metadata fixture only, transactionally rolled back. No binary uploaded here.
insert into storage.objects(bucket_id,name,metadata) values('aqari-hr-private',current_setting('hr.test.path'),'{"size":12,"mimetype":"application/pdf"}');
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;r jsonb;begin
 perform public.aqari_hr(w,'finalize','{"employee_id":"f2670000-0000-4000-8000-000000000021","id":"f2670000-0000-4000-8000-000000000041","attestations":{"signature":true,"fingerprint":true,"stamp":true}}');
 r:=public.aqari_hr(w,'paid',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','payroll_id',current_setting('hr.test.payroll'),'revision',5));
 if (r->>'advance_balance')::numeric<>120 or r#>>'{payroll,0,state}'<>'paid' then raise exception 'PAYMENT_BALANCE_FAILED';end if;
 begin perform public.aqari_hr(w,'paid',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','payroll_id',current_setting('hr.test.payroll'),'revision',5));raise exception 'REPLAY_PAID';exception when serialization_failure then null;end;
 if not exists(select 1 from storage.objects where bucket_id='aqari-hr-private' and name=current_setting('hr.test.path')) then raise exception 'DOCUMENT_READ_DENIED';end if;
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='aqari-hr-private' and name=current_setting('hr.test.path')) then raise exception 'CROSS_PROPERTY_DOCUMENT';end if;
end $$;
reset role;
select 'PASS: Dhahawi components, slip identity, bilingual nationality, loan disbursement,  employee persistence, CAS, audit, property isolation, payroll arithmetic, approval roles, signed-file gate, storage isolation, repayment replay' as result;
rollback;

