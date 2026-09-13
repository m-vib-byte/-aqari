-- Upgrade the installed private attachment schema without deleting any original.
-- Apply after maintenance-attachments.sql and mfa-enforcement.sql.
begin;
-- Preserve both historical spellings. New cancellations use the latest deployed
-- cancelled state and its audit columns; no historical row is rewritten.
alter table private.aqari_maintenance_attachments
 add column if not exists cancelled_at timestamptz,
 add column if not exists cancelled_by uuid,
 add column if not exists cancel_reason text,
 add column if not exists abandoned_at timestamptz,
 add column if not exists abandoned_by uuid,
 add column if not exists abandon_reason text;
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_status_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_status_check check(status in('reserved','uploaded','cancelled','abandoned'));
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_abandonment_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_abandonment_check check(
 (status='abandoned' and abandoned_at is not null and abandoned_by is not null
  and abandon_reason is not null and length(btrim(abandon_reason)) between 6 and 240)
 or (status<>'abandoned' and abandoned_at is null and abandoned_by is null and abandon_reason is null));
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_cancellation_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_cancellation_check check(
 (status='cancelled' and cancelled_at is not null and
  ((cancelled_by is null and cancel_reason is null)
   or (cancelled_by is not null and cancel_reason is not null and length(btrim(cancel_reason)) between 6 and 240)))
 or (status<>'cancelled' and cancelled_at is null and cancelled_by is null and cancel_reason is null));

create or replace function private.aqari_maintenance_attachment_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise check_violation using message='ATTACHMENT_HISTORY_IMMUTABLE';end if;
 if old.status<>'reserved' or
  (to_jsonb(new)-array['status','uploaded_at','cancelled_at','cancelled_by','cancel_reason']) is distinct from
  (to_jsonb(old)-array['status','uploaded_at','cancelled_at','cancelled_by','cancel_reason']) then
  raise check_violation using message='ATTACHMENT_HISTORY_IMMUTABLE';
 end if;
 if new.status='cancelled' and (new.cancelled_by is distinct from auth.uid() or new.cancel_reason is null
  or length(btrim(new.cancel_reason)) not between 6 and 240 or new.cancelled_at is null or new.uploaded_at is not null) then
  raise check_violation using message='CANCELLATION_AUDIT_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function private.aqari_maintenance_attachment_immutable() from public,anon,authenticated;
drop trigger if exists aqari_maintenance_attachment_immutable on private.aqari_maintenance_attachments;
create trigger aqari_maintenance_attachment_immutable before update or delete on private.aqari_maintenance_attachments
 for each row execute function private.aqari_maintenance_attachment_immutable();

