-- Synthetic workspace and accounts; all test data rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name) values('05103100-0000-4000-8000-000000000001','shared-phone-statement-test','Synthetic shared phone statement');
insert into public.aqari_app_state(workspace_id,payload) values('05103100-0000-4000-8000-000000000001','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values('source-link@example.invalid','Synthetic source link','general_manager','shared-phone-statement-test');
insert into auth.users(id,email) values('05103100-0000-4000-8000-000000000002','source-link@example.invalid');
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('05103100-0000-4000-8000-000000000003','05103100-0000-4000-8000-000000000001','source:fixture','Source fixture','{"source_only":true}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values('05103100-0000-4000-8000-000000000004','05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','101');
insert into public.aqari_property_statements(workspace_id,property_id,period,source_sha256,imported_by,content) values('05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','2026-08-01',repeat('a',64),'synthetic-local-only','{"property_key":"shaikhah-tower","property_name":"Source fixture","summary":{"printed_totals":{"rent_kd":195}},"rows":[{"unit":"101","name_en_raw":"Synthetic Tenant","phone_raw":"55550001","civil_id_raw":"123456789012","contract_no_raw":"LOCAL-1","contract_rent_kd":250,"current_rent_kd":195,"contract_start_raw":"01/08/2026","contract_end_raw":"31/07/2027","pending":[]}]}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values('05103100-0000-4000-8000-000000000005','05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','102');
update public.aqari_property_statements set content=jsonb_set(content,'{rows}',content->'rows'||jsonb_build_array(content#>'{rows,0}'||'{"unit":"102","name_en_raw":"Synthetic Second Tenant","civil_id_raw":"223456789012","contract_no_raw":"LOCAL-2"}'::jsonb)) where workspace_id='05103100-0000-4000-8000-000000000001';
do $$ begin
 begin
  perform public.aqari_link_property_statement('05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
  raise exception 'Anonymous call accepted';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','05103100-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.aqari_unit_readiness_register('05103100-0000-4000-8000-000000000001','record','{"id":"05103100-0000-4000-8000-000000000011","property_id":"05103100-0000-4000-8000-000000000003","unit_no":"101","expected_revision":0,"state":"ready","inspected_on":"2026-01-01","source_ref":"Synthetic test inspection","reason":"Synthetic fixture"}');
select public.aqari_unit_readiness_register('05103100-0000-4000-8000-000000000001','record','{"id":"05103100-0000-4000-8000-000000000012","property_id":"05103100-0000-4000-8000-000000000003","unit_no":"102","expected_revision":0,"state":"ready","inspected_on":"2026-01-01","source_ref":"Synthetic test inspection","reason":"Synthetic fixture"}');
-- Duplicate or missing civil identity must still require review when linking source rows.
do $$ declare variant text;begin
 foreach variant in array array['123456789012',''] loop
  begin
   update public.aqari_property_statements set content=jsonb_set(content,'{rows,1,civil_id_raw}',to_jsonb(variant)) where workspace_id='05103100-0000-4000-8000-000000000001';
   perform public.aqari_link_property_statement('05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
   raise exception 'AMBIGUOUS_CIVIL_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'TENANT_IDENTITY_REVIEW_REQUIRED' then raise;end if;end;
 end loop;
end $$;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.aqari_link_property_statement('05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
 if r->>'linked_rows'<>'2' or r->>'new_tenants'<>'2' or r->>'shared_phone_tenants'<>'2' or r->>'posted_payments'<>'0' then raise exception 'SHARED_PHONE_LINK_WARNING_FAILED';end if;
 r:=public.aqari_link_property_statement('05103100-0000-4000-8000-000000000001','05103100-0000-4000-8000-000000000003','2026-08-01',repeat('a',64));
 if r->>'new_tenants'<>'0' or r->>'new_leases'<>'0' or r->>'shared_phone_tenants'<>'2' then raise exception 'SHARED_PHONE_REPLAY_NOT_IDEMPOTENT';end if;
end $$;
reset role;
do $$ declare d jsonb;begin
 select private.aqari_unwrap(payload) into d from public.aqari_app_state where workspace_id='05103100-0000-4000-8000-000000000001';
 if (select count(*) from public.aqari_properties where workspace_id='05103100-0000-4000-8000-000000000001')<>1 then raise exception 'Source property duplicated';end if;
 if jsonb_array_length(coalesce(d->'properties','[]'))<>0 then raise exception 'Source income leaked into legacy display';end if;
 if (select count(*) from public.aqari_statement_links where workspace_id='05103100-0000-4000-8000-000000000001')<>2 or (select count(*) from public.aqari_leases where workspace_id='05103100-0000-4000-8000-000000000001')<>2 then raise exception 'Linking not idempotent';end if;
 if not exists(select 1 from public.aqari_leases where unit_id='05103100-0000-4000-8000-000000000004' and status='draft' and monthly_rent=250) then raise exception 'Wrong unit or contract status';end if;
 if exists(select 1 from public.aqari_rent_payments where workspace_id='05103100-0000-4000-8000-000000000001') then raise exception 'Unexpected payment';end if;
 if (select metadata from public.aqari_properties where id='05103100-0000-4000-8000-000000000003')<>'{"source_only":true}'::jsonb then raise exception 'Source provenance changed';end if;
end $$;
rollback;

select 'PASS: statement shared phone warnings, civil identity review, separate source tenants, canonical property, idempotent links, zero payments, access denial and full rollback' result;
