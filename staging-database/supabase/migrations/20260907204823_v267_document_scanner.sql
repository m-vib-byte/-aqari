-- Staging-only append-only originals, linked entities and attributable audit.
alter table public.aqari_documents add column checksum_sha256 text check(checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$');
alter table public.aqari_documents add column uploaded_at timestamptz;
create index aqari_documents_entity on public.aqari_documents(workspace_id,entity_type,entity_ref,created_at desc);
create index aqari_documents_created_by on public.aqari_documents(created_by);
create function private.aqari_document_entity(w uuid,t text,r text,a text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if t='property' then return private.aqari_can(w,'properties',a) and exists(select 1 from public.aqari_properties where workspace_id=w and external_ref=r);
 elsif t='tenant' then return private.aqari_can(w,'tenants',a) and exists(select 1 from public.aqari_tenants where workspace_id=w and external_ref=r);
 elsif t='lease' then return private.aqari_can(w,'contracts',a) and exists(select 1 from public.aqari_leases where workspace_id=w and external_ref=r);
 else return false;end if;
end $$;
revoke all on function private.aqari_document_entity(uuid,text,text,text) from public,anon;
grant execute on function private.aqari_document_entity(uuid,text,text,text) to authenticated;
-- Every insert/finalize, including direct REST, must obey the same invariant.
create function private.aqari_document_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare saved storage.objects%rowtype;
begin
 if not private.aqari_can(new.workspace_id,'documents','write') or not private.aqari_document_entity(new.workspace_id,new.entity_type,new.entity_ref,'write') then raise exception 'DOCUMENT_ENTITY_NOT_FOUND' using errcode='42501';end if;
 if new.created_by is distinct from auth.uid() then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if tg_op='INSERT' then
  if new.status<>'draft' or new.size_bytes is not null or new.uploaded_at is not null then raise exception 'INVALID_DOCUMENT';end if;
  if new.storage_path not like new.workspace_id::text||'/'||new.id::text||'.%' then raise exception 'INVALID_DOCUMENT_PATH';end if;
  new.created_at:=now();
 else
  if old.status<>'draft' or old.created_by is distinct from auth.uid() then raise exception 'DOCUMENT_IMMUTABLE' using errcode='42501';end if;
  if (to_jsonb(new)-array['status','size_bytes','checksum_sha256','uploaded_at']) is distinct from (to_jsonb(old)-array['status','size_bytes','checksum_sha256','uploaded_at']) then raise exception 'DOCUMENT_IMMUTABLE';end if;
  if new.status not in ('uploaded','cancelled') then raise exception 'INVALID_DOCUMENT';end if;
  if new.status='uploaded' then
   select * into saved from storage.objects where bucket_id=new.storage_bucket and name=new.storage_path;
   if not found or coalesce((saved.metadata->>'size')::bigint,0)<>new.size_bytes or new.size_bytes not between 1 and 26214400 or saved.metadata->>'mimetype' is distinct from new.mime_type then raise exception 'STORED_FILE_NOT_CONFIRMED';end if;
   new.uploaded_at:=now();
  end if;
 end if;
 return new;
end $$;
revoke all on function private.aqari_document_guard() from public,anon,authenticated;
create trigger v267_document_guard before insert or update on public.aqari_documents for each row execute function private.aqari_document_guard();
create function private.aqari_document_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.aqari_control_audit(workspace_id,actor_id,action,entity_ref,reason,before_value,after_value)
 values(new.workspace_id,auth.uid(),case when tg_op='INSERT' then 'document.reserve' else 'document.'||new.status end,new.entity_type||':'||new.entity_ref,
 case when tg_op='INSERT' then 'حجز نسخة مستند مستقلة' else 'تأكيد حالة النسخة الأصلية' end,
 case when tg_op='UPDATE' then jsonb_build_object('id',old.id,'status',old.status) end,
 jsonb_build_object('id',new.id,'document_no',new.document_no,'status',new.status,'size_bytes',new.size_bytes,'created_by',new.created_by,'uploaded_at',new.uploaded_at));
 return new;
end $$;
revoke all on function private.aqari_document_audit() from public,anon,authenticated;
create trigger v267_document_audit after insert or update on public.aqari_documents for each row execute function private.aqari_document_audit();
-- Client table mutation is no longer needed. Narrow RPCs own reserve/finalize.
revoke insert,update on public.aqari_documents from authenticated;
revoke update(status,size_bytes) on public.aqari_documents from authenticated;
create or replace function public.aqari_reserve_document(p_workspace_id uuid,p_document_type text,p_entity_type text,p_entity_ref text,p_title text,p_original_filename text,p_mime_type text default null,p_metadata jsonb default '{}')
returns table(document_id uuid,document_no text,storage_bucket text,storage_path text) language plpgsql security definer set search_path='' as $$
declare new_id uuid:=gen_random_uuid();new_no text;new_path text;ext text;entity text:=p_entity_type;
begin
 if not private.aqari_can(p_workspace_id,'documents','write') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 -- Compatibility for the earlier tenant attachment caller; still requires an existing saved tenant.
 if entity='other' and p_document_type='tenant_attachment' then entity:='tenant';end if;
 if not private.aqari_document_entity(p_workspace_id,entity,p_entity_ref,'write') then raise exception 'DOCUMENT_ENTITY_NOT_FOUND' using errcode='42501';end if;
 if p_mime_type is null or p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  or p_title is null or length(btrim(p_title)) not between 1 and 180 or p_original_filename is null or length(p_original_filename) not between 1 and 250
  or p_document_type not in ('tenant_attachment','signed_contract','property_document','mobile_scan')
  or (p_document_type='tenant_attachment' and entity<>'tenant') or (p_document_type='signed_contract' and entity<>'lease')
  or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>4096 then raise exception 'INVALID_DOCUMENT';end if;
 ext:=case p_mime_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' else 'docx' end;
 new_no:='DOC-'||new_id::text;new_path:=p_workspace_id::text||'/'||new_id::text||'.'||ext;
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,metadata,storage_path,created_by)
 values(new_id,p_workspace_id,new_no,p_document_type,entity,p_entity_ref,btrim(p_title),p_original_filename,p_mime_type,p_metadata,new_path,auth.uid());
 return query select new_id,new_no,'aqari-documents'::text,new_path;
end $$;
create or replace function public.aqari_finalize_document(p_document_id uuid,p_size_bytes bigint,p_mime_type text,p_checksum text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target public.aqari_documents%rowtype;
begin
 select * into target from public.aqari_documents where id=p_document_id for update;
 if not found or target.created_by is distinct from auth.uid() or not private.aqari_can(target.workspace_id,'documents','write') or not private.aqari_document_entity(target.workspace_id,target.entity_type,target.entity_ref,'write') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if target.status='uploaded' and target.size_bytes=p_size_bytes and target.mime_type=p_mime_type and target.checksum_sha256 is not distinct from p_checksum then return target.id;end if;
 if target.status<>'draft' then raise exception 'DOCUMENT_IMMUTABLE';end if;
 if p_size_bytes is null or p_size_bytes not between 1 and 26214400 or p_mime_type is distinct from target.mime_type or (p_checksum is not null and p_checksum !~ '^[a-f0-9]{64}$') then raise exception 'INVALID_DOCUMENT';end if;
 update public.aqari_documents set status='uploaded',size_bytes=p_size_bytes,checksum_sha256=p_checksum where id=target.id;
 return target.id;
end $$;
alter policy docs_staff_read on public.aqari_documents using(
 (private.aqari_can(workspace_id,'documents','read') and private.aqari_document_entity(workspace_id,entity_type,entity_ref,'read'))
 or (status='uploaded' and document_type='tenant_attachment' and entity_type='tenant' and exists(select 1 from public.aqari_tenants t where t.workspace_id=aqari_documents.workspace_id and t.external_ref=aqari_documents.entity_ref and private.aqari_owns_tenant(t.workspace_id,t.id))));
alter policy v267_document_read on storage.objects using(bucket_id='aqari-documents' and exists(select 1 from public.aqari_documents d where d.storage_path=name and d.storage_bucket=bucket_id and private.aqari_can(d.workspace_id,'documents','read') and private.aqari_document_entity(d.workspace_id,d.entity_type,d.entity_ref,'read')));
alter policy v267_document_upload on storage.objects with check(bucket_id='aqari-documents' and exists(select 1 from public.aqari_documents d where d.storage_path=name and d.storage_bucket=bucket_id and d.status='draft' and d.created_by=auth.uid() and private.aqari_can(d.workspace_id,'documents','write') and private.aqari_document_entity(d.workspace_id,d.entity_type,d.entity_ref,'write')));
-- Storage UPDATE and DELETE remain ungranted. Never use upsert for originals.
create or replace function public.aqari_document_entities(p_workspace_id uuid,p_type text,p_query text default '') returns table(entity_ref text,title text) language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.aqari_can(p_workspace_id,'documents','read') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if length(coalesce(p_query,''))>100 then raise exception 'INVALID_QUERY';end if;
 if p_type='property' then return query select p.external_ref,p.name from public.aqari_properties p where p.workspace_id=p_workspace_id and (p_query='' or strpos(lower(p.name),lower(p_query))>0) order by p.name,p.id limit 50;
 elsif p_type='tenant' then return query select t.external_ref,t.full_name from public.aqari_tenants t where t.workspace_id=p_workspace_id and (p_query='' or strpos(lower(t.full_name),lower(p_query))>0 or strpos(t.civil_id,p_query)>0) order by t.full_name,t.id limit 50;
 elsif p_type='lease' then return query select l.external_ref,l.contract_no||' • '||coalesce(l.snapshot->>'property','')||' • '||coalesce(l.snapshot->>'unit','') from public.aqari_leases l where l.workspace_id=p_workspace_id and (p_query='' or strpos(lower(l.contract_no||' '||coalesce(l.snapshot->>'tenant','')||' '||coalesce(l.snapshot->>'unit','')),lower(p_query))>0) order by l.contract_no,l.id limit 50;
 else raise exception 'INVALID_ENTITY_TYPE';end if;
end $$;
revoke all on function public.aqari_document_entities(uuid,text,text) from public,anon;
grant execute on function public.aqari_document_entities(uuid,text,text) to authenticated;
