-- Immutable rent-receipt PDF archive bound to the persisted payment receipt snapshot.
-- Apply only to the isolated V267 trial target after rent-payment integrity tables exist.
begin;

create table if not exists private.aqari_rent_receipt_pdf_artifacts(
 workspace_id uuid not null,
 receipt_no text not null,
 payment_id uuid not null references public.aqari_rent_payments(id),
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 8 and 2097152),
 pdf_sha256 text not null check(pdf_sha256 = encode(sha256(pdf_bytes),'hex')),
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 archived_by uuid not null,
 archived_at timestamptz not null default now(),
 primary key(workspace_id,receipt_no),
 unique(payment_id)
);
alter table private.aqari_rent_receipt_pdf_artifacts enable row level security;
revoke all on private.aqari_rent_receipt_pdf_artifacts from public,anon,authenticated,service_role;
create trigger aqari_rent_receipt_pdf_immutable
 before update or delete on private.aqari_rent_receipt_pdf_artifacts
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_rent_receipt_pdf_source(p_workspace_id uuid,p_receipt_no text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.aqari_rent_payments%rowtype; lease_tenant uuid; source_hash text;
begin
 if actor is null or btrim(coalesce(p_receipt_no,''))='' or length(p_receipt_no)>150 or p_receipt_no ~ '[[:cntrl:]]' then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 select rp.*,l.tenant_id into p,lease_tenant
 from public.aqari_rent_payments rp
 join public.aqari_leases l on l.workspace_id=rp.workspace_id and l.id=rp.lease_id
 where rp.workspace_id=p_workspace_id and rp.reference=p_receipt_no;
 if not found then raise exception 'RECEIPT_NOT_FOUND' using errcode='P0002';end if;
 if not (private.aqari_can_lease(p_workspace_id,p.lease_id,'collections','read') or private.aqari_owns_tenant(p_workspace_id,lease_tenant)) then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if not jsonb_typeof(p.receipt)='object' or p.receipt->>'id' is distinct from p_receipt_no then
  raise exception 'RECEIPT_SNAPSHOT_MISMATCH' using errcode='23514';
 end if;
 source_hash:=encode(sha256(convert_to(p.receipt::text,'UTF8')),'hex');
 return jsonb_build_object('workspace_id',p_workspace_id,'receipt_no',p.reference,'payment_id',p.id,'lease_id',p.lease_id,'payment_status',p.status,'snapshot_sha256',source_hash);
end $$;
revoke all on function private.aqari_rent_receipt_pdf_source(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.aqari_rent_receipt_pdf_get(p_workspace_id uuid,p_receipt_no text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare source jsonb; artifact private.aqari_rent_receipt_pdf_artifacts%rowtype;
begin
 source:=private.aqari_rent_receipt_pdf_source(p_workspace_id,p_receipt_no);
 select * into artifact from private.aqari_rent_receipt_pdf_artifacts
 where workspace_id=p_workspace_id and receipt_no=p_receipt_no;
 if not found then return '{}'::jsonb;end if;
 if artifact.payment_id::text is distinct from source->>'payment_id' or artifact.snapshot_sha256 is distinct from source->>'snapshot_sha256' then
  raise exception 'RECEIPT_ARCHIVE_SOURCE_CHANGED' using errcode='23514';
 end if;
 return (to_jsonb(artifact)-'pdf_bytes')||jsonb_build_object(
  'pdf_base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),
  'payment_status',source->>'payment_status'
 );
end $$;
revoke all on function public.aqari_rent_receipt_pdf_get(uuid,text) from public,anon,service_role;
grant execute on function public.aqari_rent_receipt_pdf_get(uuid,text) to authenticated;

create or replace function public.aqari_rent_receipt_pdf_commit(
 p_workspace_id uuid,p_receipt_no text,p_actor_id uuid,
 p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 old_sub text:=current_setting('request.jwt.claim.sub',true); old_claims text:=current_setting('request.jwt.claims',true);
 source jsonb; bytes bytea; existing private.aqari_rent_receipt_pdf_artifacts%rowtype; payment_uuid uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_actor_id is null then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 if p_pdf_base64 is null or length(p_pdf_base64)>2796204 or p_pdf_sha256 is null or p_pdf_sha256!~'^[a-f0-9]{64}$'
  or p_renderer_version is null or length(p_renderer_version) not between 1 and 100 then
  raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';
 end if;
 perform 1 from public.aqari_rent_payments where workspace_id=p_workspace_id and reference=p_receipt_no for update;
 if not found then raise exception 'RECEIPT_NOT_FOUND' using errcode='P0002';end if;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 source:=private.aqari_rent_receipt_pdf_source(p_workspace_id,p_receipt_no);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 payment_uuid:=(source->>'payment_id')::uuid;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8')
  or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';end if;
 select * into existing from private.aqari_rent_receipt_pdf_artifacts where workspace_id=p_workspace_id and receipt_no=p_receipt_no;
 if found then
  if existing.payment_id<>payment_uuid or existing.snapshot_sha256<>source->>'snapshot_sha256' or existing.pdf_sha256<>p_pdf_sha256 then
   raise exception 'PDF_ARCHIVE_CONFLICT' using errcode='23505';
  end if;
  return jsonb_build_object('archived',true,'replayed',true,'pdf_sha256',existing.pdf_sha256,'snapshot_sha256',existing.snapshot_sha256);
 end if;
 insert into private.aqari_rent_receipt_pdf_artifacts(workspace_id,receipt_no,payment_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
 values(p_workspace_id,p_receipt_no,payment_uuid,source->>'snapshot_sha256',bytes,p_pdf_sha256,p_renderer_version,p_actor_id);
 insert into private.aqari_financial_audit(workspace_id,entity_id,action,actor_id,actor_name,reason,after_value)
 values(p_workspace_id,p_receipt_no,'rent_receipt_pdf_archived',p_actor_id,p_actor_id::text,'حفظ النسخة الأصلية من وصل الإيجار PDF',jsonb_build_object('receipt_no',p_receipt_no,'payment_id',payment_uuid,'snapshot_sha256',source->>'snapshot_sha256','pdf_sha256',p_pdf_sha256,'renderer',p_renderer_version));
 return jsonb_build_object('archived',true,'replayed',false,'pdf_sha256',p_pdf_sha256,'snapshot_sha256',source->>'snapshot_sha256');
end $$;
revoke all on function public.aqari_rent_receipt_pdf_commit(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_rent_receipt_pdf_commit(uuid,text,uuid,text,text,text) to service_role;

commit;
