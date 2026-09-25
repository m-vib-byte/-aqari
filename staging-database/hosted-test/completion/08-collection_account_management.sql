-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/collection_account_management.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000008 / hosted-completion-collection-account-management
-- Run this entire file as one query; never extract setup statements.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Isolated acceptance/rejection test; all synthetic data rolls back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000008',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000008','hosted-completion-collection-account-management','Synthetic rollback acceptance: collection_account_management');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000008','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('account-manager@example.invalid','مدير اختبار الفجوات','general_manager','hosted-completion-collection-account-management'),('account-accountant@example.invalid','محاسب اختبار الفجوات','accountant','hosted-completion-collection-account-management'),('account-tenant@example.invalid','مستأجر اختبار الفجوات','viewer','hosted-completion-collection-account-management');
insert into auth.users(id,email,email_confirmed_at)values('76590000-0000-4000-8000-000000000001','account-manager@example.invalid',now()),('76590000-0000-4000-8000-000000000002','account-accountant@example.invalid',now()),('76590000-0000-4000-8000-000000000003','account-tenant@example.invalid',now());
select set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000001',true);select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('account.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)values('76590000-0000-4000-8000-000000000010',current_setting('account.w')::uuid,'gap-property','عقار اختبار الفجوات','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no)values('76590000-0000-4000-8000-000000000011',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000010','GAP-1');
-- Prove inspected readiness through the manager RPC under AAL2; never bypass its trigger.
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.aqari_unit_readiness_register(current_setting('account.w')::uuid,'record',jsonb_build_object(
  'id','76590000-0000-4000-8000-000000000071','property_id','76590000-0000-4000-8000-000000000010','unit_no','GAP-1',
  'expected_revision',0,'state','ready','inspected_on',current_date,'source_ref','فحص وحدة اختبار الحسابات','reason','فحص اصطناعي مثبت قبل إنشاء عقد الاختبار'));
 if r->>'unit_id'<>'76590000-0000-4000-8000-000000000011' or r->>'state'<>'ready' or r->>'revision'<>'1' then raise exception 'COLLECTION_FIXTURE_READINESS_NOT_PROVEN';end if;
