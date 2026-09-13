alter table private.aqari_maintenance_attachments
 add column if not exists abandoned_at timestamptz,
 add column if not exists abandoned_by uuid,
 add column if not exists abandon_reason text;

alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_status_check;
alter table private.aqari_maintenance_attachments
 add constraint aqari_maintenance_attachments_status_check check(status in('reserved','uploaded','abandoned'));
alter table private.aqari_maintenance_attachments
 add constraint aqari_maintenance_attachments_abandonment_check check(
  (status='abandoned' and abandoned_at is not null and abandoned_by is not null and length(btrim(abandon_reason)) between 6 and 240)
  or (status in('reserved','uploaded') and abandoned_at is null and abandoned_by is null and abandon_reason is null)
 );

create or replace function private.aqari_maintenance_attachments(w uuid,r uuid,action text,d jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.aqari_maintenance_attachments;ident uuid;can_write boolean;can_manage boolean;reason text;
begin
 if auth.uid() is null or not private.aqari_maintenance_attachment_access(w,r,false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 can_write:=private.aqari_maintenance_attachment_access(w,r,true);
 can_manage:=exists(select 1 from public.aqari_maintenance_requests m where m.workspace_id=w and m.id=r and private.aqari_can_lease(w,m.lease_id,'maintenance','write'));
 if action='list' then
  return jsonb_build_object(
   'can_upload',can_write,
   'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='uploaded'),'[]'::jsonb),
   'pending_reservations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('can_abandon',(a.created_by=auth.uid() or can_manage)) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='reserved' and (a.created_by=auth.uid() or can_manage)),'[]'::jsonb),
   'abandoned_count',(select count(*) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='abandoned')
  );
 end if;
 if coalesce(action,'') not in('reserve','finalize','abandon') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 perform 1 from public.aqari_maintenance_requests where workspace_id=w and id=r for update;
 select * into doc from private.aqari_maintenance_attachments where id=ident for update;
 if doc.id is not null and (doc.workspace_id<>w or doc.request_id<>r
   or (action in('reserve','finalize') and doc.created_by<>auth.uid())
   or (action='abandon' and doc.created_by<>auth.uid() and not can_manage)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action in('reserve','finalize') and not private.aqari_maintenance_attachment_access(w,r,true)
   and not(action='finalize' and coalesce(doc.status='uploaded',false)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='abandon' then
  if doc.id is null then raise invalid_parameter_value using message='ATTACHMENT_NOT_FOUND';end if;
  if doc.status='uploaded' then raise invalid_parameter_value using message='ATTACHMENT_ALREADY_UPLOADED';end if;
  if doc.status='abandoned' then return to_jsonb(doc)||jsonb_build_object('abandonment_reused',true);end if;
  reason:=btrim(coalesce(d->>'reason',''));
  if length(reason) not between 6 and 240 then raise invalid_parameter_value using message='INVALID_ABANDON_REASON';end if;
  if exists(select 1 from storage.objects o where o.bucket_id=doc.storage_bucket and o.name=doc.storage_path) then raise invalid_parameter_value using message='ATTACHMENT_OBJECT_PRESENT';end if;
  update private.aqari_maintenance_attachments set status='abandoned',abandoned_at=now(),abandoned_by=auth.uid(),abandon_reason=reason where id=ident returning * into doc;
  return to_jsonb(doc)||jsonb_build_object('abandonment_reused',false);
 end if;
 if action='reserve' then
  if coalesce(d->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce(d->>'size_bytes','')!~'^[0-9]{1,8}$' or (d->>'size_bytes')::integer not between 1 and 10485760
   or length(btrim(coalesce(d->>'filename',''))) not between 1 and 180
   or d->>'filename' ~ '[[:cntrl:]/\\]' or coalesce(d->>'checksum_sha256','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
  if doc.id is not null then
   if doc.status='abandoned' then raise invalid_parameter_value using message='ATTACHMENT_RESERVATION_ABANDONED';end if;
   if doc.filename<>d->>'filename' or doc.mime_type<>d->>'mime_type' or doc.size_bytes<>(d->>'size_bytes')::integer or doc.checksum_sha256<>d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_RESERVATION_CONFLICT';end if;
   return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);
  end if;
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
 if doc.id is null or doc.status='abandoned' or doc.checksum_sha256 is distinct from d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
  and o.metadata->>'size'=doc.size_bytes::text and o.metadata->>'mimetype'=doc.mime_type) then raise invalid_parameter_value using message='STORED_FILE_NOT_CONFIRMED';end if;
 if doc.status='reserved' then update private.aqari_maintenance_attachments set status='uploaded',uploaded_at=now() where id=ident returning * into doc;end if;
 return to_jsonb(doc);
end $$;

create or replace function private.aqari_maintenance_attachment_storage(path text,write_file boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.aqari_maintenance_attachments a
  where a.storage_path=path and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,write_file)
   and case when write_file then a.status='reserved' and a.created_by=auth.uid()
    else a.status='uploaded' or (a.status='reserved' and a.created_by=auth.uid()) end)
$$;

revoke all on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean) to authenticated;