-- Independent preview only, after staff-property-scope.sql. Append-only private
-- request attachments; tenant identity never confers staff/document permissions.
begin;
create table if not exists private.aqari_maintenance_attachments(
 id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),
 request_id uuid not null references public.aqari_maintenance_requests(id),
 filename text not null check(length(btrim(filename)) between 1 and 180),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),
 checksum_sha256 text not null check(checksum_sha256~'^[a-f0-9]{64}$'),
 storage_bucket text not null default 'aqari-maintenance-private' check(storage_bucket='aqari-maintenance-private'),
 storage_path text not null unique,status text not null default 'reserved' check(status in('reserved','uploaded','cancelled')),
 created_by uuid not null,created_at timestamptz not null default now(),uploaded_at timestamptz,cancelled_at timestamptz,
 check(storage_path=workspace_id::text||'/'||request_id::text||'/'||id::text)
);
alter table private.aqari_maintenance_attachments add column if not exists cancelled_at timestamptz;
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_status_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_status_check check(status in('reserved','uploaded','cancelled'));
create index if not exists aqari_maintenance_attachments_request on private.aqari_maintenance_attachments(workspace_id,request_id,created_at,id);
alter table private.aqari_maintenance_attachments enable row level security;
revoke all on private.aqari_maintenance_attachments from public,anon,authenticated;

create or replace function private.aqari_maintenance_attachment_access(w uuid,r uuid,write_file boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.aqari_maintenance_requests m
  where m.workspace_id=w and m.id=r
   and (not write_file or m.status in('received','assigned','in_progress'))
   and (private.aqari_can_lease(w,m.lease_id,'maintenance',case when write_file then 'write' else 'read' end)
    or (private.aqari_owns_tenant(w,m.tenant_id) and (not write_file or m.created_by=auth.uid()))))
