-- V267 isolated/Staging additive maintenance details. No Production target.
begin;

alter table public.aqari_maintenance_requests
 add column if not exists request_type text not null default 'other'
 check(request_type in ('general','electrical','plumbing','air_conditioning','elevator','fire_safety','other'));

create table if not exists public.aqari_maintenance_attachments(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 request_id uuid not null references public.aqari_maintenance_requests(id),
 storage_bucket text not null default 'aqari-documents' check(storage_bucket='aqari-documents'),
 storage_path text not null unique,
 original_filename text not null check(length(original_filename) between 1 and 250),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
 size_bytes bigint check(size_bytes is null or size_bytes between 1 and 10485760),
 checksum_sha256 text check(checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','uploaded','cancelled')),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 uploaded_at timestamptz,
 unique(workspace_id,id)
);
create index if not exists aqari_maintenance_attachments_request on public.aqari_maintenance_attachments(workspace_id,request_id,created_at,id);

alter table public.aqari_maintenance_attachments enable row level security;
revoke all on public.aqari_maintenance_attachments from public,anon,authenticated;
grant select on public.aqari_maintenance_attachments to authenticated;

create or replace function private.aqari_maintenance_attachment_access(w uuid,r uuid,a text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and a in ('read','write') and exists(
  select 1
  from public.aqari_maintenance_requests m
  where m.workspace_id=w and m.id=r
   and (
    (private.aqari_can(w,'maintenance',a) and private.aqari_can_lease(w,m.lease_id,'maintenance',a))
    or private.aqari_owns_tenant(w,m.tenant_id)
   )
 )
$$;
revoke all on function private.aqari_maintenance_attachment_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_attachment_access(uuid,uuid,text) to authenticated;

drop policy if exists maintenance_attachment_read on public.aqari_maintenance_attachments;
create policy maintenance_attachment_read on public.aqari_maintenance_attachments
 for select to authenticated
 using(status='uploaded' and private.aqari_maintenance_attachment_access(workspace_id,request_id,'read'));

create or replace function public.aqari_maintenance_attachment_reserve(
 p_workspace_id uuid,p_request_id uuid,p_original_filename text,p_mime_type text
) returns table(attachment_id uuid,storage_bucket text,storage_path text)
language plpgsql security definer set search_path='' as $$
declare new_id uuid:=gen_random_uuid(); ext text; new_path text;
begin
 if auth.uid() is null or not private.aqari_maintenance_attachment_access(p_workspace_id,p_request_id,'write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_original_filename is null or length(p_original_filename) not between 1 and 250
  or p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif') then raise exception 'INVALID_MAINTENANCE_ATTACHMENT';end if;
 ext:=case p_mime_type when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' else 'jpg' end;
 new_path:=p_workspace_id::text||'/maintenance/'||p_request_id::text||'/'||new_id::text||'.'||ext;
 insert into public.aqari_maintenance_attachments(id,workspace_id,request_id,storage_path,original_filename,mime_type,created_by)
 values(new_id,p_workspace_id,p_request_id,new_path,p_original_filename,p_mime_type,auth.uid());
 return query select new_id,'aqari-documents'::text,new_path;
end $$;
revoke all on function public.aqari_maintenance_attachment_reserve(uuid,uuid,text,text) from public,anon;
grant execute on function public.aqari_maintenance_attachment_reserve(uuid,uuid,text,text) to authenticated;

create or replace function public.aqari_maintenance_attachment_finalize(
 p_attachment_id uuid,p_size_bytes bigint,p_checksum text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.aqari_maintenance_attachments%rowtype; saved storage.objects%rowtype;
begin
 select * into target from public.aqari_maintenance_attachments where id=p_attachment_id for update;
 if not found or target.created_by is distinct from auth.uid()
  or not private.aqari_maintenance_attachment_access(target.workspace_id,target.request_id,'write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if target.status='uploaded' and target.size_bytes=p_size_bytes and target.checksum_sha256 is not distinct from p_checksum then return target.id;end if;
 if target.status<>'draft' or p_size_bytes not between 1 and 10485760 or p_checksum !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_MAINTENANCE_ATTACHMENT';end if;
 select * into saved from storage.objects where bucket_id=target.storage_bucket and name=target.storage_path;
 if not found or coalesce((saved.metadata->>'size')::bigint,0)<>p_size_bytes or saved.metadata->>'mimetype' is distinct from target.mime_type then raise exception 'STORED_FILE_NOT_CONFIRMED';end if;
 update public.aqari_maintenance_attachments set status='uploaded',size_bytes=p_size_bytes,checksum_sha256=p_checksum,uploaded_at=now() where id=target.id;
 return target.id;
end $$;
revoke all on function public.aqari_maintenance_attachment_finalize(uuid,bigint,text) from public,anon;
grant execute on function public.aqari_maintenance_attachment_finalize(uuid,bigint,text) to authenticated;

create or replace function public.aqari_maintenance_attachment_cancel(p_attachment_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.aqari_maintenance_attachments%rowtype;
begin
 select * into target from public.aqari_maintenance_attachments where id=p_attachment_id for update;
 if not found or target.created_by is distinct from auth.uid()
  or not private.aqari_maintenance_attachment_access(target.workspace_id,target.request_id,'write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if target.status='cancelled' then return target.id;end if;
 if target.status<>'draft' then raise exception 'INVALID_MAINTENANCE_ATTACHMENT_STATE';end if;
 delete from storage.objects where bucket_id=target.storage_bucket and name=target.storage_path;
 update public.aqari_maintenance_attachments set status='cancelled' where id=target.id;
 return target.id;
end $$;
revoke all on function public.aqari_maintenance_attachment_cancel(uuid) from public,anon;
grant execute on function public.aqari_maintenance_attachment_cancel(uuid) to authenticated;

drop policy if exists v267_maintenance_attachment_upload on storage.objects;
create policy v267_maintenance_attachment_upload on storage.objects
 for insert to authenticated
 with check(bucket_id='aqari-documents' and exists(
  select 1 from public.aqari_maintenance_attachments a
  where a.storage_bucket=bucket_id and a.storage_path=name and a.status='draft' and a.created_by=auth.uid()
   and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,'write')
 ));
drop policy if exists v267_maintenance_attachment_read on storage.objects;
create policy v267_maintenance_attachment_read on storage.objects
 for select to authenticated
 using(bucket_id='aqari-documents' and exists(
  select 1 from public.aqari_maintenance_attachments a
  where a.storage_bucket=bucket_id and a.storage_path=name and a.status='uploaded'
   and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,'read')
 ));

create or replace function public.aqari_tenant_portal_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a public.aqari_portal_accounts%rowtype;
begin
 select * into a from public.aqari_portal_accounts where user_id=auth.uid() and is_active;
 if not found or not private.aqari_owns_tenant(a.workspace_id,a.tenant_id) then raise exception 'TENANT_ACCESS_DENIED' using errcode='42501';end if;
 return jsonb_build_object(
  'account',to_jsonb(a),
  'tenant',(select to_jsonb(t) from public.aqari_tenants t where t.id=a.tenant_id),
  'leases',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.aqari_leases l where l.tenant_id=a.tenant_id),
  'payments',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.aqari_rent_payments p join public.aqari_leases l on l.id=p.lease_id where l.tenant_id=a.tenant_id),
  'maintenance',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]') from public.aqari_maintenance_requests m where m.tenant_id=a.tenant_id),
  'maintenance_attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'request_id',x.request_id,'storage_bucket',x.storage_bucket,'storage_path',x.storage_path,'original_filename',x.original_filename,'mime_type',x.mime_type,'size_bytes',x.size_bytes,'checksum_sha256',x.checksum_sha256,'status',x.status,'created_at',x.created_at) order by x.created_at,x.id),'[]') from public.aqari_maintenance_attachments x join public.aqari_maintenance_requests m on m.id=x.request_id and m.workspace_id=x.workspace_id where m.tenant_id=a.tenant_id and x.status='uploaded')
 );
end $$;

commit;
