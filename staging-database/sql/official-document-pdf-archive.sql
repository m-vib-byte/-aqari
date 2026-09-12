-- Original PDF bytes, append-only and bound to an immutable document version.
-- Apply after official-document-access-hardening.sql. No hosted target is selected here.
begin;
create table private.aqari_official_pdf_artifacts (
 workspace_id uuid not null,
 series_id uuid not null,
 version integer not null,
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 8 and 2097152),
 pdf_sha256 text not null check(pdf_sha256 = encode(sha256(pdf_bytes),'hex')),
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 archived_by uuid not null,
 archived_at timestamptz not null default now(),
 primary key(workspace_id,series_id,version),
 foreign key(workspace_id,series_id,version) references private.aqari_official_document_versions(workspace_id,series_id,version)
);
alter table private.aqari_official_pdf_artifacts enable row level security;
revoke all on private.aqari_official_pdf_artifacts from public,anon,authenticated,service_role;
create trigger aqari_official_pdf_immutable before update or delete on private.aqari_official_pdf_artifacts
 for each row execute function private.aqari_reject_immutable_change();

create function public.aqari_official_pdf_get(p_workspace_id uuid,p_document_id uuid,p_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare doc jsonb; artifact private.aqari_official_pdf_artifacts;
begin
 doc:=public.aqari_official_document_register(p_workspace_id,'get',jsonb_build_object('id',p_document_id));
 if doc='{}'::jsonb then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_version is null or not exists(select 1 from jsonb_array_elements(doc->'versions') v where (v->>'version')::integer=p_version)then
  raise exception 'DOCUMENT_VERSION_NOT_FOUND' using errcode='P0002';
 end if;
 select * into artifact from private.aqari_official_pdf_artifacts where workspace_id=p_workspace_id and series_id=p_document_id and version=p_version;
 if not found then return '{}'::jsonb;end if;
 return (to_jsonb(artifact)-'pdf_bytes')||jsonb_build_object('pdf_base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),'document_status',doc#>>'{series,status}');
end $$;
revoke all on function public.aqari_official_pdf_get(uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.aqari_official_pdf_get(uuid,uuid,integer) to authenticated;

-- Browser JWTs cannot supply arbitrary PDF bytes. Only the trusted backend can
-- commit output, and it must identify the authenticated requester. User scope is
-- checked again in this transaction, not inferred from possession of a service key.
create function public.aqari_official_pdf_commit(
 p_workspace_id uuid,p_document_id uuid,p_version integer,p_actor_id uuid,
 p_snapshot_sha256 text,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);
 doc jsonb; snapshot jsonb; bytes bytea; existing private.aqari_official_pdf_artifacts;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_actor_id is null then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 if p_pdf_base64 is null or length(p_pdf_base64)>2796204 or p_pdf_sha256 is null or p_snapshot_sha256 is null
  or p_pdf_sha256!~'^[a-f0-9]{64}$' or p_snapshot_sha256!~'^[a-f0-9]{64}$'
  or p_renderer_version is null or length(p_renderer_version) not between 1 and 100 then
  raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';
 end if;
 -- Lock the series to serialize first writers with corrections and voiding.
 perform 1 from private.aqari_official_document_series where workspace_id=p_workspace_id and id=p_document_id for update;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 doc:=public.aqari_official_document_register(p_workspace_id,'get',jsonb_build_object('id',p_document_id));
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if doc='{}'::jsonb then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select v into snapshot from jsonb_array_elements(doc->'versions') v where (v->>'version')::integer=p_version;
 if snapshot is null or snapshot->>'content_sha256' is distinct from p_snapshot_sha256 then
  raise exception 'PDF_SNAPSHOT_MISMATCH' using errcode='23514';
 end if;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8')
  or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';end if;
 select * into existing from private.aqari_official_pdf_artifacts where workspace_id=p_workspace_id and series_id=p_document_id and version=p_version;
 if found then
  if existing.pdf_sha256<>p_pdf_sha256 or existing.snapshot_sha256<>p_snapshot_sha256 then raise exception 'PDF_ARCHIVE_CONFLICT' using errcode='23505';end if;
  return jsonb_build_object('archived',true,'replayed',true,'pdf_sha256',existing.pdf_sha256);
 end if;
 if doc#>>'{series,status}'<>'issued' then raise exception 'VOID_DOCUMENT_ORIGINAL_UNAVAILABLE' using errcode='23514';end if;
 insert into private.aqari_official_pdf_artifacts(workspace_id,series_id,version,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
 values(p_workspace_id,p_document_id,p_version,p_snapshot_sha256,bytes,p_pdf_sha256,p_renderer_version,p_actor_id);
 insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
 values(gen_random_uuid(),p_workspace_id,p_document_id,'pdf_export','حفظ النسخة الأصلية من ملف PDF',p_actor_id,jsonb_build_object('version',p_version,'pdf_sha256',p_pdf_sha256,'snapshot_sha256',p_snapshot_sha256,'renderer',p_renderer_version));
 return jsonb_build_object('archived',true,'replayed',false,'pdf_sha256',p_pdf_sha256);
end $$;
revoke all on function public.aqari_official_pdf_commit(uuid,uuid,integer,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_official_pdf_commit(uuid,uuid,integer,uuid,text,text,text,text) to service_role;
commit;
