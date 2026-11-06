CREATE OR REPLACE FUNCTION public.aqari_reserve_document(p_workspace_id uuid, p_document_type text, p_entity_type text, p_entity_ref text, p_title text, p_original_filename text, p_mime_type text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(document_id uuid, document_no text, storage_bucket text, storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare new_id uuid:=gen_random_uuid();new_no text;new_path text;ext text;entity text:=p_entity_type;category text:=nullif(btrim(p_metadata->>'document_category'),'');
begin
 if not private.aqari_can(p_workspace_id,'documents','write') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if entity='other' and p_document_type='tenant_attachment' then entity:='tenant';end if;
 if not private.aqari_document_entity(p_workspace_id,entity,p_entity_ref,'write') then raise exception 'DOCUMENT_ENTITY_NOT_FOUND' using errcode='42501';end if;
 if p_mime_type is null or p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  or p_title is null or length(btrim(p_title)) not between 1 and 180 or p_original_filename is null or length(p_original_filename) not between 1 and 250
  or p_document_type not in ('tenant_attachment','signed_contract','property_document','mobile_scan')
  or (p_document_type='tenant_attachment' and entity<>'tenant') or (p_document_type='signed_contract' and entity<>'lease')
  or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>4096
  or (category is not null and not private.aqari_document_category_allowed(entity,category))
  or (p_document_type='signed_contract' and category is not null and category<>'lease_contract')
 then raise exception 'INVALID_DOCUMENT';end if;
 ext:=case p_mime_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' else 'docx' end;
 new_no:='DOC-'||new_id::text;new_path:=p_workspace_id::text||'/'||new_id::text||'.'||ext;
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,metadata,storage_path,created_by)
 values(new_id,p_workspace_id,new_no,p_document_type,entity,p_entity_ref,btrim(p_title),p_original_filename,p_mime_type,p_metadata,new_path,auth.uid());
 return query select new_id,new_no,'aqari-documents'::text,new_path;
end $function$
;
