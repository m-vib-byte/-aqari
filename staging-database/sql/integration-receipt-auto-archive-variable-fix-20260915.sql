-- AQARI V267 Preview/Staging: disambiguate local receipt identity from artifact column name.
begin;
create or replace function public.aqari_rent_receipt_pdf_auto_commit(
 p_workspace_id uuid,p_payment_id uuid,p_snapshot_sha256 text,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare source jsonb;bytes bytea;existing private.aqari_rent_receipt_pdf_artifacts%rowtype;receipt_value text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_snapshot_sha256!~'^[a-f0-9]{64}$' or p_pdf_sha256!~'^[a-f0-9]{64}$' or length(coalesce(p_pdf_base64,''))>2796204 or length(coalesce(p_renderer_version,'')) not between 1 and 100 then raise check_violation using message='INVALID_PDF_ARCHIVE';end if;
 perform 1 from public.aqari_rent_payments where workspace_id=p_workspace_id and id=p_payment_id for update;if not found then raise no_data_found using message='RECEIPT_NOT_FOUND';end if;
 source:=private.aqari_rent_receipt_pdf_system_source(p_workspace_id,p_payment_id);receipt_value:=source->>'receiptNo';
 if source->>'snapshotSha256'<>p_snapshot_sha256 then raise check_violation using message='RECEIPT_SOURCE_CHANGED';end if;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise check_violation using message='INVALID_PDF_ARCHIVE';end if;
 select * into existing from private.aqari_rent_receipt_pdf_artifacts a where a.workspace_id=p_workspace_id and a.receipt_no=receipt_value;
 if found then
  if existing.payment_id<>p_payment_id or existing.snapshot_sha256<>p_snapshot_sha256 or existing.pdf_sha256<>p_pdf_sha256 then raise unique_violation using message='PDF_ARCHIVE_CONFLICT';end if;
  return jsonb_build_object('archived',true,'replayed',true,'receiptNo',receipt_value,'pdfSha256',existing.pdf_sha256,'snapshotSha256',existing.snapshot_sha256);
 end if;
 insert into private.aqari_rent_receipt_pdf_artifacts(workspace_id,receipt_no,payment_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by,archive_actor_kind)
 values(p_workspace_id,receipt_value,p_payment_id,p_snapshot_sha256,bytes,p_pdf_sha256,p_renderer_version,null,'system');
 insert into private.aqari_rent_receipt_pdf_automation_events(workspace_id,payment_id,receipt_no,snapshot_sha256,pdf_sha256,action)
 values(p_workspace_id,p_payment_id,receipt_value,p_snapshot_sha256,p_pdf_sha256,'system_auto_archive');
 return jsonb_build_object('archived',true,'replayed',false,'receiptNo',receipt_value,'pdfSha256',p_pdf_sha256,'snapshotSha256',p_snapshot_sha256);
end $$;
revoke all on function public.aqari_rent_receipt_pdf_auto_commit(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_rent_receipt_pdf_auto_commit(uuid,uuid,text,text,text,text) to service_role;
commit;
