-- LOCAL ISOLATED POSTGRESQL ONLY. Synthetic accounts/data; always rolls back.
-- Regression: a property assignment does not permit skipping manager approval
-- by submitting an older contract shape without rentalTermsVersion.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('staff-contract-manager@example.invalid','مدير اختبار اعتماد العقد','general_manager','aqari-v267-staging'),
 ('staff-contract-property@example.invalid','مسؤول عقار اختبار العقد','property_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76500000-0000-4000-8000-000000000001','staff-contract-manager@example.invalid',now()),
 ('76500000-0000-4000-8000-000000000002','staff-contract-property@example.invalid',now());
select set_config('aqari.test.contract.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76500000-0000-4000-8000-000000000001'),true);
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000001',true);
-- Privileged manager setup is expected to run after MFA; model that explicitly
-- in the isolated fixture while leaving production AAL2 enforcement intact.
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;
do $$
declare w uuid:=current_setting('aqari.test.contract.workspace')::uuid;s jsonb;d jsonb;t jsonb;c jsonb;prop uuid;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 t:=jsonb_build_object('id','staff-contract-tenant','nameAr','مستأجر اختبار اعتماد العقد','nameEn','Contract Approval Test Tenant',
  'civilId','765000000001','passportNo','CONTRACT-SCOPE-TEST','phone','76500001','nationality','اختبار','email','','attachments','[]'::jsonb);
 c:=jsonb_build_object('id','staff-contract-original','source','v267-cloud','detailsVersion',2,'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,
  'property','عقار اختبار منع تجاوز الاعتماد','unit','APPROVAL-1','floor','الأول','contract_no','STAFF-APPROVAL-ORIGINAL',
  'start_date',current_date::text,'end_date',(current_date+interval '1 year')::date::text,'writtenOn',(now() at time zone 'Asia/Kuwait')::date::text,
  'receivedAt',to_char((now()-interval '1 hour') at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00',
  'contractReceived','مستلم','evictionNotice','لم يُبلّغ','accountant','محاسب اصطناعي','contractRent',100,'discount',0,'rent',100,'deposit',0,'advance',0,'cleaningFee',0,'status','draft');
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||jsonb_build_array(jsonb_build_array(c->>'property')));
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 select id into strict prop from public.aqari_properties where workspace_id=w and name=c->>'property';
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','76500000-0000-4000-8000-000000000002',
  'operational_role','property_manager','property_ids',jsonb_build_array(prop),'is_active',true,'revision',0,'reason','إسناد اصطناعي لاختبار حدود اعتماد العقد'));
end $$;
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000002',true);
do $$
declare w uuid:=current_setting('aqari.test.contract.workspace')::uuid;s jsonb;d jsonb;original jsonb;c jsonb;attempt jsonb;status_name text;
begin
 if not private.aqari_can(w,'contracts','write') then raise exception 'APPROVAL_TEST_REQUIRES_SCOPED_WRITER';end if;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';original:=d#>'{contractsV202,0}';
 if original->>'id' is distinct from 'staff-contract-original' then raise exception 'APPROVAL_FIXTURE_SCOPE_FAILED';end if;
 -- Unchanged historical rows must remain usable; omission is not a migration.
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);d:=s->'payload';
 if d#>'{contractsV202,0}' is distinct from original then raise exception 'APPROVAL_ORIGINAL_CHANGED';end if;
 foreach status_name in array array['approved','signed'] loop
  c:=original||jsonb_build_object('id','staff-contract-injected','unit','APPROVAL-2','contract_no','STAFF-APPROVAL-INJECTED','status',status_name);
  attempt:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c));
  begin
   perform public.aqari_save_state_v267(w,attempt,(s->>'revision')::bigint);
   raise exception 'STAFF_LEGACY_NEW_APPROVAL_BYPASS:%',status_name;
  exception when insufficient_privilege then null;end;
  attempt:=jsonb_set(d,'{contractsV202,0,status}',to_jsonb(status_name));
  begin
   perform public.aqari_save_state_v267(w,attempt,(s->>'revision')::bigint);
   raise exception 'STAFF_LEGACY_EXISTING_APPROVAL_BYPASS:%',status_name;
  exception when insufficient_privilege then null;end;
 end loop;
 -- Current contract versions also require a manager for approval/signing.
 c:=original||jsonb_build_object('id','staff-contract-current','unit','APPROVAL-3','contract_no','STAFF-APPROVAL-CURRENT',
  'rentalTermsVersion',1,'freeMonthApproved',false,'freeMonthPeriod','','rentAdjustments','[]'::jsonb,
  'depositReceivedOn','','contractReceived','لم يستلم','receivedAt','','status','draft');
 foreach status_name in array array['approved','signed'] loop
  attempt:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||jsonb_build_object('status',status_name)));
  begin
   perform public.aqari_save_state_v267(w,attempt,(s->>'revision')::bigint);
   raise exception 'STAFF_CURRENT_APPROVAL_BYPASS:%',status_name;
  exception when insufficient_privilege then null;end;
 end loop;
 -- A valid draft is the authorized positive case, with durable readback.
 s:=public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c)),(s->>'revision')::bigint);
 if not exists(select 1 from jsonb_array_elements(s#>'{payload,contractsV202}') x where x=c)
  or not exists(select 1 from public.aqari_leases where workspace_id=w and external_ref=c->>'id' and status='draft') then raise exception 'STAFF_CURRENT_DRAFT_READBACK_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000001',true);
do $$
declare w uuid:=current_setting('aqari.test.contract.workspace')::uuid;s jsonb;d jsonb;c jsonb;idx integer;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 select x,(n-1)::integer into strict c,idx from jsonb_array_elements(d->'contractsV202') with ordinality q(x,n) where x->>'id'='staff-contract-current';
 c:=c||'{"status":"approved","changeReason":"اعتماد المدير بعد مراجعة المسودة"}'::jsonb;
 s:=public.aqari_save_state_v267(w,jsonb_set(d,array['contractsV202',idx::text],c),(s->>'revision')::bigint);
 if not exists(select 1 from public.aqari_leases where workspace_id=w and external_ref=c->>'id' and status='approved') then raise exception 'MANAGER_APPROVAL_READBACK_FAILED';end if;
 d:=s->'payload';c:=c||'{"status":"signed","changeReason":"محاولة توقيع دون مرفق محفوظ"}'::jsonb;
 begin
  perform public.aqari_save_state_v267(w,jsonb_set(d,array['contractsV202',idx::text],c),(s->>'revision')::bigint);
  raise exception 'MANAGER_SIGNED_WITHOUT_DOCUMENT';
 exception when raise_exception then
  if sqlerrm<>'ارفع العقد الموقّع وربطه بهذا العقد قبل اعتماد التوقيع.' then raise;end if;
 end;
end $$;
rollback;
select 'PASS: scoped staff cannot bypass contract approval by omitting rentalTermsVersion; unchanged legacy records preserved, current draft save/readback allowed, manager approval required and signed document still mandatory. Local synthetic fixtures rolled back.' as result;
