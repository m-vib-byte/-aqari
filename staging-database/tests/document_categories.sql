-- Local/isolated test target only. All financial/account fixtures are rolled back.
-- A savepoint restores all fixtures before comparing the captured counts.
begin;
create temporary table deposit_before_counts as select
 (select count(*) from auth.users) users,(select count(*) from public.aqari_memberships) members,
 (select count(*) from public.aqari_tenants) tenants,(select count(*) from public.aqari_leases) leases,
 (select count(*) from public.aqari_rent_payments) rent_payments,
 (select count(*) from private.aqari_deposit_entries) deposit_entries;
alter table deposit_before_counts add column documents bigint default (0);
update deposit_before_counts set documents=(select count(*) from public.aqari_documents);
savepoint deposit_fixtures;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('deposit-manager@example.invalid','مدير اختبار التأمين','general_manager','aqari-v267-staging'),
 ('deposit-collector@example.invalid','محصل اختبار التأمين','accountant','aqari-v267-staging'),
 ('deposit-maintenance@example.invalid','صيانة اختبار التأمين','property_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267d000-0000-4000-8000-000000000001','deposit-manager@example.invalid',now()),
 ('f267d000-0000-4000-8000-000000000002','deposit-collector@example.invalid',now()),
 ('f267d000-0000-4000-8000-000000000003','deposit-maintenance@example.invalid',now());
select set_config('request.jwt.claim.sub','f267d000-0000-4000-8000-000000000001',true);
select set_config('deposit.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f267d100-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'deposit-a','عقار التأمين أ','{}'),
 ('f267d100-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'deposit-b','عقار التأمين ب','{}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('f267d200-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'deposit-tenant-a','مستأجر اختبار أ','999000111221','+96599992221','{}'),
 ('f267d200-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'deposit-tenant-b','مستأجر اختبار ب','999000111222','+96599992222','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('f267d300-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'f267d100-0000-4000-8000-000000000001','101'),
 ('f267d300-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'f267d100-0000-4000-8000-000000000002','201'),
 ('f267d300-0000-4000-8000-000000000003',current_setting('deposit.test.workspace')::uuid,'f267d100-0000-4000-8000-000000000001','102');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f267d400-0000-4000-8000-000000000001',current_setting('deposit.test.workspace')::uuid,'deposit-lease-a','f267d200-0000-4000-8000-000000000001','f267d300-0000-4000-8000-000000000001','TEST-DP-A','2026-01-01','2026-12-31',350,200.001,'signed','{}'),
 ('f267d400-0000-4000-8000-000000000002',current_setting('deposit.test.workspace')::uuid,'deposit-lease-b','f267d200-0000-4000-8000-000000000002','f267d300-0000-4000-8000-000000000002','TEST-DP-B','2026-01-01','2026-12-31',350,100,'signed','{}'),
 ('f267d400-0000-4000-8000-000000000003',current_setting('deposit.test.workspace')::uuid,'deposit-lease-draft','f267d200-0000-4000-8000-000000000001','f267d300-0000-4000-8000-000000000003','TEST-DP-DRAFT','2026-01-01','2026-12-31',350,100,'draft','{}');
set local role authenticated;
do $$
declare w uuid:=current_setting('deposit.test.workspace')::uuid;c text;e text;ref text;kind text;doc record;rowdata public.aqari_documents;
begin
 foreach c in array array['owner_identity','landlord_identity','tenant_identity','company_registration','power_of_attorney','title_deed','site_plan','electricity_service','water_service','gas_service','internet_service','signed_lease','lease_addendum','payment_receipt','cheque','bank_transfer','exit_inspection','utility_clearance','exit_notice','amicable_settlement','damage_invoice'] loop
  e:=case when c in ('owner_identity','landlord_identity','company_registration','power_of_attorney','title_deed','site_plan','electricity_service','water_service','gas_service','internet_service') then 'property' when c='tenant_identity' then 'tenant' else 'lease' end;
  ref:=case e when 'property' then 'deposit-a' when 'tenant' then 'deposit-tenant-a' else 'deposit-lease-a' end;
  kind:=case c when 'signed_lease' then 'signed_contract' else 'supporting_document' end;
  select * into doc from public.aqari_reserve_document(w,kind,e,ref,'مستند اختبار فقط','fixture.pdf','application/pdf',jsonb_build_object('category',c,'original_bytes',true));
  select * into rowdata from public.aqari_documents where id=doc.document_id;
  if rowdata.id is null or rowdata.metadata->>'category'<>c or rowdata.document_type<>kind or rowdata.entity_ref<>ref or rowdata.created_by<>auth.uid() or rowdata.status<>'draft' then raise exception 'CATEGORY_RESERVATION_MISMATCH: %',c;end if;
 end loop;
 begin
  perform public.aqari_reserve_document(w,'signed_contract','lease','deposit-lease-a','wrong','fixture.pdf','application/pdf','{"category":"exit_notice"}');
  raise exception 'NOTICE_TREATED_AS_SIGNED_CONTRACT';
 exception when invalid_parameter_value then if sqlerrm<>'INVALID_DOCUMENT_CATEGORY' then raise;end if;end;
 begin
  perform public.aqari_reserve_document(w,'supporting_document','property','deposit-a','wrong','fixture.pdf','application/pdf','{"category":"exit_notice"}');
  raise exception 'WRONG_ENTITY_ACCEPTED';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.aqari_reserve_document(w,'supporting_document','lease','deposit-lease-a','wrong','fixture.pdf','application/pdf','{}');
  raise exception 'MISSING_CATEGORY_ACCEPTED';
 exception when invalid_parameter_value then null;end;
end $$;
reset role;
rollback to savepoint deposit_fixtures;
do $$begin
 if (select count(*) from public.aqari_documents)<>(select documents from deposit_before_counts) or (select count(*) from auth.users)<>(select users from deposit_before_counts) then raise exception 'FIXTURES_NOT_RESTORED';end if;
end $$;
rollback;
select 'PASS: 21 category reservations and canonical readback, signed-contract classification, entity validation, fixture rollback. No live file upload claimed.' result;
