-- Synthetic local-only acceptance against the captured production application DDL.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values('onboarding@example.invalid','Synthetic manager','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values('76500000-0000-4000-8000-000000000001','onboarding@example.invalid',now());
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('76500000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','synthetic-onboarding','Synthetic property','{"propertyType":"legacy","propertyMonthlyIncome":"999"}');
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:='70000000-0000-4000-8000-000000000001';p uuid:='76500000-0000-4000-8000-000000000002';d jsonb;result jsonb;saved jsonb;score jsonb;
begin
 d:='{"name":"Synthetic property","address":"Address","type":"building","status":"active","statedIncome":"350.010","owners":[{"name":"Synthetic owner","bps":10000,"role":"مالك","email":"owner@example.invalid","phone":"","whatsapp":""}],"email":"office@example.invalid","phone":"+96550000000","whatsapp":"","assets":{"photos":[],"documents":[],"plans":[]},"locationUrl":"https://example.invalid/map","propertyAutomaticRef":"001","description":"Saved description","tenantVisibility":{"name":true,"officeHours":false,"phone":true},"tenantInfo":{"instructions":"Saved instructions","officeHours":"9 to 5","emergency":"Saved emergency","services":"Water"}}';
 result:=public.aqari_property_master_save(w,p,0,d,'Synthetic acceptance');saved:=result->'property';
 if saved->>'description'<>'Saved description' or saved#>>'{tenantInfo,instructions}'<>'Saved instructions' or saved#>>'{tenantVisibility,officeHours}'<>'false' or saved#>>'{tenantVisibility,office_hours}'<>'false' or saved->>'revision'<>'1' or jsonb_array_length(saved->'owners')<>1 or nullif(saved#>>'{owners,0,id}','') is null then raise exception 'EXTENDED_ONBOARDING_READBACK_FAILED';end if;
 -- The production full-file RPC must read exactly what the editor saved.
 result:=public.aqari_property_full_file(w,p,current_date);
 if result->'property' is distinct from saved then raise exception 'FULL_FILE_READBACK_MISMATCH';end if;
 score:=public.aqari_property_completeness(w,p);
 if score->>'completed'<>'8' or score->>'total'<>'12' or score->>'property_id'<>p::text or score->'missing'?'الوصف المختصر' then raise exception 'COMPLETENESS_MISMATCH: %',score;end if;
 -- Old callers may omit new fields; those values must survive.
 d:=d-'description'-'tenantVisibility'-'tenantInfo';d:=jsonb_set(d,'{owners}',saved->'owners');
 result:=public.aqari_property_master_save(w,p,1,d,'Synthetic legacy caller');
 if result#>'{property,tenantInfo}' is distinct from saved->'tenantInfo' or result#>>'{property,description}'<>'Saved description' then raise exception 'OLD_CALLER_ERASED_EXTENDED_FIELDS';end if;
 begin perform public.aqari_property_master_save(w,p,1,d,'Stale revision');raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_property_master_save(w,p,2,d||'{"tenantVisibility":{"officeHours":true,"office_hours":false}}','Invalid visibility');raise exception 'CONFLICT_ACCEPTED';exception when invalid_parameter_value then if sqlerrm<>'PROPERTY_TENANT_VISIBILITY_CONFLICT' then raise;end if;end;
 begin perform public.aqari_property_master_save(w,p,2,d||'{"tenantVisibility":null}','Invalid visibility');raise exception 'NULL_VISIBILITY_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_property_master_save(w,p,2,d||'{"tenantInfo":{"token":"secret"}}','Invalid info');raise exception 'PRIVATE_INFO_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_property_master_save(w,p,2,d||'{"locationUrl":"https://user@host.invalid"}','Invalid location');raise exception 'URL_GUARD_REGRESSED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_property_completeness('76500000-0000-4000-8000-000000000099',p);raise exception 'CROSS_WORKSPACE_READ_ACCEPTED';exception when insufficient_privilege then null;end;
 result:=public.aqari_property_master_save(w,p,2,d||'{"type":"","statedIncome":null,"description":"","tenantVisibility":{},"tenantInfo":{}}','Explicit field clearing');
 if result#>>'{property,type}'<>'' or result#>'{property,statedIncome}'<>'null'::jsonb or result#>>'{property,description}'<>'' or result#>'{property,tenantInfo}'<>'{}'::jsonb then raise exception 'CLEARED_FIELDS_RESURRECTED';end if;
end $$;
reset role;
do $$begin
 if (select count(*) from private.aqari_property_master_audit where property_id='76500000-0000-4000-8000-000000000002')<>3 then raise exception 'AUDIT_COUNT_MISMATCH';end if;
 if has_function_privilege('anon','public.aqari_property_completeness(uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)','EXECUTE') or has_function_privilege('authenticated','private.aqari_property_master_snapshot(uuid,uuid)','EXECUTE') then raise exception 'FUNCTION_PRIVILEGE_REGRESSION';end if;
 if not (select relrowsecurity from pg_class where oid='private.aqari_property_master'::regclass) then raise exception 'RLS_DISABLED';end if;
end $$;
select set_config('request.jwt.claim.sub','76500000-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_property_completeness('70000000-0000-4000-8000-000000000001','76500000-0000-4000-8000-000000000002');raise exception 'UNAUTHORIZED_READ_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_property_master_save('70000000-0000-4000-8000-000000000001','76500000-0000-4000-8000-000000000002',3,'{}','Unauthorized write');raise exception 'UNAUTHORIZED_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
rollback;
