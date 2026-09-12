-- V267 Staging additive repair for Supabase Storage API cleanup.
-- Direct DELETE from storage.objects is blocked by current Supabase Storage safeguards.
begin;

drop policy if exists v267_maintenance_attachment_delete_draft on storage.objects;
create policy v267_maintenance_attachment_delete_draft on storage.objects
 for delete to authenticated
 using(bucket_id='aqari-documents' and exists(
  select 1 from public.aqari_maintenance_attachments a
  where a.storage_bucket=bucket_id and a.storage_path=name and a.status='draft' and a.created_by=auth.uid()
   and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,'write')
 ));

create or replace function public.aqari_maintenance_attachment_cancel(p_attachment_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.aqari_maintenance_attachments%rowtype;
begin
 select * into target from public.aqari_maintenance_attachments where id=p_attachment_id for update;
 if not found or target.created_by is distinct from auth.uid()
  or not private.aqari_maintenance_attachment_access(target.workspace_id,target.request_id,'write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if target.status='cancelled' then return target.id;end if;
 if target.status<>'draft' then raise exception 'INVALID_MAINTENANCE_ATTACHMENT_STATE';end if;
 if exists(select 1 from storage.objects where bucket_id=target.storage_bucket and name=target.storage_path) then raise exception 'STORAGE_OBJECT_STILL_PRESENT';end if;
 update public.aqari_maintenance_attachments set status='cancelled' where id=target.id;
 return target.id;
end $$;
revoke all on function public.aqari_maintenance_attachment_cancel(uuid) from public,anon;
grant execute on function public.aqari_maintenance_attachment_cancel(uuid) to authenticated;

commit;
