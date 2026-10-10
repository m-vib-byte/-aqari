-- ROLLBACK-ONLY SYNTHETIC TEST. All fixture records and transitions roll back.
begin;
insert into public.aqari_workspaces(id,slug,name) values('76740000-0000-4000-8000-000000000900','aqari-lifecycle-test-20261010','Synthetic rollback-only lifecycle workspace');
insert into public.aqari_app_state(workspace_id,payload) values('76740000-0000-4000-8000-000000000900','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('lifecycle-manager@example.invalid','Lifecycle manager','general_manager','aqari-lifecycle-test-20261010'),
 ('lifecycle-viewer@example.invalid','Lifecycle viewer','viewer','aqari-lifecycle-test-20261010');
insert into auth.users(id,email,email_confirmed_at) values
 ('76740000-0000-4000-8000-000000000001','lifecycle-manager@example.invalid',now()),
 ('76740000-0000-4000-8000-000000000002','lifecycle-viewer@example.invalid',now());
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('76740000-0000-4000-8000-000000000101','76740000-0000-4000-8000-000000000900','lifecycle-one','Lifecycle property','{}'),
 ('76740000-0000-4000-8000-000000000102','76740000-0000-4000-8000-000000000900','lifecycle-two','Other property','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('76740000-0000-4000-8000-000000000201','76740000-0000-4000-8000-000000000900','76740000-0000-4000-8000-000000000101','L-1');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('76740000-0000-4000-8000-000000000301','76740000-0000-4000-8000-000000000900','lifecycle-tenant','Synthetic tenant','999000111001','55550100','{}');
insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by) values
 (gen_random_uuid(),'76740000-0000-4000-8000-000000000900','76740000-0000-4000-8000-000000000201',1,'ready',current_date,'Synthetic local inspection','Local lifecycle test only','76740000-0000-4000-8000-000000000001');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('76740000-0000-4000-8000-000000000401','76740000-0000-4000-8000-000000000900','lifecycle-lease','76740000-0000-4000-8000-000000000301','76740000-0000-4000-8000-000000000201','LOCAL-LIFECYCLE-1','2035-01-01','2035-12-31',100.125,0,'draft','{}');
select set_config('request.jwt.claim.sub','76740000-0000-4000-8000-000000000001',true);
insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
 select id,'76740000-0000-4000-8000-000000000900','LOCAL-LIFE-DOC-'||n,'property_document','property','lifecycle-one',
 'Synthetic preserved document','local.pdf','application/pdf','76740000-0000-4000-8000-000000000900/'||id||'.pdf','76740000-0000-4000-8000-000000000001' from (select n,gen_random_uuid() id from generate_series(1,11)n) fixture;
create temporary table lifecycle_before as select
 (select jsonb_agg(to_jsonb(x) order by id) from public.aqari_documents x where workspace_id='76740000-0000-4000-8000-000000000900') documents,
 (select jsonb_agg(to_jsonb(x) order by id) from public.aqari_leases x where workspace_id='76740000-0000-4000-8000-000000000900') leases;
select set_config('request.jwt.claim.sub','76740000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
do $$declare w uuid:='76740000-0000-4000-8000-000000000900';p uuid:='76740000-0000-4000-8000-000000000101';c jsonb;begin
 c:=public.aqari_property_lifecycle(w,p);
 if c->>'documents'<>'11' or c->>'contracts'<>'1' or c#>>'{lifecycle,state}'<>'active' then raise exception 'DEPENDENCIES_OR_DEFAULT_INVALID';end if;
 begin perform public.aqari_property_lifecycle(w,p,'archive',0,gen_random_uuid(),'Local archive');raise exception 'AAL1_ACCEPTED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint-1000)))::text,true);
 begin perform public.aqari_property_lifecycle(w,p,'archive',0,gen_random_uuid(),'Local archive');raise exception 'STALE_MFA_ACCEPTED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 begin perform public.aqari_property_lifecycle(w,p,'archive',0,gen_random_uuid(),'x');raise exception 'SHORT_REASON_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_property_lifecycle(w,'76740000-0000-4000-8000-000000000999','archive',0,gen_random_uuid(),'Local archive');raise exception 'OTHER_PROPERTY_ACCEPTED';exception when insufficient_privilege then null;end;
 c:=public.aqari_property_lifecycle(w,p,'archive',0,'76740000-0000-4000-8000-000000000501','Local archive');
 if c#>>'{lifecycle,state}'<>'archived' or c#>>'{lifecycle,revision}'<>'1' or c->>'documents'<>'11' then raise exception 'ARCHIVE_READBACK_FAILED';end if;
 begin perform public.aqari_property_lifecycle(w,p,'archive',0,gen_random_uuid(),'Duplicate attempt');raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 perform set_config('request.jwt.claim.sub','76740000-0000-4000-8000-000000000002',true);
 begin perform public.aqari_property_lifecycle(w,p);raise exception 'VIEWER_ACCEPTED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.aqari_property_lifecycle(w,p);raise exception 'ANONYMOUS_ACCEPTED';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$declare w uuid:='76740000-0000-4000-8000-000000000900';p uuid:='76740000-0000-4000-8000-000000000101';begin
 if (select documents from lifecycle_before) is distinct from (select jsonb_agg(to_jsonb(x) order by id) from public.aqari_documents x where workspace_id='76740000-0000-4000-8000-000000000900') then raise exception 'DOCUMENTS_CHANGED';end if;
 if (select leases from lifecycle_before) is distinct from (select jsonb_agg(to_jsonb(x) order by id) from public.aqari_leases x where workspace_id='76740000-0000-4000-8000-000000000900') then raise exception 'CONTRACTS_CHANGED';end if;
 if private.aqari_property_master_snapshot(w,p)#>>'{lifecycle,state}'<>'archived' then raise exception 'MASTER_NOT_ARCHIVED';end if;
 -- Existing projections use UPSERT: these must remain usable after archiving.
 insert into public.aqari_units select * from public.aqari_units where id='76740000-0000-4000-8000-000000000201'
  on conflict(id) do update set workspace_id=excluded.workspace_id,property_id=excluded.property_id,unit_no=excluded.unit_no;
 insert into public.aqari_leases select * from public.aqari_leases where id='76740000-0000-4000-8000-000000000401'
  on conflict(id) do update set workspace_id=excluded.workspace_id,unit_id=excluded.unit_id,status=excluded.status,snapshot=excluded.snapshot;
 begin insert into public.aqari_units values(gen_random_uuid(),w,p,'L-2');raise exception 'NEW_UNIT_ACCEPTED';exception when check_violation then if sqlerrm<>'PROPERTY_ARCHIVED_NEW_ACTIVITY_FORBIDDEN' then raise;end if;end;
 begin insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source,vacated_on) select gen_random_uuid(),workspace_id,'new-ref',tenant_id,unit_id,'LOCAL-LIFECYCLE-2','2036-01-01','2036-12-31',monthly_rent,deposit,status,snapshot,import_source,vacated_on from public.aqari_leases where id='76740000-0000-4000-8000-000000000401';raise exception 'NEW_LEASE_ACCEPTED';exception when check_violation then if sqlerrm<>'PROPERTY_ARCHIVED_NEW_ACTIVITY_FORBIDDEN' then raise;end if;end;
 begin update public.aqari_leases set status='ready' where id='76740000-0000-4000-8000-000000000401';raise exception 'ACTIVATION_ACCEPTED';exception when check_violation then if sqlerrm<>'PROPERTY_ARCHIVED_NEW_ACTIVITY_FORBIDDEN' then raise;end if;end;
 insert into public.aqari_units values('76740000-0000-4000-8000-000000000202',w,'76740000-0000-4000-8000-000000000102','OTHER-1');
 begin update public.aqari_units set property_id=p where id='76740000-0000-4000-8000-000000000202';raise exception 'MOVE_IN_ACCEPTED';exception when check_violation then if sqlerrm<>'PROPERTY_ARCHIVED_NEW_ACTIVITY_FORBIDDEN' then raise;end if;end;
 if (select count(*) from private.aqari_property_lifecycle_audit where workspace_id='76740000-0000-4000-8000-000000000900')<>1 then raise exception 'DUPLICATE_AUDIT';end if;
 begin delete from private.aqari_property_lifecycle_audit where workspace_id='76740000-0000-4000-8000-000000000900';raise exception 'AUDIT_DELETED';exception when check_violation then null;end;
 if has_table_privilege('authenticated','private.aqari_property_lifecycle','update') or has_function_privilege('anon','public.aqari_property_lifecycle(uuid,uuid,text,bigint,uuid,text)','execute') then raise exception 'EXCESS_PRIVILEGE';end if;
end$$;
select set_config('request.jwt.claim.sub','76740000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.aqari_property_lifecycle('76740000-0000-4000-8000-000000000900','76740000-0000-4000-8000-000000000101','restore',1,'76740000-0000-4000-8000-000000000502','Local restore');
reset role;
insert into public.aqari_units values(gen_random_uuid(),'76740000-0000-4000-8000-000000000900','76740000-0000-4000-8000-000000000101','L-2');
do $$begin if (select count(*) from private.aqari_property_lifecycle_audit where workspace_id='76740000-0000-4000-8000-000000000900')<>2 then raise exception 'RESTORE_NOT_AUDITED';end if;end$$;
rollback;
