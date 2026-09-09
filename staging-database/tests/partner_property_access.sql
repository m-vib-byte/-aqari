-- Staging only. Synthetic partner accounts and properties; full rollback.
begin;
select set_config('aqari.test.manager',(select user_id::text from public.aqari_memberships where role='general_manager' and is_active limit 1),true);
select set_config('aqari.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=current_setting('aqari.test.manager')::uuid and role='general_manager' and is_active limit 1),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('a0000000-0000-4000-8000-000000000001',current_setting('aqari.test.workspace')::uuid,'partner-test-a','Partner test A','{}'),
 ('a0000000-0000-4000-8000-000000000002',current_setting('aqari.test.workspace')::uuid,'partner-test-b','Partner test B','{}');
-- Different property/month totals detect accidental aggregate leakage.
do $$declare w uuid:=current_setting('aqari.test.workspace')::uuid;t uuid;u uuid;l uuid;p uuid;i integer;begin
 for i in 1..2 loop
  t:=gen_random_uuid();u:=gen_random_uuid();l:=gen_random_uuid();p:=case when i=1 then 'a0000000-0000-4000-8000-000000000001'::uuid else 'a0000000-0000-4000-8000-000000000002'::uuid end;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,profile,import_source) values(t,w,'partner-fixture-'||i,'Synthetic tenant','{}','{"test":true}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'TEST');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
  values(l,w,'partner-fixture-'||i,t,u,'PARTNER-TEST-'||i,'2026-01-01','2026-12-31',100,0,'signed','{}');
  insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
  values(gen_random_uuid(),w,l,'PARTNER-TEST-'||i,case when i=1 then 100 else 900 end,'2026-09-01','2026-09-08','paid','bank','[]','{}'),
  (gen_random_uuid(),w,l,'PARTNER-OLD-'||i,300,'2026-08-01','2026-08-08','paid','bank','[]','{}');
 end loop;
end $$;
select set_config('request.jwt.claim.sub',current_setting('aqari.test.manager'),true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.workspace')::uuid;r jsonb;begin
 r:=public.aqari_manage_partner_access(w,'partner-a@example.invalid','a0000000-0000-4000-8000-000000000001','Partner A',true,0,'Synthetic isolation test');
 if (r->>'revision')::int<>1 or jsonb_array_length(public.aqari_partner_access_list(w))<>1 then raise exception 'GRANT_READBACK_FAILED';end if;
 begin perform public.aqari_manage_partner_access(w,'partner-a@example.invalid','a0000000-0000-4000-8000-000000000001','Partner A',true,0,'Stale update test');raise exception 'STALE_GRANT_ACCEPTED';exception when serialization_failure then null;end;
 perform public.aqari_manage_partner_access(w,'partner-b@example.invalid','a0000000-0000-4000-8000-000000000002','Partner B',true,0,'Synthetic isolation test');
 begin perform public.aqari_manage_partner_access(w,'partner-a@example.invalid','a0000000-0000-4000-8000-000000000099','Partner A',true,0,'Missing property test');raise exception 'MISSING_PROPERTY_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at) values
 ('b0000000-0000-4000-8000-000000000001','partner-a@example.invalid',now()),
 ('b0000000-0000-4000-8000-000000000002','partner-b@example.invalid',now());
-- Existing tenant signup remains isolated and unauthorized signup is rejected.
update public.aqari_tenants set email='partner-test-tenant@example.invalid' where external_ref='partner-fixture-1';
insert into auth.users(id,email,email_confirmed_at) values('b0000000-0000-4000-8000-000000000003','partner-test-tenant@example.invalid',now());
do $$begin
 if not exists(select 1 from public.aqari_portal_accounts where user_id='b0000000-0000-4000-8000-000000000003') then raise exception 'TENANT_SIGNUP_REGRESSION';end if;
 begin insert into auth.users(id,email) values('b0000000-0000-4000-8000-000000000004','unauthorized-partner@example.invalid');raise exception 'UNAUTHORIZED_SIGNUP_ALLOWED';exception when sqlstate '28000' then null;end;
end $$;
do $$begin
 if exists(select 1 from public.aqari_memberships where user_id in ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002')) then raise exception 'PARTNER_STAFF_MEMBERSHIP_CREATED';end if;
 begin insert into public.aqari_memberships(workspace_id,user_id,role) values(current_setting('aqari.test.workspace')::uuid,'b0000000-0000-4000-8000-000000000001','viewer');raise exception 'MEMBERSHIP_ESCALATION_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare r jsonb;w uuid:=current_setting('aqari.test.workspace')::uuid;begin
 r:=public.aqari_partner_summary();
 if r->>'user_id'<>auth.uid()::text or jsonb_array_length(r->'properties')<>1 or r#>>'{properties,0,name}'<>'Partner test A' then raise exception 'PROPERTY_LIST_LEAK';end if;
 r:=public.aqari_partner_summary('a0000000-0000-4000-8000-000000000001','2026-09-01');
 if r->>'name'<>'Partner test A' or (r->>'recorded_receipts')::numeric<>100 or (r->>'receipt_count')::int<>1 or (r->>'unit_count')::int<>1 or r ?| array['email','tenants','metadata','receipt','snapshot'] then raise exception 'PROPERTY_PROJECTION_LEAK';end if;
 begin perform public.aqari_partner_summary('a0000000-0000-4000-8000-000000000002','2026-09-01');raise exception 'OTHER_PROPERTY_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_partner_summary('a0000000-0000-4000-8000-000000000001','2026-09-02');raise exception 'INVALID_MONTH_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_MONTH' then raise;end if;end;
 if exists(select 1 from public.aqari_properties) or exists(select 1 from public.aqari_units) or exists(select 1 from public.aqari_leases) or exists(select 1 from public.aqari_tenants) or exists(select 1 from public.aqari_documents) or exists(select 1 from public.aqari_app_state) or exists(select 1 from public.aqari_rent_payments) then raise exception 'RAW_TABLE_LEAK';end if;
 begin perform public.aqari_read_state_v267(w);raise exception 'LEGACY_STATE_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_partner_access_list(w);raise exception 'GRANTS_LIST_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_manage_partner_access(w,'partner-a@example.invalid','a0000000-0000-4000-8000-000000000002','Partner A',true,0,'Escalation test');raise exception 'SELF_GRANT_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
do $$begin
 if public.aqari_partner_summary()#>>'{properties,0,name}'<>'Partner test B' then raise exception 'SECOND_PARTNER_SCOPE_FAILED';end if;
 begin perform public.aqari_partner_summary('a0000000-0000-4000-8000-000000000001','2026-09-01');raise exception 'SECOND_PARTNER_CROSS_READ';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('aqari.test.manager'),true);
select public.aqari_manage_partner_access(current_setting('aqari.test.workspace')::uuid,'partner-a@example.invalid','a0000000-0000-4000-8000-000000000001','Partner A',false,1,'Revocation test');
do $$begin if (select count(*) from public.aqari_control_audit where workspace_id=current_setting('aqari.test.workspace')::uuid and action='partner.access')<>3 then raise exception 'PARTNER_AUDIT_MISSING';end if;end $$;
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
do $$begin
 if jsonb_array_length(public.aqari_partner_summary()->'properties')<>0 then raise exception 'REVOKED_PROPERTY_LISTED';end if;
 begin perform public.aqari_partner_summary('a0000000-0000-4000-8000-000000000001','2026-09-01');raise exception 'REVOKED_PROPERTY_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
update auth.users set email_confirmed_at=null where id='b0000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin begin perform public.aqari_partner_summary();raise exception 'UNCONFIRMED_ACCOUNT_ALLOWED';exception when insufficient_privilege then null;end;end $$;
set local role anon;
do $$begin begin perform public.aqari_partner_summary();raise exception 'ANONYMOUS_RPC_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: two partners/two properties, grant readback/audit, stale grant, cross-property denial, raw/legacy/admin denial, no staff escalation, revocation, unconfirmed and anonymous denial. All synthetic fixtures rolled back; not a real browser login.' as proof;
