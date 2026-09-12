-- Transactional acceptance after the report upgrade. Every synthetic write rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name)values
 ('7f6b1000-0000-4000-8000-000000000099','aqari-v267-opening-balance-test','Opening balance isolated test'),
 ('7f6b1000-0000-4000-8000-000000000098','opening-other-workspace','Other opening workspace');
insert into public.aqari_app_state(workspace_id,payload)values('7f6b1000-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('opening-manager@example.invalid','مدير اختبار الرصيد الافتتاحي','general_manager','aqari-v267-opening-balance-test'),
 ('opening-viewer@example.invalid','مشاهد اختبار الرصيد الافتتاحي','viewer','aqari-v267-opening-balance-test'),
 ('opening-scoped-accountant@example.invalid','محاسب عقار واحد','accountant','aqari-v267-opening-balance-test');
insert into auth.users(id,email,email_confirmed_at) values
 ('7f6b1000-0000-4000-8000-000000000001','opening-manager@example.invalid',now()),
 ('7f6b1000-0000-4000-8000-000000000002','opening-viewer@example.invalid',now()),
 ('7f6b1000-0000-4000-8000-000000000003','opening-scoped-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','7f6b1000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('opening.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
do $$declare w uuid:=current_setting('opening.w')::uuid;n integer;begin
 for n in 1..2 loop
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)values(('7f6b1000-0000-4000-8000-00000000010'||n)::uuid,w,'opening-property-'||n,'عقار اختبار الرصيد '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(('7f6b1000-0000-4000-8000-00000000020'||n)::uuid,w,('7f6b1000-0000-4000-8000-00000000010'||n)::uuid,'OPEN-'||n);
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',('7f6b1000-0000-4000-8000-00000000090'||n)::uuid,
   'property_id',('7f6b1000-0000-4000-8000-00000000010'||n)::uuid,'unit_no','OPEN-'||n,'expected_revision',0,'state','ready',
   'inspected_on',current_date,'source_ref','Synthetic opening fixture inspection','reason','Unit inspected before the synthetic signed lease'));
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)values
   (('7f6b1000-0000-4000-8000-00000000030'||n)::uuid,w,'opening-tenant-'||n,'مستأجر اختبار الرصيد '||n,'76100000000'||n,'7610000'||n,'opening-tenant-'||n||'@example.invalid','{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)values
   (('7f6b1000-0000-4000-8000-00000000040'||n)::uuid,w,'opening-lease-'||n,('7f6b1000-0000-4000-8000-00000000030'||n)::uuid,('7f6b1000-0000-4000-8000-00000000020'||n)::uuid,'OPEN-LEASE-'||n,'2026-01-01','2026-12-31',100,0,'signed','{}');
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by)values
  (w,'7f6b1000-0000-4000-8000-000000000003','accountant',array['7f6b1000-0000-4000-8000-000000000101']::uuid[],true,auth.uid());
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)values
  ('7f6b1000-0000-4000-8000-000000000303','7f6b1000-0000-4000-8000-000000000098','opening-foreign-tenant','مستأجر مساحة أخرى','761000000003','76100003','{}');
