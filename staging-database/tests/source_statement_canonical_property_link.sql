-- Synthetic local PostgreSQL fixture only; never execute against a hosted database.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values('source-link@example.invalid','Synthetic source link','general_manager','aqari-v267-staging');
insert into auth.users(id,email) values('70000000-0000-4000-8000-000000000002','source-link@example.invalid');
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','source:fixture','Source fixture','{"source_only":true}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values('70000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','101');
insert into public.aqari_property_statements(workspace_id,property_id,period,source_sha256,imported_by,content) values('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','2026-08-01',repeat('a',64),'synthetic-local-only','{"property_key":"shaikhah-tower","property_name":"Source fixture","summary":{"printed_totals":{"rent_kd":195}},"rows":[{"unit":"101","name_en_raw":"Synthetic Tenant","phone_raw":"55550001","civil_id_raw":"123456789012","contract_no_raw":"LOCAL-1","contract_rent_kd":250,"current_rent_kd":195,"contract_start_raw":"01/08/2026","contract_end_raw":"31/07/2027","pending":[]}]}');
do $$ begin
 begin
  perform public.aqari_link_property_statement('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
  raise exception 'Anonymous call accepted';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.aqari_link_property_statement('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
select public.aqari_link_property_statement('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
reset role;
do $$ declare d jsonb;begin
 select private.aqari_unwrap(payload) into d from public.aqari_app_state where workspace_id='70000000-0000-4000-8000-000000000001';
 if (select count(*) from public.aqari_properties where workspace_id='70000000-0000-4000-8000-000000000001')<>1 then raise exception 'Source property duplicated';end if;
 if jsonb_array_length(coalesce(d->'properties','[]'))<>0 then raise exception 'Source income leaked into legacy display';end if;
 if (select count(*) from public.aqari_statement_links)<>1 or (select count(*) from public.aqari_leases)<>1 then raise exception 'Linking not idempotent';end if;
 if not exists(select 1 from public.aqari_leases where unit_id='70000000-0000-4000-8000-000000000004' and status='draft' and monthly_rent=250) then raise exception 'Wrong unit or contract status';end if;
 if exists(select 1 from public.aqari_rent_payments) then raise exception 'Unexpected payment';end if;
 if (select metadata from public.aqari_properties where id='70000000-0000-4000-8000-000000000003')<>'{"source_only":true}'::jsonb then raise exception 'Source provenance changed';end if;
end $$;
rollback;
