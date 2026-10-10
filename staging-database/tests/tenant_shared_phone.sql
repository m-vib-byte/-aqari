-- Synthetic fixtures only, rolled back. Run against the restored production catalog.
begin;
insert into public.aqari_workspaces(id,slug,name) values('05103000-0000-4000-8000-000000000099','shared-phone-synthetic','Synthetic shared phone acceptance');
insert into public.aqari_app_state(workspace_id,payload) values('05103000-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values('shared-phone-manager@example.invalid','Synthetic shared phone manager','general_manager','shared-phone-synthetic');
insert into auth.users(id,email,email_confirmed_at)
values('05103000-0000-4000-8000-000000000001','shared-phone-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','05103000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select set_config('shared.phone.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active limit 1),true);
do $$
declare w uuid:=current_setting('shared.phone.workspace')::uuid; a jsonb; b jsonb;
begin
 a:='{"id":"SHARED-PHONE-A","nameAr":"مستأجر اصطناعي أ","nameEn":"Synthetic A","nationality":"Kuwait","civilId":"951030000001","phone":"55551030","email":"shared-phone-a@example.invalid","passportNo":"TEST-A","attachments":[]}'::jsonb;
 b:=a||'{"id":"SHARED-PHONE-B","nameAr":"مستأجر اصطناعي ب","nameEn":"Synthetic B","civilId":"951030000002","email":"shared-phone-b@example.invalid","passportNo":"TEST-B"}';
 -- Exercise the actual app-state projection, not just a direct table insert.
 update public.aqari_app_state set payload=jsonb_set(payload,'{tenantProfilesV267}',coalesce(payload->'tenantProfilesV267','[]')||jsonb_build_array(a,b)) where workspace_id=w;
 if (select count(*) from public.aqari_tenants where workspace_id=w and phone='55551030' and external_ref in ('SHARED-PHONE-A','SHARED-PHONE-B'))<>2 then raise exception 'SHARED_PHONE_PROJECTION_FAILED';end if;
 if (select count(distinct id) from public.aqari_tenants where workspace_id=w and phone='55551030')<>2 then raise exception 'TENANT_IDENTITIES_MERGED';end if;
 begin
  update public.aqari_tenants set civil_id='951030000001' where workspace_id=w and external_ref='SHARED-PHONE-B';
  raise exception 'DUPLICATE_CIVIL_ID_ACCEPTED';
 exception when unique_violation then null;end;
 begin
  update public.aqari_app_state set payload=jsonb_set(payload,'{tenantProfilesV267}',(select jsonb_agg(case when p->>'id'='SHARED-PHONE-B' then p||'{"civilId":"951030000001"}' else p end) from jsonb_array_elements(payload->'tenantProfilesV267') p)) where workspace_id=w;
  raise exception 'DUPLICATE_CIVIL_PROJECTION_ACCEPTED';
 exception when unique_violation then null;end;
 -- Mark B as an imported fixture and temporarily give it another phone; editing it
 -- back to A's phone must pass through the real imported-tenant RPC and projection.
 update public.aqari_tenants set import_source='{"fixture":true}',phone='55551031',profile=profile||'{"phone":"55551031"}' where workspace_id=w and external_ref='SHARED-PHONE-B';
 update public.aqari_app_state set payload=jsonb_set(payload,'{tenantProfilesV267}',(select jsonb_agg(case when p->>'id'='SHARED-PHONE-B' then p||'{"phone":"55551031"}' else p end) from jsonb_array_elements(payload->'tenantProfilesV267') p)) where workspace_id=w;
end $$;
set local role authenticated;
do $$
declare w uuid:=current_setting('shared.phone.workspace')::uuid; before jsonb; saved jsonb; confirmed jsonb;
begin
 before:=public.aqari_imported_tenant_read(w,'SHARED-PHONE-B');
 saved:=public.aqari_imported_tenant_save(w,'SHARED-PHONE-B','{"phone":"55551030"}',(before->>'revision')::bigint,'Synthetic shared phone correction');
 confirmed:=public.aqari_imported_tenant_read(w,'SHARED-PHONE-B');
 if saved->'profile' is distinct from confirmed->'profile' or confirmed#>>'{profile,phone}'<>'55551030' then raise exception 'SHARED_PHONE_IMPORT_READBACK_FAILED';end if;
 if confirmed#>>'{profile,civilId}'<>'951030000002' then raise exception 'CIVIL_ID_CHANGED';end if;
 begin
  perform public.aqari_imported_tenant_save(w,'SHARED-PHONE-B','{"civilId":"951030000001"}',(confirmed->>'revision')::bigint,'Synthetic duplicate identity');
  raise exception 'DUPLICATE_IMPORTED_CIVIL_ACCEPTED';
 exception when raise_exception then if sqlerrm <> 'الرقم المدني مرتبط بمستأجر آخر.' then raise;end if;end;
 if confirmed#>'{history,0,before_profile}' is distinct from before->'profile' then raise exception 'HISTORY_NOT_PRESERVED';end if;
end $$;
reset role;
-- Real portal provisioning uses distinct verified emails despite the shared phone.
insert into auth.users(id,email,email_confirmed_at)
values('05103000-0000-4000-8000-000000000002','shared-phone-a@example.invalid',now()),
 ('05103000-0000-4000-8000-000000000003','shared-phone-b@example.invalid',now());
select set_config('shared.phone.a',(select id::text from public.aqari_tenants where workspace_id=current_setting('shared.phone.workspace')::uuid and external_ref='SHARED-PHONE-A'),true);
select set_config('shared.phone.b',(select id::text from public.aqari_tenants where workspace_id=current_setting('shared.phone.workspace')::uuid and external_ref='SHARED-PHONE-B'),true);
select set_config('request.jwt.claim.sub','05103000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
declare w uuid:=current_setting('shared.phone.workspace')::uuid;
begin
 if not private.aqari_owns_tenant(w,current_setting('shared.phone.a')::uuid) then raise exception 'OWN_TENANT_DENIED';end if;
 if private.aqari_owns_tenant(w,current_setting('shared.phone.b')::uuid) then raise exception 'SHARED_PHONE_GRANTED_FOREIGN_TENANT';end if;
 if exists(select 1 from public.aqari_tenants where id=current_setting('shared.phone.b')::uuid) then raise exception 'SHARED_PHONE_RLS_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','05103000-0000-4000-8000-000000000003',true);
do $$
declare w uuid:=current_setting('shared.phone.workspace')::uuid;
begin
 if not private.aqari_owns_tenant(w,current_setting('shared.phone.b')::uuid) then raise exception 'SECOND_TENANT_DENIED';end if;
 if private.aqari_owns_tenant(w,current_setting('shared.phone.a')::uuid) then raise exception 'SECOND_TENANT_FOREIGN_ACCESS';end if;
end $$;
reset role;
rollback;
select 'PASS: shared-phone projection and imported edit/readback, distinct identities, civil uniqueness, history, email-bound portal ownership and RLS; all synthetic rows rolled back' result;
