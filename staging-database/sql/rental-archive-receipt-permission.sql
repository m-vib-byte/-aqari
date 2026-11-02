-- Local reviewed correction; not applied to any hosted database.
-- Receipt-linked archives require current collections read, regardless of document kind.
-- Preserve archive bytes, scope checks, function signature and existing privileges.
begin;
create or replace function private.aqari_rental_document_archive(w uuid,act text,d jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row private.aqari_rental_document_archive;pid uuid;lid uuid;
begin
 if auth.uid() is null or not coalesce(private.aqari_can(w,'contracts','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d) is distinct from 'object' then raise invalid_parameter_value using message='INVALID_ARCHIVE_REQUEST';end if;
 if act='list' then
  pid:=nullif(d->>'property_id','')::uuid;lid:=nullif(d->>'lease_id','')::uuid;
  if pid is not null and not coalesce(private.aqari_can_property(w,pid,'properties','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if lid is not null and not coalesce(private.aqari_can_lease(w,lid,'contracts','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'items',coalesce((select jsonb_agg(to_jsonb(a)-'pdf_bytes'-'snapshot' order by issued_at desc) from private.aqari_rental_document_archive a
   where workspace_id=w and (a.receipt_id is null or private.aqari_can(w,'collections','read')) and (pid is null or property_id=pid) and (lid is null or lease_id=lid) and private.aqari_can_property(w,property_id,'properties','read') and private.aqari_can_lease(w,lease_id,'contracts','read')),'[]'::jsonb));
 elsif act='get' then
  select * into row from private.aqari_rental_document_archive where workspace_id=w and id=(d->>'id')::uuid;
  if not found then raise no_data_found using message='ARCHIVED_DOCUMENT_NOT_FOUND';end if;
  if not coalesce(private.aqari_can_property(w,row.property_id,'properties','read'),false) or not coalesce(private.aqari_can_lease(w,row.lease_id,'contracts','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if row.receipt_id is not null and not coalesce(private.aqari_can(w,'collections','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',(to_jsonb(row)-'pdf_bytes')||jsonb_build_object('pdf_base64',replace(encode(row.pdf_bytes,'base64'),E'\n','')));
 end if;
 raise invalid_parameter_value using message='INVALID_ARCHIVE_ACTION';
end $$;
commit;