end $$;
insert into auth.users(id,email,email_confirmed_at)values('7f6b1000-0000-4000-8000-000000000004','opening-tenant-1@example.invalid',now());
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
select ('7f6b1000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,current_setting('opening.w')::uuid,
 '7f6b1000-0000-4000-8000-000000000401','OPEN-PAY-'||n,amount,'2026-02-01'::date,'2026-02-02'::date,status,'bank','{}','{}'
from (values(1,100.000,'paid'),(2,25.125,'partial'),(3,10.100,'مدفوع'),(4,4.775,'جزئي'),
 (5,500.000,'pending'),(6,600.000,'unpaid'),(7,700.000,'cancelled'),(8,800.000,'ملغى'),(9,900.000,'voided'),(10,30.000,'paid')) p(n,amount,status);
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values
 ('7f6b1000-0000-4000-8000-000000000511',current_setting('opening.w')::uuid,'7f6b1000-0000-4000-8000-000000000402','OPEN-PAY-OTHER-TENANT',20,'2026-02-01','2026-02-02','paid','bank','{}','{}');
set local role authenticated;
do $$declare w uuid:=current_setting('opening.w')::uuid;r jsonb;begin
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000020","tenant_id":"7f6b1000-0000-4000-8000-000000000301","lease_id":"7f6b1000-0000-4000-8000-000000000401","direction":"debit","kind":"opening_debit","amount":"40.000","occurred_on":"2026-01-01","reason":"رصيد افتتاحي مدين اصطناعي","source_type":"legacy_import","source_id":"opening-debit-1"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000021","tenant_id":"7f6b1000-0000-4000-8000-000000000301","lease_id":"7f6b1000-0000-4000-8000-000000000401","direction":"credit","kind":"opening_credit","amount":"10.000","occurred_on":"2026-01-01","reason":"رصيد افتتاحي دائن اصطناعي","source_type":"legacy_import","source_id":"opening-credit-1"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000022","tenant_id":"7f6b1000-0000-4000-8000-000000000301","direction":"credit","kind":"adjustment","amount":"5.000","occurred_on":"2026-02-03","reason":"تسوية لاحقة غير افتتاحية","source_type":"manual","source_id":"adjustment-1"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000023","tenant_id":"7f6b1000-0000-4000-8000-000000000302","direction":"debit","kind":"opening_balance","amount":"75.000","occurred_on":"2026-01-01","reason":"رصيد قديم عام دون عقد","source_type":"legacy_import","source_id":"opening-general-2"}');
 perform public.aqari_final_gap_register(w,'cancel_receipt','{"id":"7f6b1000-0000-4000-8000-000000000024","payment_id":"7f6b1000-0000-4000-8000-000000000510","reason":"إلغاء اصطناعي موثق لوصل الاختبار"}');
 r:=public.aqari_opening_balance_statement(w,'7f6b1000-0000-4000-8000-000000000301');
 if jsonb_array_length(r->'opening_entries')<>2 or (r#>>'{totals,opening_debit}')::numeric<>40 or (r#>>'{totals,opening_credit}')::numeric<>10 or (r#>>'{totals,opening_net}')::numeric<>30 then raise exception 'OPENING_TOTALS_OR_FILTER_FAILED:%',r;end if;
 if (r#>>'{totals,non_opening_credit}')::numeric<>5 or (r#>>'{totals,non_opening_debit}')::numeric<>30 then raise exception 'NON_OPENING_LEDGER_MIXED:%',r;end if;
 if (r#>>'{totals,actual_collections}')::numeric<>140.000 then raise exception 'UNCONFIRMED_OR_CANCELLED_COLLECTION_INCLUDED:%',r;end if;
 r:=public.aqari_opening_balance_statement(w);
 if jsonb_array_length(r->'opening_entries')<>3 or (r#>>'{totals,opening_debit}')::numeric<>115 or (r#>>'{totals,actual_collections}')::numeric<>160 then raise exception 'WORKSPACE_OR_GENERAL_OPENING_TOTAL_FAILED:%',r;end if;
 if not exists(select 1 from jsonb_array_elements(r->'opening_entries')x where x->>'kind'='opening_balance' and x->>'lease_id' is null) then raise exception 'GENERAL_OPENING_ENTRY_LOST';end if;
 begin perform public.aqari_opening_balance_statement(w,'7f6b1000-0000-4000-8000-000000000303');raise exception 'FOREIGN_TENANT_READ';exception when insufficient_privilege then null;end;
 begin perform public.aqari_opening_balance_statement('7f6b1000-0000-4000-8000-000000000098');raise exception 'FOREIGN_WORKSPACE_READ';exception when insufficient_privilege then null;end;
 begin perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000025","tenant_id":"7f6b1000-0000-4000-8000-000000000301","direction":"credit","kind":"opening_debit","amount":"99.000","occurred_on":"2026-01-01","reason":"تناقض يجب رفضه","source_type":"manual","source_id":"bad-opening-1"}');raise exception 'CONTRADICTORY_DEBIT_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000026","tenant_id":"7f6b1000-0000-4000-8000-000000000301","direction":"debit","kind":"opening_credit","amount":"99.000","occurred_on":"2026-01-01","reason":"تناقض يجب رفضه","source_type":"manual","source_id":"bad-opening-2"}');raise exception 'CONTRADICTORY_CREDIT_ACCEPTED';exception when check_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub','7f6b1000-0000-4000-8000-000000000003',true);
do $$declare w uuid:=current_setting('opening.w')::uuid;begin
 if not private.aqari_can(w,'finance','read') or not private.aqari_can_property(w,'7f6b1000-0000-4000-8000-000000000101','finance','read') or private.aqari_can_property(w,'7f6b1000-0000-4000-8000-000000000102','finance','read') then raise exception 'SCOPED_ACCOUNTANT_FIXTURE_INVALID';end if;
 begin perform public.aqari_opening_balance_statement(w);raise exception 'SCOPED_ACCOUNTANT_WORKSPACE_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_opening_balance_statement(w,'7f6b1000-0000-4000-8000-000000000302');raise exception 'SCOPED_ACCOUNTANT_TENANT_LEAK';exception when insufficient_privilege then null;end;
 begin perform private.aqari_opening_balance_statement(w,null);raise exception 'PRIVATE_HELPER_BYPASS';exception when insufficient_privilege then null;end;
end $$;
do $$declare uid text;begin
 foreach uid in array array['7f6b1000-0000-4000-8000-000000000002','7f6b1000-0000-4000-8000-000000000004',''] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  begin perform public.aqari_opening_balance_statement(current_setting('opening.w')::uuid);raise exception 'VIEWER_TENANT_OR_UNAUTHENTICATED_READ';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
do $$begin
 if (select prosecdef from pg_proc where oid='public.aqari_opening_balance_statement(uuid,uuid)'::regprocedure) then raise exception 'PUBLIC_DEFINER_REPORT';end if;
 if has_function_privilege('anon','public.aqari_opening_balance_statement(uuid,uuid)','EXECUTE') or has_function_privilege('anon','private.aqari_opening_balance_statement(uuid,uuid)','EXECUTE') then raise exception 'ANONYMOUS_REPORT_GRANT';end if;
end $$;
rollback;
select 'PASS: manager-only opening statement, confirmed payments/cancellation exclusion, tenant/workspace scope, general opening classification and consistent new entries';
