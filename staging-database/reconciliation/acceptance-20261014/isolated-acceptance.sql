begin;
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


do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid; e uuid:='c2670000-0000-4000-8000-000000000021'; r jsonb; initial text; terminal text; n int:=0;
begin
 foreach initial in array array['approved','rejected'] loop
 n:=n+1;terminal:=case when initial='approved' then 'completed' else 'cancelled' end;
 r:=public.aqari_hr_cycle(w,'add_record',jsonb_build_object('employee_id',e,'id',gen_random_uuid(),'kind','custody','starts_at','2026-09-10T00:00:00Z','title','Synthetic custody'));
 r:=public.aqari_hr_cycle(w,'decide_record',jsonb_build_object('employee_id',e,'id',r->>'id','revision',r->>'revision','status',initial,'reason','Synthetic initial decision'));
 r:=public.aqari_hr_cycle(w,'decide_record',jsonb_build_object('employee_id',e,'id',r->>'id','revision',r->>'revision','status',terminal,'reason','Synthetic custody return'));
 if r->>'status'<>terminal then raise exception 'CUSTODY_CLOSE_FAILED';end if;
 begin
 perform public.aqari_hr_cycle(w,'decide_record',jsonb_build_object('employee_id',e,'id',r->>'id','revision',0,'status',terminal,'reason','Stale decision'));
 raise exception 'STALE_DECISION_ALLOWED';
 exception when others then if sqlerrm='STALE_DECISION_ALLOWED' then raise;end if;end;
 end loop;
end $$;
reset role;
-- Service-role identity is synthetic, confined to this in-memory database.
create or replace function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare id uuid:=gen_random_uuid();r jsonb;
begin
 r:=public.aqari_owner_report_delivery_claim(id,'whatsapp','test');
 if r->>'protocol'<>'no-uncertain-retry-v1' or r->>'send'<>'true' then raise exception 'CLAIM_FAILED';end if;
 perform public.aqari_owner_report_delivery_complete(id,'whatsapp','test',false,null,'DELIVERY_RESULT_UNCERTAIN');
 update private.aqari_owner_report_delivery_log set updated_at=now()-interval '1 hour' where target_id=id;
 if public.aqari_owner_report_delivery_claim(id,'whatsapp','test')->>'send'<>'false' then raise exception 'UNCERTAIN_RECLAIMED';end if;
 perform public.aqari_owner_report_delivery_complete(id,'whatsapp','test',true,'wamid.synthetic',null);
 perform public.aqari_owner_report_delivery_complete(id,'whatsapp','test',true,'wamid.synthetic',null);
 if public.aqari_owner_report_delivery_claim(id,'whatsapp','test')->>'send'<>'false' then raise exception 'SENT_RECLAIMED';end if;
 if not exists(select 1 from private.aqari_owner_report_delivery_log where target_id=id and status='sent' and provider_id='wamid.synthetic' and attempts=1) then raise exception 'PROVIDER_REFERENCE_LOST';end if;
end $$;
rollback;