create or replace function private.aqari_maintenance_attachments(w uuid,r uuid,action text,d jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.aqari_maintenance_attachments;ident uuid;can_write boolean;why text;pending_rows jsonb;
begin
 if auth.uid() is null or not private.aqari_maintenance_attachment_access(w,r,false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 can_write:=private.aqari_maintenance_attachment_access(w,r,true);
 if action='abandon' then action:='cancel';end if;
 if action='list' then
  select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('can_abandon',can_write) order by a.created_at,a.id),'[]'::jsonb)
   into pending_rows from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='reserved' and a.created_by=auth.uid();
  return jsonb_build_object('can_upload',can_write,
   'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='uploaded'),'[]'::jsonb),
   'pending',pending_rows,'pending_reservations',pending_rows,
   'abandoned_count',(select count(*) from private.aqari_maintenance_attachments where workspace_id=w and request_id=r and status in('abandoned','cancelled') and created_by=auth.uid()),
   'cancelled',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('audit_incomplete',a.status='cancelled' and (a.cancelled_by is null or a.cancel_reason is null)) order by coalesce(a.abandoned_at,a.cancelled_at) desc,a.id) from (select * from private.aqari_maintenance_attachments where workspace_id=w and request_id=r and status in('abandoned','cancelled') and created_by=auth.uid() order by coalesce(abandoned_at,cancelled_at) desc,id limit 50)a),'[]'::jsonb));
 end if;
 if coalesce(action,'') not in('reserve','finalize','cancel','inspect') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 if action='inspect' then
  select * into doc from private.aqari_maintenance_attachments where id=ident and workspace_id=w and request_id=r and created_by=auth.uid();
  if doc.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return to_jsonb(doc)||case when doc.status='cancelled' and (doc.cancelled_by is null or doc.cancel_reason is null) then jsonb_build_object('audit_incomplete',true) else '{}'::jsonb end;
 end if;
 -- Cancellation, quota reservation, finalization and request completion serialize
 -- on the same parent. No cancelled UUID can be revived by a competing writer.
 perform 1 from public.aqari_maintenance_requests where workspace_id=w and id=r for update;
 select * into doc from private.aqari_maintenance_attachments where id=ident for update;
 if doc.id is not null and (doc.workspace_id<>w or doc.request_id<>r or doc.created_by<>auth.uid()) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='cancel' then
  why:=btrim(d->>'reason');
  if why is null or length(why) not between 6 and 240 or why~'[[:cntrl:]]'
   or exists(select 1 from jsonb_object_keys(d) k where k not in('id','reason')) then raise invalid_parameter_value using message='INVALID_CANCELLATION_REASON';end if;
  if doc.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  -- A confirmed cancellation can be reread after closure without changing its
  -- actor, reason or time. A different reason is a conflict, never a new event.
  if doc.status in('abandoned','cancelled') then
   if doc.status='cancelled' and doc.cancel_reason is null then raise invalid_parameter_value using message='ATTACHMENT_CANCELLED';end if;
   if (case doc.status when 'abandoned' then doc.abandon_reason else doc.cancel_reason end) is distinct from why then raise invalid_parameter_value using message='CANCELLATION_CONFLICT';end if;
   return to_jsonb(doc);
  end if;
  if not private.aqari_maintenance_attachment_access(w,r,true) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_require_sensitive_aal2(w);
  if doc.status<>'reserved' then raise invalid_parameter_value using message='UPLOADED_ATTACHMENT_IMMUTABLE';end if;
  update private.aqari_maintenance_attachments set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=why
   where workspace_id=w and request_id=r and id=ident returning * into doc;
  return to_jsonb(doc);
 end if;
 if doc.status in('abandoned','cancelled') then raise invalid_parameter_value using message='ATTACHMENT_CANCELLED';end if;
 if not private.aqari_maintenance_attachment_access(w,r,true) and not(action='finalize' and coalesce(doc.status='uploaded',false)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='reserve' then
  if coalesce(d->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce(d->>'size_bytes','')!~'^[0-9]{1,8}$' or (d->>'size_bytes')::integer not between 1 and 10485760
   or length(btrim(coalesce(d->>'filename',''))) not between 1 and 180
   or d->>'filename' ~ '[[:cntrl:]/\\]' or coalesce(d->>'checksum_sha256','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
  if doc.id is not null then
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
 if doc.id is null or doc.checksum_sha256 is distinct from d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
  and o.metadata->>'size'=doc.size_bytes::text and o.metadata->>'mimetype'=doc.mime_type) then raise invalid_parameter_value using message='STORED_FILE_NOT_CONFIRMED';end if;
 if doc.status='reserved' then update private.aqari_maintenance_attachments set status='uploaded',uploaded_at=now() where workspace_id=w and request_id=r and id=ident returning * into doc;end if;
 return to_jsonb(doc);
end $$;

create or replace function private.aqari_maintenance_attachment_storage(path text,write_file boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare w uuid;r uuid;
begin
 if auth.uid() is null then return false;end if;
 if write_file then
  select a.workspace_id,a.request_id into w,r from private.aqari_maintenance_attachments a
   where a.storage_path=path and a.status='reserved' and a.created_by=auth.uid()
    and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,true);
  if w is null then return false;end if;
  -- Storage insertion and cancellation use the same parent lock. Recheck the
  -- current reservation after waiting; an in-flight INSERT cannot revive it.
  perform 1 from public.aqari_maintenance_requests m where m.workspace_id=w and m.id=r for update;
 end if;
 return exists(select 1 from private.aqari_maintenance_attachments a
  where a.storage_path=path and a.status in('reserved','uploaded') and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,write_file)
   and case when write_file then a.status='reserved' and a.created_by=auth.uid()
    else a.status='uploaded' or a.created_by=auth.uid() end);
end
$$;
-- Existing public invoker wrapper and exact bucket SELECT/INSERT policies remain
-- the only public entry points. There is no object DELETE/UPDATE permission.
revoke all on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean) to authenticated;
commit;