$$;
create or replace function private.aqari_maintenance_attachments(w uuid,r uuid,action text,d jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.aqari_maintenance_attachments;ident uuid;can_write boolean;
begin
 if auth.uid() is null or not private.aqari_maintenance_attachment_access(w,r,false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 can_write:=private.aqari_maintenance_attachment_access(w,r,true);
 if action='list' then return jsonb_build_object(
  'can_upload',can_write,
  'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='uploaded'),'[]'::jsonb),
  'pending_reservations',case when can_write then coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='reserved' and a.created_by=auth.uid()),'[]'::jsonb) else '[]'::jsonb end
 );end if;
 if coalesce(action,'') not in('reserve','finalize','cancel') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 -- Serialize reservations/count and request completion against the same request.
 perform 1 from public.aqari_maintenance_requests where workspace_id=w and id=r for update;
 select * into doc from private.aqari_maintenance_attachments where id=ident for update;
 if doc.id is not null and (doc.workspace_id<>w or doc.request_id<>r or doc.created_by<>auth.uid()) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 -- A lost finalize reply can be confirmed after the request is completed. This
 -- returns the existing immutable original; it never permits a new upload.
 if not can_write and not(action='finalize' and coalesce(doc.status='uploaded',false)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='cancel' then
  if doc.id is null then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
  if doc.status='uploaded' then raise invalid_parameter_value using message='ATTACHMENT_ALREADY_FINALIZED';end if;
  if doc.status='cancelled' then return to_jsonb(doc);end if;
  -- Only a still-reserved original owned by the current caller can be released.
  -- Remove any partially uploaded object server-side before freeing the slot;
  -- uploaded/finalized originals can never reach this branch.
  delete from storage.objects where bucket_id=doc.storage_bucket and name=doc.storage_path;
  update private.aqari_maintenance_attachments set status='cancelled',cancelled_at=now() where id=ident and status='reserved' returning * into doc;
  if doc.id is null then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
  return to_jsonb(doc);
 end if;
 if action='reserve' then
  if coalesce(d->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce(d->>'size_bytes','')!~'^[0-9]{1,8}$' or (d->>'size_bytes')::integer not between 1 and 10485760
   or length(btrim(coalesce(d->>'filename',''))) not between 1 and 180
   or d->>'filename' ~ '[[:cntrl:]/\\]' or coalesce(d->>'checksum_sha256','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
  if doc.id is not null then
   if doc.status='cancelled' then raise invalid_parameter_value using message='ATTACHMENT_RESERVATION_CANCELLED';end if;
   if doc.filename<>d->>'filename' or doc.mime_type<>d->>'mime_type' or doc.size_bytes<>(d->>'size_bytes')::integer or doc.checksum_sha256<>d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_RESERVATION_CONFLICT';end if;
   return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);
  end if;
  -- A browser reload or newly selected File loses its in-memory UUID. Recover
  -- only this authenticated uploader's exact content reservation under the
  -- request lock, before counting the limit. Uploaded originals are reused too
  -- when the earlier confirmation reply was lost; they are never overwritten.
  select * into doc from private.aqari_maintenance_attachments a
   where a.workspace_id=w and a.request_id=r and a.created_by=auth.uid() and a.status in('reserved','uploaded')
    and a.filename=d->>'filename' and a.mime_type=d->>'mime_type'
    and a.size_bytes=(d->>'size_bytes')::integer and a.checksum_sha256=d->>'checksum_sha256'
   order by a.created_at,a.id limit 1 for update;
  if doc.id is not null then return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);end if;
  if (select count(*) from private.aqari_maintenance_attachments where workspace_id=w and request_id=r and status in('reserved','uploaded'))>=8 then raise invalid_parameter_value using message='ATTACHMENT_LIMIT_REACHED';end if;
  insert into private.aqari_maintenance_attachments(id,workspace_id,request_id,filename,mime_type,size_bytes,checksum_sha256,storage_path,created_by)
   values(ident,w,r,d->>'filename',d->>'mime_type',(d->>'size_bytes')::integer,d->>'checksum_sha256',w::text||'/'||r::text||'/'||ident::text,auth.uid()) returning * into doc;
  return to_jsonb(doc)||jsonb_build_object('reservation_reused',false);
 end if;
 if doc.id is null or doc.status='cancelled' or doc.checksum_sha256 is distinct from d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
  and o.metadata->>'size'=doc.size_bytes::text and o.metadata->>'mimetype'=doc.mime_type) then raise invalid_parameter_value using message='STORED_FILE_NOT_CONFIRMED';end if;
 if doc.status='reserved' then update private.aqari_maintenance_attachments set status='uploaded',uploaded_at=now() where id=ident returning * into doc;end if;
 return to_jsonb(doc);
end $$;

create or replace function public.aqari_maintenance_attachments(p_workspace_id uuid,p_request_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.aqari_maintenance_attachments(p_workspace_id,p_request_id,p_action,p_data)
$$;
create or replace function private.aqari_maintenance_attachment_storage(path text,write_file boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.aqari_maintenance_attachments a
  where a.storage_path=path and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,write_file)
   and case when write_file then a.status='reserved' and a.created_by=auth.uid()
    else a.status='uploaded' or (a.status='reserved' and a.created_by=auth.uid()) end)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('aqari-maintenance-private','aqari-maintenance-private',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists aqari_maintenance_attachment_read on storage.objects;
drop policy if exists aqari_maintenance_attachment_insert on storage.objects;
create policy aqari_maintenance_attachment_read on storage.objects for select to authenticated
 using(bucket_id='aqari-maintenance-private' and private.aqari_maintenance_attachment_storage(name,false));
create policy aqari_maintenance_attachment_insert on storage.objects for insert to authenticated
 with check(bucket_id='aqari-maintenance-private' and private.aqari_maintenance_attachment_storage(name,true));
-- No UPDATE or DELETE policy: neither tenant nor staff can replace/delete an original.
-- Draft cancellation is only through the guarded SECURITY DEFINER RPC above.
revoke all on function private.aqari_maintenance_attachment_access(uuid,uuid,boolean),private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean),public.aqari_maintenance_attachments(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean),public.aqari_maintenance_attachments(uuid,uuid,text,jsonb) to authenticated;
commit;
