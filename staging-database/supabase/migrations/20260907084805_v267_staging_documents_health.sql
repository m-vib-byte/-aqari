-- Fresh Staging only. Attachments remain private; no copied production files.
create or replace function public.aqari_runtime_health() returns boolean language sql stable parallel safe security invoker set search_path='' as $$ select true $$;
revoke all on function public.aqari_runtime_health() from public;
grant execute on function public.aqari_runtime_health() to anon,authenticated;
create table public.aqari_documents(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.aqari_workspaces,document_no text not null unique,document_type text not null,entity_type text not null,entity_ref text not null,title text not null,original_filename text not null,mime_type text not null,metadata jsonb not null default '{}',storage_bucket text not null default 'aqari-documents' check(storage_bucket='aqari-documents'),storage_path text not null unique,status text not null default 'draft' check(status in ('draft','uploaded','cancelled')),size_bytes bigint,created_by uuid not null default auth.uid(),created_at timestamptz not null default now());
alter table public.aqari_documents enable row level security;
revoke all on public.aqari_documents from public,anon,authenticated;
grant select,insert on public.aqari_documents to authenticated;
grant update(status,size_bytes) on public.aqari_documents to authenticated;
create policy docs_staff_read on public.aqari_documents for select to authenticated using(private.aqari_staff(workspace_id));
create policy docs_staff_insert on public.aqari_documents for insert to authenticated with check(private.aqari_staff(workspace_id) and created_by=auth.uid() and status='draft' and storage_path like workspace_id::text||'/%');
create policy docs_staff_finalize on public.aqari_documents for update to authenticated using(private.aqari_staff(workspace_id) and status='draft') with check(private.aqari_staff(workspace_id) and status in ('uploaded','cancelled'));
create function public.aqari_reserve_document(p_workspace_id uuid,p_document_type text,p_entity_type text,p_entity_ref text,p_title text,p_original_filename text,p_mime_type text default null,p_metadata jsonb default '{}') returns table(document_id uuid,document_no text,storage_bucket text,storage_path text) language plpgsql security invoker set search_path='' as $$
declare new_id uuid:=gen_random_uuid();new_no text;new_path text;ext text;
begin
 if not private.aqari_staff(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document') or p_entity_type not in ('other','tenant','lease','property') or length(p_original_filename)>250 or nullif(p_entity_ref,'') is null then raise exception 'INVALID_DOCUMENT';end if;
 ext:=case p_mime_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' else 'docx' end;
 new_no:='DOC-'||new_id::text;new_path:=p_workspace_id::text||'/'||new_id::text||'.'||ext;
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,metadata,storage_path) values(new_id,p_workspace_id,new_no,p_document_type,p_entity_type,p_entity_ref,p_title,p_original_filename,p_mime_type,p_metadata,new_path);
 return query select new_id,new_no,'aqari-documents'::text,new_path;
end $$;
create function public.aqari_finalize_document(p_document_id uuid,p_size_bytes bigint,p_mime_type text,p_checksum text default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare target public.aqari_documents%rowtype;
begin
 select * into target from public.aqari_documents where id=p_document_id and status='draft';
 if not found or not private.aqari_staff(target.workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_size_bytes<=0 or p_size_bytes>26214400 or p_mime_type<>target.mime_type then raise exception 'INVALID_DOCUMENT';end if;
 if not exists(select 1 from storage.objects where bucket_id=target.storage_bucket and name=target.storage_path and (metadata->>'size')::bigint=p_size_bytes) then raise exception 'STORED_FILE_NOT_CONFIRMED';end if;
 update public.aqari_documents set status='uploaded',size_bytes=p_size_bytes where id=p_document_id;
 return p_document_id;
end $$;
revoke all on function public.aqari_reserve_document(uuid,text,text,text,text,text,text,jsonb),public.aqari_finalize_document(uuid,bigint,text,text) from public,anon;
grant execute on function public.aqari_reserve_document(uuid,text,text,text,text,text,text,jsonb),public.aqari_finalize_document(uuid,bigint,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('aqari-documents','aqari-documents',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy v267_document_read on storage.objects for select to authenticated using(bucket_id='aqari-documents' and exists(select 1 from public.aqari_documents d where d.storage_path=name and d.storage_bucket=bucket_id and private.aqari_staff(d.workspace_id)));
create policy v267_document_upload on storage.objects for insert to authenticated with check(bucket_id='aqari-documents' and exists(select 1 from public.aqari_documents d where d.storage_path=name and d.storage_bucket=bucket_id and d.status='draft' and private.aqari_staff(d.workspace_id)));
-- Replacements and deletion are not granted: uploaded originals remain unchanged.
