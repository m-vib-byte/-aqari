-- All identities and records are synthetic; every business write rolls back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values ('close-manager@example.invalid','مدير اختبار الإقفال','general_manager','aqari-v267-staging'),('close-accountant@example.invalid','محاسب اختبار','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values ('8f690000-0000-4000-8000-000000000001','close-manager@example.invalid',now()),('8f690000-0000-4000-8000-000000000002','close-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','8f690000-0000-4000-8000-000000000001',true);select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('close.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values ('8f690000-0000-4000-8000-000000000010',current_setting('close.w')::uuid,'close-property','عقار اختبار الإقفال','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values ('8f690000-0000-4000-8000-000000000011',current_setting('close.w')::uuid,'8f690000-0000-4000-8000-000000000010','CLOSE-1');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values ('8f690000-0000-4000-8000-000000000012',current_setting('close.w')::uuid,'close-tenant','مستأجر اختبار','869000000001','86900001','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values ('8f690000-0000-4000-8000-000000000013',current_setting('close.w')::uuid,'close-lease','8f690000-0000-4000-8000-000000000012','8f690000-0000-4000-8000-000000000011','CLOSE-LEASE','2026-01-01','2026-12-31',100,0,'signed','{}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
 ('8f690000-0000-4000-8000-000000000014',current_setting('close.w')::uuid,'8f690000-0000-4000-8000-000000000013','CLOSE-CANCEL',100,'2026-01-01','2026-01-02','paid','bank','{}','{}'),
 ('8f690000-0000-4000-8000-000000000050',current_setting('close.w')::uuid,'8f690000-0000-4000-8000-000000000013','CLOSE-KEEP',50.125,'2026-01-01','2026-01-03','partial','bank','{}','{}'),
 ('8f690000-0000-4000-8000-000000000051',current_setting('close.w')::uuid,'8f690000-0000-4000-8000-000000000013','CLOSE-OTHER-MONTH',900,'2026-02-01','2026-02-03','paid','bank','{}','{}'),
 ('8f690000-0000-4000-8000-000000000052',current_setting('close.w')::uuid,'8f690000-0000-4000-8000-000000000013','CLOSE-NATIVE-CANCEL',75,'2026-01-01','2026-01-04','cancelled','bank','{}','{}');
insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot) values (current_setting('close.w')::uuid,'2025-12-01','8f690000-0000-4000-8000-000000000001','مدير اختبار','لقطة قديمة لا تعدل','{"rent_payments":777.777,"rent_payment_count":7,"historical":true}');
set local role authenticated;
do $$
declare w uuid:=current_setting('close.w')::uuid;r jsonb;again jsonb;before_snapshot jsonb;kpi jsonb;
begin
 before_snapshot:=public.aqari_financial_register(w,'list','{"month":"2025-12"}')#>'{period,snapshot}';
 perform public.aqari_final_gap_register(w,'cancel_receipt','{"id":"8f690000-0000-4000-8000-000000000060","payment_id":"8f690000-0000-4000-8000-000000000014","reason":"إلغاء موثق قبل الإقفال"}');
 kpi:=public.aqari_kpi_dashboard(w,'2026-01-01','2026-01-31');
 r:=public.aqari_financial_register(w,'close_period','{"month":"2026-01","reason":"إقفال اختبار يستبعد الملغى"}');
 if (r#>>'{period,snapshot,rent_payments}')::numeric is distinct from 50.125 then raise exception 'CLOSE_CANCELLED_RECEIPT_TOTAL: expected 50.125 got %; KPI also returned %',r#>>'{period,snapshot,rent_payments}',kpi#>>'{collections,actual}';end if;
 if (kpi#>>'{collections,actual}')::numeric is distinct from 50.125 or (kpi#>>'{profit,actual_net}')::numeric is distinct from 50.125 then raise exception 'KPI_CANCELLED_RECEIPT_TOTAL: %',kpi;end if;
 if (r#>>'{period,snapshot,rent_payment_count}')::integer is distinct from 1 then raise exception 'CLOSE_CANCELLED_RECEIPT_COUNT';end if;
 if (r#>>'{period,snapshot,approved_expenses}')::numeric is distinct from 0 then raise exception 'CLOSE_EXPENSE_TOTAL_CHANGED';end if;
 again:=public.aqari_financial_register(w,'close_period','{"month":"2026-01","reason":"إعادة الطلب لا تغير اللقطة"}');
 if again#>'{period,snapshot}' is distinct from r#>'{period,snapshot}' then raise exception 'CLOSED_SNAPSHOT_REWRITTEN';end if;
 if public.aqari_financial_register(w,'list','{"month":"2025-12"}')#>'{period,snapshot}' is distinct from before_snapshot then raise exception 'HISTORICAL_SNAPSHOT_MODIFIED';end if;
 if not exists(select 1 from jsonb_array_elements(r->'history') a where a->>'action'='period.close') then raise exception 'CLOSE_AUDIT_MISSING';end if;
 begin
  perform public.aqari_final_gap_register(w,'cancel_receipt','{"id":"8f690000-0000-4000-8000-000000000061","payment_id":"8f690000-0000-4000-8000-000000000050","reason":"رفض تغيير فترة مقفلة"}');raise exception 'CLOSED_PAYMENT_CANCELLATION_ACCEPTED';
 exception when raise_exception then if sqlerrm not like 'الفترة المالية مقفلة%' then raise;end if;end;
end $$;
reset role;
do $$declare w uuid:=current_setting('close.w')::uuid;begin
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>4 then raise exception 'PAYMENT_EVIDENCE_REMOVED';end if;
 if (select count(*) from private.aqari_receipt_cancellations where workspace_id=w)<>1 then raise exception 'CANCELLATION_EVIDENCE_REMOVED';end if;
end $$;
select set_config('request.jwt.claim.sub','8f690000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin begin perform public.aqari_financial_register(current_setting('close.w')::uuid,'close_period','{"month":"2026-02","reason":"رفض غير مخول"}');raise exception 'NONMANAGER_CLOSED_MONTH';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: native and registered cancellations excluded from close and KPIs; partial retained; other month excluded; immutable snapshots; audited close; role/period guards; source records preserved';
