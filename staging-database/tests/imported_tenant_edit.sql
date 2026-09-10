begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values ('edit-source-test@example.invalid','Synthetic editor','general_manager','aqari-v267-staging'),('edit-source-reader@example.invalid','Synthetic accountant','accountant','aqari-v267-staging');
insert into auth.users(id,email) values ('d8d8d8d8-1111-4111-8111-111111111111','edit-source-test@example.invalid'),('d8d8d8d8-2222-4222-8222-222222222222','edit-source-reader@example.invalid');
select set_config('request.jwt.claim.sub','d8d8d8d8-1111-4111-8111-111111111111',true);
-- Fixture setup runs before switching to the restricted authenticated role.
-- Direct membership-table reads are intentionally denied to application roles;
-- the RPCs below remain responsible for enforcing the active caller membership.
select set_config('edit.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active limit 1),true);
-- The isolated PGlite runner intentionally starts with no business data. Seed exactly one
-- imported tenant inside this transaction, with the app-state profile matching byte-for-byte.
-- The final rollback removes the synthetic tenant, audit rows and account fixtures.
do $$ declare w uuid:=current_setting('edit.test.workspace')::uuid; p jsonb:=jsonb_build_object(
 'id','SYNTHETIC-IMPORTED-TENANT',
 'nameAr','مستأجر مستورد اصطناعي',
 'nameEn','Synthetic Imported Tenant',
 'nationality','Kuwait',
 'phone','+96550000000',
 'email','',
 'civilId','123456789012',
 'address','',
 'passportNo','',
 'preferredContact','email',
 'sourceValues',jsonb_build_object('fixture',true),
 'sourceReference',jsonb_build_object('fixture','isolated-local')
); begin
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,import_source)
 values('d8d8d8d8-3333-4333-8333-333333333333'::uuid,w,p->>'id',p->>'nameAr',p->>'civilId',p->>'phone',null,p,jsonb_build_object('fixture',true));
 update public.aqari_app_state set payload=jsonb_build_object(
  'tenantProfilesV267',jsonb_build_array(p),
  'tenants','[]'::jsonb,
  'tenantDirectoryV202','[]'::jsonb,
  'tenantPreparationDraftsV267','[]'::jsonb
 ) where workspace_id=w;
end $$;
set local role authenticated;
do $$ declare w uuid:=current_setting('edit.test.workspace')::uuid; ref text; before jsonb; after jsonb; original_contracts jsonb; begin
select external_ref into ref from public.aqari_tenants where workspace_id=w and external_ref='SYNTHETIC-IMPORTED-TENANT';
if ref is null then raise exception 'IMPORTED_FIXTURE_MISSING';end if;
before:=public.aqari_imported_tenant_read(w,ref);
select jsonb_agg(snapshot order by id) into original_contracts from public.aqari_leases where workspace_id=w;
after:=public.aqari_imported_tenant_save(w,ref,'{"nameAr":"تعديل اصطناعي للاختبار فقط","passportNo":"SYNTHETIC-PASSPORT","preferredContact":"whatsapp"}',(before->>'revision')::bigint,'Synthetic rolled-back correction');
if after#>>'{profile,passportNo}'<>'SYNTHETIC-PASSPORT' then raise exception 'PASSPORT_NOT_SAVED';end if;
if after#>>'{profile,preferredContact}'<>'whatsapp' then raise exception 'CONTACT_PREFERENCE_NOT_SAVED';end if;
if after#>>'{profile,nameAr}'<>'تعديل اصطناعي للاختبار فقط' or after#>'{profile,sourceValues}' is distinct from before#>'{profile,sourceValues}' or after#>'{profile,sourceReference}' is distinct from before#>'{profile,sourceReference}' then raise exception 'EDIT_OR_SOURCE_FAILED';end if;
if after#>'{history,0,before_profile}' is distinct from before->'profile' or after#>'{history,0,after_profile}' is distinct from after->'profile' then raise exception 'AUDIT_FAILED';end if;
if (select jsonb_agg(snapshot order by id) from public.aqari_leases where workspace_id=w) is distinct from original_contracts then raise exception 'CONTRACT_HISTORY_CHANGED';end if;
begin perform public.aqari_imported_tenant_save(w,ref,'{"preferredContact":"carrier-pigeon"}',(after->>'revision')::bigint,'invalid preference');raise exception 'INVALID_CONTACT_ACCEPTED';exception when raise_exception then if sqlerrm='INVALID_CONTACT_ACCEPTED' then raise;end if;end;
begin perform public.aqari_imported_tenant_save(w,ref,'{"nameAr":"stale"}',(before->>'revision')::bigint,'stale correction');raise exception 'STALE_ACCEPTED';exception when serialization_failure then null;end;
begin perform public.aqari_imported_tenant_save(w,ref,'{"sourceValues":{}}',(after->>'revision')::bigint,'source overwrite');raise exception 'SOURCE_ACCEPTED';exception when raise_exception then if sqlerrm='SOURCE_ACCEPTED' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','d8d8d8d8-2222-4222-8222-222222222222',true);
do $$ declare w uuid:=current_setting('edit.test.workspace')::uuid; begin
begin perform public.aqari_imported_tenant_read(w,'foreign');raise exception 'READ_ALLOWED';exception when insufficient_privilege then null;end;
begin perform public.aqari_imported_tenant_save(w,'foreign','{}',0,'denied');raise exception 'WRITE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;rollback;
