-- Isolated PostgreSQL/PGlite only. Synthetic users/files are rolled back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('maintenance-details-manager@example.invalid','مدير اختبار الصيانة','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f2678100-0000-4000-8000-000000000001','maintenance-details-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('maintenance.details.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
reset role;

-- Direct relational fixtures avoid weakening or bypassing the separate V267 contract-detail workflow.
do $$
declare w uuid:=current_setting('maintenance.details.workspace')::uuid;
begin
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f2678110-0000-4000-8000-000000000001',w,'maintenance-property','عقار صيانة تجريبي','{}');
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values
 ('f2678120-0000-4000-8000-000000000001',w,'maintenance-tenant','مستأجر صيانة','777888999111','+96550001122','maintenance-tenant@example.invalid','{"id":"maintenance-tenant","nameAr":"مستأجر صيانة","nameEn":"Maintenance Tenant","nationality":"اختبار","civilId":"777888999111","passportNo":"TEST-PASS-1","phone":"+96550001122","email":"maintenance-tenant@example.invalid"}');
 insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('f2678130-0000-4000-8000-000000000001',w,'f2678110-0000-4000-8000-000000000001','7');
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f2678140-0000-4000-8000-000000000001',w,'maintenance-lease','f2678120-0000-4000-8000-000000000001','f2678130-0000-4000-8000-000000000001','MNT-1','2026-01-01','2026-12-31',100,0,'signed','{"property":"عقار صيانة تجريبي","unit":"7","tenant":"مستأجر صيانة"}');
end $$;

insert into auth.users(id,email,email_confirmed_at) values
 ('f2678100-0000-4000-8000-000000000002','maintenance-tenant@example.invalid',now());
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000002',true);
set local role authenticated;

do $$
declare snap jsonb;req uuid:='f2678100-0000-4000-8000-000000000010';lease uuid;tenant uuid;w uuid;reserved record;
begin
 snap:=public.aqari_tenant_portal_snapshot();
 w:=(snap#>>'{account,workspace_id}')::uuid;tenant:=(snap#>>'{account,tenant_id}')::uuid;lease:=(snap#>>'{leases,0,id}')::uuid;
 insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,request_type)
 values(req,w,lease,tenant,'المكيف لا يبرد ويحتاج فحصاً','air_conditioning');
 select * into reserved from public.aqari_maintenance_attachment_reserve(w,req,'ac.jpg','image/jpeg');
 if reserved.attachment_id is null or reserved.storage_bucket is distinct from 'aqari-documents' or reserved.storage_path is null then raise exception 'MAINTENANCE_ATTACHMENT_RESERVE_FAILED';end if;
 perform set_config('maintenance.details.attachment',reserved.attachment_id::text,true);
 perform set_config('maintenance.details.path',reserved.storage_path,true);
 -- Draft metadata is intentionally hidden by RLS until the stored bytes are finalized.
 if (select count(*) from public.aqari_maintenance_attachments where id=reserved.attachment_id)<>0 then raise exception 'MAINTENANCE_DRAFT_ATTACHMENT_EXPOSED';end if;
end $$;
reset role;

-- Metadata fixture stands in for the Storage API bytes in the in-memory database.
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',current_setting('maintenance.details.path'),'{"size":321,"mimetype":"image/jpeg"}');
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000002',true);
set local role authenticated;

do $$
declare snap jsonb;att uuid:=current_setting('maintenance.details.attachment')::uuid;req jsonb;
begin
 perform public.aqari_maintenance_attachment_finalize(att,321,repeat('a',64));
 snap:=public.aqari_tenant_portal_snapshot();
 select value into req from jsonb_array_elements(snap->'maintenance') where value->>'id'='f2678100-0000-4000-8000-000000000010';
 if req->>'request_type'<>'air_conditioning' then raise exception 'MAINTENANCE_TYPE_READBACK_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(snap->'maintenance_attachments') a where a->>'id'=att::text and a->>'request_id'='f2678100-0000-4000-8000-000000000010' and a->>'status'='uploaded' and a->>'checksum_sha256'=repeat('a',64)) then raise exception 'MAINTENANCE_ATTACHMENT_READBACK_FAILED';end if;
 if (select count(*) from public.aqari_maintenance_attachments where id=att)<>1 then raise exception 'TENANT_ATTACHMENT_RLS_FAILED';end if;
 begin
  perform public.aqari_maintenance_attachment_cancel(att);
  raise exception 'UPLOADED_ATTACHMENT_CANCELLED';
 exception when others then
  if sqlerrm='UPLOADED_ATTACHMENT_CANCELLED' then raise;end if;
  if sqlerrm<>'INVALID_MAINTENANCE_ATTACHMENT_STATE' then raise;end if;
 end;
end $$;
reset role;

-- A second draft simulates bytes uploaded before a later failure; cancellation must remove the object and hide the metadata.
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
declare reserved record;w uuid:=current_setting('maintenance.details.workspace')::uuid;req uuid:='f2678100-0000-4000-8000-000000000010';
begin
 select * into reserved from public.aqari_maintenance_attachment_reserve(w,req,'failed.jpg','image/jpeg');
 perform set_config('maintenance.details.failed_attachment',reserved.attachment_id::text,true);
 perform set_config('maintenance.details.failed_path',reserved.storage_path,true);
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',current_setting('maintenance.details.failed_path'),'{"size":111,"mimetype":"image/jpeg"}');
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
begin
 perform public.aqari_maintenance_attachment_cancel(current_setting('maintenance.details.failed_attachment')::uuid);
 if (select count(*) from public.aqari_maintenance_attachments where id=current_setting('maintenance.details.failed_attachment')::uuid)<>0 then raise exception 'CANCELLED_ATTACHMENT_EXPOSED';end if;
end $$;
reset role;
do $$
declare att uuid:=current_setting('maintenance.details.failed_attachment')::uuid;path text:=current_setting('maintenance.details.failed_path');
begin
 if (select status from public.aqari_maintenance_attachments where id=att) is distinct from 'cancelled' then raise exception 'MAINTENANCE_DRAFT_CANCEL_STATUS_FAILED';end if;
 if exists(select 1 from storage.objects where bucket_id='aqari-documents' and name=path) then raise exception 'MAINTENANCE_DRAFT_STORAGE_ORPHANED';end if;
end $$;

-- An unrelated authenticated subject receives no attachment metadata and no Storage table access.
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.aqari_maintenance_attachments)<>0 then raise exception 'MAINTENANCE_ATTACHMENT_METADATA_LEAK';end if;
 begin
  perform count(*) from storage.objects where bucket_id='aqari-documents' and name=current_setting('maintenance.details.path');
  raise exception 'MAINTENANCE_ATTACHMENT_STORAGE_DIRECT_READ_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'PASS: typed tenant maintenance request, private photo finalize/readback, failed-draft cleanup and outsider isolation; fixtures rolled back.' result;
