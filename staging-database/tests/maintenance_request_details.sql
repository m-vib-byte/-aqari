-- Isolated PostgreSQL/PGlite only. Synthetic users/files are rolled back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('maintenance-details-manager@example.invalid','مدير اختبار الصيانة','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f2678100-0000-4000-8000-000000000001','maintenance-details-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('maintenance.details.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;

do $$
declare w uuid:=current_setting('maintenance.details.workspace')::uuid;s jsonb;d jsonb;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["عقار صيانة تجريبي"]]'::jsonb);
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||'[{"id":"maintenance-tenant","nameAr":"مستأجر صيانة","nameEn":"Maintenance Tenant","nationality":"اختبار","civilId":"777888999111","phone":"+96550001122","email":"maintenance-tenant@example.invalid"}]'::jsonb);
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||'[{"id":"maintenance-lease","source":"v267-cloud","contract_no":"MNT-1","tenantId":"maintenance-tenant","tenant":"مستأجر صيانة","property":"عقار صيانة تجريبي","unit":"7","rent":100,"deposit":0,"status":"signed","start_date":"2026-01-01","end_date":"2026-12-31"}]'::jsonb);
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
end $$;
reset role;

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
 perform set_config('maintenance.details.attachment',reserved.attachment_id::text,true);
 perform set_config('maintenance.details.path',reserved.storage_path,true);
 if not exists(select 1 from public.aqari_maintenance_attachments where id=reserved.attachment_id and status='draft') then raise exception 'MAINTENANCE_ATTACHMENT_RESERVE_FAILED';end if;
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
end $$;
reset role;

-- An unrelated authenticated subject receives neither attachment metadata nor object access.
select set_config('request.jwt.claim.sub','f2678100-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.aqari_maintenance_attachments)<>0 then raise exception 'MAINTENANCE_ATTACHMENT_METADATA_LEAK';end if;
 if (select count(*) from storage.objects where bucket_id='aqari-documents' and name=current_setting('maintenance.details.path'))<>0 then raise exception 'MAINTENANCE_ATTACHMENT_STORAGE_LEAK';end if;
end $$;
reset role;
rollback;
select 'PASS: typed tenant maintenance request, private photo reserve/finalize/readback and outsider isolation; fixtures rolled back.' result;
