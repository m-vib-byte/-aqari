-- Synthetic transactional acceptance; local memory or independently verified test branch only.
-- Run after staff-property-scope.sql and archive-fixtures.sql. All fixture writes roll back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('archive-fixture-manager@example.invalid','مدير اختبار الموقع','general_manager','aqari-v267-staging'),
 ('archive-fixture-staff@example.invalid','صيانة اختبار الموقع','property_manager','aqari-v267-staging'),
 ('archive-fixture-accountant@example.invalid','محاسب اختبار الموقع','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76520000-0000-4000-8000-000000000001','archive-fixture-manager@example.invalid',now()),
 ('76520000-0000-4000-8000-000000000002','archive-fixture-staff@example.invalid',now()),
 ('76520000-0000-4000-8000-000000000003','archive-fixture-accountant@example.invalid',now());
select set_config('aqari.test.location.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76520000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76520000-0000-4000-8000-000000000001',true);
insert into public.aqari_workspaces(id,slug,name) values('76520000-0000-4000-8000-000000000099','archive-fixture-foreign-fixture','Other synthetic workspace');
do $$
declare w uuid;f integer;p uuid;u uuid;t uuid;l uuid;r uuid;
begin
 for f in 1..3 loop
  w:=case when f=3 then '76520000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.location.workspace')::uuid end;
  p:=('76520000-0000-4000-8000-00000000010'||f)::uuid;u:=('76520000-0000-4000-8000-00000000020'||f)::uuid;
  t:=('76520000-0000-4000-8000-00000000030'||f)::uuid;l:=('76520000-0000-4000-8000-00000000040'||f)::uuid;r:=('76520000-0000-4000-8000-00000000050'||f)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'archive-fixture-property-'||f,'Location property '||f,'{"private":"property owner PII"}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'UNIT-'||f);
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'archive-fixture-tenant-'||f,'PRIVATE TENANT '||f,'76520000000'||f,'7650000'||f,'{"private":"tenant PII"}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'archive-fixture-lease-'||f,t,u,'PRIVATE-CONTRACT-'||f,current_date-1,current_date+30,987.654,456.789,'signed','{"private":"lease PII and financial snapshot","property":"stale snapshot location","unit":"stale unit"}');
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description) values(r,w,l,t,'Synthetic location request '||f);
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
  (current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000002','maintenance',array['76520000-0000-4000-8000-000000000101']::uuid[],true,'76520000-0000-4000-8000-000000000001'),
  (current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000003','accountant',array['76520000-0000-4000-8000-000000000101']::uuid[],true,'76520000-0000-4000-8000-000000000001');
end $$;
insert into public.aqari_app_state(workspace_id,payload) values('76520000-0000-4000-8000-000000000099','{}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 select ('76520000-0000-4000-8000-00000000060'||n)::uuid,case when n=3 then '76520000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.location.workspace')::uuid end,('76520000-0000-4000-8000-00000000040'||n)::uuid,'TEST-ARCHIVE-'||n,n*10,'2026-01-01','2026-01-15','paid','cash','{}','{}' from generate_series(1,3)n;
insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,snapshot)
 values('76520000-0000-4000-8000-000000000701',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000601','إلغاء اختبار','76520000-0000-4000-8000-000000000001','مدير اختبار','{}');
insert into private.aqari_tenant_ledger_entries(id,workspace_id,tenant_id,lease_id,direction,kind,amount,occurred_on,reason,source_type,source_id,actor_id)
 values('76520000-0000-4000-8000-000000000702',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000301','76520000-0000-4000-8000-000000000401','credit','opening_credit',50,'2026-01-01','افتتاحي اختبار','fixture','archive-opening','76520000-0000-4000-8000-000000000001');
insert into private.aqari_credit_allocations values('76520000-0000-4000-8000-000000000703',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000702','76520000-0000-4000-8000-000000000401','2026-01-01',5,'76520000-0000-4000-8000-000000000001',now());
insert into private.aqari_deposit_entries(id,workspace_id,lease_id,kind,voucher_no,amount,on_date,method,actor_id,actor_name,snapshot,balance_after,request_data)
 values('76520000-0000-4000-8000-000000000704',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000401','receipt','TEST-ARCHIVE-DEP',10,'2026-01-15','cash','76520000-0000-4000-8000-000000000001','مدير اختبار','{}',10,'{}');
insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
 values('76520000-0000-4000-8000-000000000705',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000401','legal_cost','debit',2,'2026-01-15','fixture','76520000-0000-4000-8000-000000000799','قضائي اختبار','76520000-0000-4000-8000-000000000001');
insert into private.aqari_petty_cash_funds(id,workspace_id,custodian_id,name,ceiling)values('76520000-0000-4000-8000-000000000706',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000001','عهدة اختبار',100);
insert into private.aqari_petty_cash_entries(id,workspace_id,fund_id,kind,amount,balance_after,property_id,actor_id,created_at,snapshot)
 values('76520000-0000-4000-8000-000000000707',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000706','fund',10,10,'76520000-0000-4000-8000-000000000101','76520000-0000-4000-8000-000000000001','2026-01-15T00:00:00Z','{}');
insert into private.aqari_financial_expenses(id,workspace_id,property_id,expense_date,category,payee,amount,method,created_by)
 values('76520000-0000-4000-8000-000000000708',current_setting('aqari.test.location.workspace')::uuid,'76520000-0000-4000-8000-000000000101','2026-01-15','اختبار','جهة اختبار',3,'cash','76520000-0000-4000-8000-000000000001');
insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)
 values(current_setting('aqari.test.location.workspace')::uuid,'2025-12-01','76520000-0000-4000-8000-000000000001','مدير اختبار','لقطة تاريخية محفوظة','{"rent_payments":77.125,"legacy_finance_reconciled":false}');
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.location.workspace')::uuid;r jsonb;begin
 r:=public.aqari_financial_archive(w,'2026-01');
 if r->>'month'<>'2026-01' or jsonb_array_length(r->'entries')<>8 then raise exception 'ARCHIVE_STREAM_COUNT_FAILED: %',r->'entries';end if;
 if not exists(select 1 from jsonb_array_elements(r->'entries')x where x->>'stream'='opening' and (x->>'amount')::numeric=50) or not exists(select 1 from jsonb_array_elements(r->'entries')x where x->>'stream'='rent' and x->>'status'='cancelled') then raise exception 'OPENING_OR_CANCELLED_RECEIPT_MISCLASSIFIED';end if;
 if jsonb_array_length(public.aqari_financial_archive(w,'2026-02')->'entries')<>0 then raise exception 'OUTSIDE_MONTH_LEAK';end if;
 if public.aqari_financial_archive(w,'2025-12')#>>'{period,snapshot,rent_payments}'<>'77.125' then raise exception 'CLOSED_SNAPSHOT_NOT_PRESERVED';end if;
 begin perform public.aqari_financial_archive(w,'2026-13');raise exception 'INVALID_MONTH_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_financial_archive('76520000-0000-4000-8000-000000000099','2026-01');raise exception 'FOREIGN_WORKSPACE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76520000-0000-4000-8000-000000000003',true);
do $$declare r jsonb;begin
 r:=public.aqari_financial_archive(current_setting('aqari.test.location.workspace')::uuid,'2026-01');
 if jsonb_array_length(r->'entries')<>7 or exists(select 1 from jsonb_array_elements(r->'entries')x where x->>'property_id'<>'76520000-0000-4000-8000-000000000101') then raise exception 'ACCOUNTANT_ASSIGNMENT_SCOPE_FAILED';end if;
 r:=public.aqari_financial_archive(current_setting('aqari.test.location.workspace')::uuid,'2025-12');
 if r#>'{period,snapshot}' is not null then raise exception 'GLOBAL_CLOSED_SNAPSHOT_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','76520000-0000-4000-8000-000000000002',true);
do $$begin begin perform public.aqari_financial_archive(current_setting('aqari.test.location.workspace')::uuid,'2026-01');raise exception 'MAINTENANCE_FINANCE_ACCESS';exception when insufficient_privilege then null;end;end $$;
reset role;rollback;
select 'PASS: monthly streams, immutable close snapshot, opening separation, cancelled receipts, property/role isolation';
