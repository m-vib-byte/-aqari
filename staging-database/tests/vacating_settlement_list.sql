-- Local isolated regression: aqari_vacating_settlement(list) must not collide with PL/pgSQL lease variables.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('vacating-list@example.invalid','مدير اختبار قائمة الإخلاء','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267e000-0000-4000-8000-000000000091','vacating-list@example.invalid',now());
select set_config('request.jwt.claim.sub','f267e000-0000-4000-8000-000000000091',true);
select set_config('vac.list.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active limit 1),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f267e100-0000-4000-8000-000000000091',current_setting('vac.list.workspace')::uuid,'vac-list-property','عقار اختبار قائمة الإخلاء','{}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('f267e200-0000-4000-8000-000000000091',current_setting('vac.list.workspace')::uuid,'vac-list-tenant','مستأجر اختبار قائمة الإخلاء','999000111391','+96599993991','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('f267e300-0000-4000-8000-000000000091',current_setting('vac.list.workspace')::uuid,'f267e100-0000-4000-8000-000000000091','L01');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f267e400-0000-4000-8000-000000000091',current_setting('vac.list.workspace')::uuid,'vac-list-lease','f267e200-0000-4000-8000-000000000091','f267e300-0000-4000-8000-000000000091','TEST-VAC-LIST','2026-01-01','2026-12-31',100,50,'signed','{"rent":100,"rentalTermsVersion":"1","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}');
set local role authenticated;
do $$
declare r jsonb;
begin
 r:=public.aqari_vacating_settlement(current_setting('vac.list.workspace')::uuid,'list','{}');
 if jsonb_array_length(r->'leases')<>1 then raise exception 'VACATING_LIST_COUNT_WRONG';end if;
 if r#>>'{leases,0,contract_no}'<>'TEST-VAC-LIST' then raise exception 'VACATING_LIST_CONTRACT_MISSING';end if;
end $$;
rollback;