end $$;
reset role;
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)values('76590000-0000-4000-8000-000000000012',current_setting('account.w')::uuid,'account-tenant','مستأجر اختبار الفجوات','769000000001','76900001','account-tenant@example.invalid','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)values('76590000-0000-4000-8000-000000000013',current_setting('account.w')::uuid,'gap-lease','76590000-0000-4000-8000-000000000012','76590000-0000-4000-8000-000000000011','GAP-LEASE-1','2026-01-01','2026-12-31',100,0,'signed','{}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values('76590000-0000-4000-8000-000000000014',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000013','GAP-PAY-1',100,'2026-01-01','2026-01-02','paid','bank','{}','{"collectorName":"محصل اختبار"}');
insert into public.aqari_portal_accounts(user_id,workspace_id,tenant_id,is_active)values('76590000-0000-4000-8000-000000000003',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000012',true);
insert into public.aqari_units(id,workspace_id,property_id,unit_no)values('76590000-0000-4000-8000-000000000031',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000010','GAP-2');
-- Prove inspected readiness through the manager RPC under AAL2; never bypass its trigger.
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.aqari_unit_readiness_register(current_setting('account.w')::uuid,'record',jsonb_build_object(
  'id','76590000-0000-4000-8000-000000000072','property_id','76590000-0000-4000-8000-000000000010','unit_no','GAP-2',
  'expected_revision',0,'state','ready','inspected_on',current_date,'source_ref','فحص وحدة اختبار الحسابات','reason','فحص اصطناعي مثبت قبل إنشاء عقد الاختبار'));
 if r->>'unit_id'<>'76590000-0000-4000-8000-000000000031' or r->>'state'<>'ready' or r->>'revision'<>'1' then raise exception 'COLLECTION_FIXTURE_READINESS_NOT_PROVEN';end if;
end $$;
reset role;
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)values('76590000-0000-4000-8000-000000000032',current_setting('account.w')::uuid,'gap-other-tenant','مستأجر آخر للاختبار','769000000002','76900002','gap-other@example.invalid','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)values('76590000-0000-4000-8000-000000000033',current_setting('account.w')::uuid,'gap-other-lease','76590000-0000-4000-8000-000000000032','76590000-0000-4000-8000-000000000031','GAP-LEASE-2','2026-01-01','2026-12-31',100,0,'signed','{}');
insert into public.aqari_workspaces(id,slug,name)values('76590000-0000-4000-8000-000000000099','account-other-workspace','Other isolated workspace');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values
 ('76590000-0000-4000-8000-000000000041',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000013','ACCOUNT-NEXT-BANK',25.125,'2026-02-01','2026-02-02','paid','bank','{}','{}'),
 ('76590000-0000-4000-8000-000000000042',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000013','ACCOUNT-CASH',5.125,'2026-03-01','2026-03-02','paid','cash','{}','{}');
set local role authenticated;
do $$declare w uuid:=current_setting('account.w')::uuid;begin
 perform public.aqari_final_gap_register(w,'account','{"id":"76590000-0000-4000-8000-000000000020","property_id":"76590000-0000-4000-8000-000000000010","kind":"bank","name":"اسم البنك الأصلي","masked_reference":"****1234"}');
 perform public.aqari_final_gap_register(w,'account','{"id":"76590000-0000-4000-8000-000000000030","property_id":"76590000-0000-4000-8000-000000000010","kind":"cashbox","name":"الصندوق الأصلي","masked_reference":"CASH-1"}');
 perform public.aqari_final_gap_register(w,'post_payment','{"id":"76590000-0000-4000-8000-000000000021","payment_id":"76590000-0000-4000-8000-000000000014","account_id":"76590000-0000-4000-8000-000000000020","reason":"ترحيل مصرفي اصطناعي"}');
 perform public.aqari_final_gap_register(w,'post_payment','{"id":"76590000-0000-4000-8000-000000000022","payment_id":"76590000-0000-4000-8000-000000000042","account_id":"76590000-0000-4000-8000-000000000030","reason":"ترحيل نقدي اصطناعي"}');
end $$;
reset role;
select set_config('account.before.payments',(select jsonb_agg(to_jsonb(p)order by p.id)::text from public.aqari_rent_payments p where p.workspace_id=current_setting('account.w')::uuid),true);
select set_config('account.before.postings',(select jsonb_agg(to_jsonb(p)order by p.id)::text from private.aqari_collection_postings p where p.workspace_id=current_setting('account.w')::uuid),true);
select set_config('account.before.snapshots',(select jsonb_agg(to_jsonb(p)order by p.posting_id)::text from private.aqari_collection_posting_accounts p where p.workspace_id=current_setting('account.w')::uuid),true);
select set_config('account.edit','{"id":"76590000-0000-4000-8000-000000000020","operation_id":"76590000-0000-4000-8000-000000000051","revision":1,"reason":"تصحيح اسم الحساب ومرجعه","name":"اسم البنك المصحح","masked_reference":"****5678"}',true);
set local role authenticated;
do $$declare w uuid:=current_setting('account.w')::uuid;r jsonb;p jsonb:=current_setting('account.edit')::jsonb;bad jsonb;begin
 r:=public.aqari_collection_account_manage(w,'edit',p);
 if r#>>'{account,revision}'<>'2' or r#>>'{account,name}'<>'اسم البنك المصحح' or r#>>'{account,masked_reference}'<>'****5678' then raise exception 'ACCOUNT_EDIT_FAILED';end if;
 if public.aqari_collection_account_manage(w,'edit',p)->>'replayed'<>'true' then raise exception 'EXACT_RETRY_NOT_RECOVERED';end if;
 r:=public.aqari_collection_account_manage(w,'read',jsonb_build_object('id',p->>'id','operation_id',p->>'operation_id'));
 if jsonb_array_length(r->'events')<>1 or r#>>'{events,0,before_value,name}'<>'اسم البنك الأصلي' or r#>>'{events,0,after_value,revision}'<>'2' then raise exception 'AUDIT_READBACK_FAILED';end if;
 begin perform public.aqari_collection_account_manage(w,'edit',p||'{"name":"تغيير الطلب نفسه"}');raise exception 'MUTATED_RETRY_ACCEPTED';exception when unique_violation then null;end;
 begin perform public.aqari_collection_account_manage(w,'edit',p||'{"operation_id":"76590000-0000-4000-8000-000000000059"}');raise exception 'STALE_EDIT_ACCEPTED';exception when serialization_failure then null;end;
 foreach bad in array array['{"property_id":"76590000-0000-4000-8000-000000000099"}'::jsonb,'{"kind":"cashbox"}','{"currency":"USD"}','{"masked_reference":"12345678"}','{"masked_reference":"١٢٣٤ ٥٦٧٨"}','{"reason":""}']loop
  begin perform public.aqari_collection_account_manage(w,'edit',p||'{"operation_id":"76590000-0000-4000-8000-000000000059","revision":2}'||bad);raise exception 'INVALID_ACCOUNT_EDIT_ACCEPTED: %',bad;exception when check_violation then null;end;
 end loop;
 r:=public.aqari_collection_account_manage(w,'archive','{"id":"76590000-0000-4000-8000-000000000020","operation_id":"76590000-0000-4000-8000-000000000052","revision":2,"reason":"إيقاف استقبال الترحيلات الجديدة"}');
 if r#>>'{account,revision}'<>'3' or r#>>'{account,status}'<>'archived' then raise exception 'ACCOUNT_ARCHIVE_FAILED';end if;
 -- Retrying the earlier edit after archive must return its durable event without resurrecting the account.
 r:=public.aqari_collection_account_manage(w,'edit',p);
 if r->>'replayed'<>'true' or r#>>'{account,status}'<>'archived' then raise exception 'OLD_RETRY_RESURRECTED_ACCOUNT';end if;
 begin perform public.aqari_collection_account_manage(w,'edit',p||'{"operation_id":"76590000-0000-4000-8000-000000000059","revision":3}');raise exception 'ARCHIVED_ACCOUNT_EDITED';exception when check_violation then null;end;
 begin perform public.aqari_final_gap_register(w,'post_payment','{"id":"76590000-0000-4000-8000-000000000023","payment_id":"76590000-0000-4000-8000-000000000041","account_id":"76590000-0000-4000-8000-000000000020","reason":"ترحيل جديد مرفوض"}');raise exception 'ARCHIVED_ACCOUNT_POSTED';exception when check_violation then null;end;
 r:=public.aqari_collection_account_manage(w,'edit','{"id":"76590000-0000-4000-8000-000000000030","operation_id":"76590000-0000-4000-8000-000000000053","revision":1,"reason":"تصحيح اسم الصندوق","name":"الصندوق المصحح","masked_reference":"CASH-1"}');
 r:=public.aqari_collection_account_manage(w,'archive','{"id":"76590000-0000-4000-8000-000000000030","operation_id":"76590000-0000-4000-8000-000000000054","revision":2,"reason":"إغلاق الصندوق مؤرشفًا"}');
 if r#>>'{account,status}'<>'archived' then raise exception 'CASHBOX_ARCHIVE_FAILED';end if;
 begin perform public.aqari_collection_account_manage('76590000-0000-4000-8000-000000000099','read',jsonb_build_object('id',p->>'id'));raise exception 'OTHER_WORKSPACE_ACCESS';exception when insufficient_privilege then null;end;
 begin perform public.aqari_collection_account_manage(w,'read','{"id":"76590000-0000-4000-8000-000000000099"}');raise exception 'UNKNOWN_ACCOUNT_ACCESS';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_collection_account_audit;raise exception 'DIRECT_AUDIT_ACCESS';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Even another privileged insertion path cannot bypass the archived-account trigger.
do $$begin
 begin insert into private.aqari_collection_postings values('76590000-0000-4000-8000-000000000023',current_setting('account.w')::uuid,'76590000-0000-4000-8000-000000000041','76590000-0000-4000-8000-000000000020',25.125,auth.uid(),now());raise exception 'ARCHIVE_TRIGGER_BYPASSED';exception when check_violation then if sqlerrm<>'ACCOUNT_ARCHIVED_OR_UNAVAILABLE' then raise;end if;end;
 if (select jsonb_agg(to_jsonb(p)order by p.id) from public.aqari_rent_payments p where p.workspace_id=current_setting('account.w')::uuid) is distinct from current_setting('account.before.payments')::jsonb then raise exception 'PAYMENT_HISTORY_CHANGED';end if;
 if (select jsonb_agg(to_jsonb(p)order by p.id) from private.aqari_collection_postings p where p.workspace_id=current_setting('account.w')::uuid) is distinct from current_setting('account.before.postings')::jsonb then raise exception 'POSTING_HISTORY_CHANGED';end if;
 if (select jsonb_agg(to_jsonb(p)order by p.posting_id) from private.aqari_collection_posting_accounts p where p.workspace_id=current_setting('account.w')::uuid) is distinct from current_setting('account.before.snapshots')::jsonb then raise exception 'POSTING_SNAPSHOT_CHANGED';end if;
 if not exists(select 1 from private.aqari_collection_posting_accounts where posting_id='76590000-0000-4000-8000-000000000021' and snapshot->>'name'='اسم البنك الأصلي' and captured_on_post) then raise exception 'ORIGINAL_ACCOUNT_DISPLAY_LOST';end if;
 if (select count(*) from private.aqari_collection_account_audit where workspace_id=current_setting('account.w')::uuid)<>4 then raise exception 'AUDIT_DUPLICATION_OR_LOSS';end if;
 begin update private.aqari_collection_account_audit set reason='مسح تاريخ' where operation_id='76590000-0000-4000-8000-000000000051' and workspace_id=current_setting('hosted.test.workspace')::uuid;raise exception 'AUDIT_MUTATED';exception when others then if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;end;
 if has_function_privilege('anon','public.aqari_collection_account_manage(uuid,text,jsonb)','execute') or (select prosecdef from pg_proc where oid='public.aqari_collection_account_manage(uuid,text,jsonb)'::regprocedure) then raise exception 'PUBLIC_BOUNDARY_NOT_HARDENED';end if;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
do $$begin begin perform public.aqari_collection_account_manage(current_setting('account.w')::uuid,'edit',current_setting('account.edit')::jsonb);raise exception 'MFA_BYPASSED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;end $$;
select set_config('request.jwt.claim.sub','76590000-0000-4000-8000-000000000002',true);
do $$begin begin perform public.aqari_collection_account_manage(current_setting('account.w')::uuid,'list');raise exception 'ACCOUNTANT_ROLE_ESCAPED';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub','',true);
do $$begin begin perform public.aqari_collection_account_manage(current_setting('account.w')::uuid,'list');raise exception 'MISSING_AUTH_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: bank/cashbox edit/archive and immutable identities; exact retry recovery and stale-revision refusal; archived posting denial at RPC and trigger; unchanged complete payment/posting snapshots; append-only event proof; masked references; tenant/workspace/manager/MFA boundaries.' as result;
