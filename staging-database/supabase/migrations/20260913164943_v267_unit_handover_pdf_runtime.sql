-- AQARI V267 Preview/Staging only: render-source and immutable PDF archive for
-- a signed move-out inspection. Apply only to the isolated V267 Staging project
-- after compliance-register.sql and operations-register.sql. No Production target.
begin;

create table if not exists private.aqari_unit_handover_pdf_artifacts(
 workspace_id uuid not null,
 inspection_id uuid not null,
 inspection_revision integer not null check(inspection_revision>0),
 lease_id uuid not null,
 unit_id uuid not null,
 snapshot_sha256 text not null check(snapshot_sha256~'^[a-f0-9]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 8 and 8388608),
 pdf_sha256 text not null check(pdf_sha256=encode(sha256(pdf_bytes),'hex')),
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 archived_by uuid not null,
 archived_at timestamptz not null default now(),
 primary key(workspace_id,inspection_id,inspection_revision),
 foreign key(workspace_id,inspection_id) references private.aqari_unit_inspections(workspace_id,id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id)
);
alter table private.aqari_unit_handover_pdf_artifacts enable row level security;
revoke all on private.aqari_unit_handover_pdf_artifacts from public,anon,authenticated,service_role;

create or replace function private.aqari_unit_handover_pdf_immutable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise exception 'UNIT_HANDOVER_PDF_IMMUTABLE' using errcode='42501';
end $$;
revoke all on function private.aqari_unit_handover_pdf_immutable() from public,anon,authenticated,service_role;
drop trigger if exists aqari_unit_handover_pdf_immutable on private.aqari_unit_handover_pdf_artifacts;
create trigger aqari_unit_handover_pdf_immutable before update or delete on private.aqari_unit_handover_pdf_artifacts
 for each row execute function private.aqari_unit_handover_pdf_immutable();

create or replace function public.aqari_unit_handover_pdf_source(p_workspace_id uuid,p_inspection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;i private.aqari_unit_inspections;l public.aqari_leases;u public.aqari_units;
 p public.aqari_properties;t public.aqari_tenants;attachments jsonb;evidence jsonb;
 expected_count integer;actual_count integer;bundle jsonb;summary_text text;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into i from private.aqari_unit_inspections x
  where x.workspace_id=w and x.id=p_inspection_id and x.kind='move_out' and x.status='signed';
 if not found or i.signed_at is null or i.tenant_signature_document_id is null or i.inspector_signature_document_id is null
  or jsonb_typeof(i.checklist)<>'array' or jsonb_array_length(i.checklist)=0
  or jsonb_typeof(i.photo_document_ids)<>'array' or jsonb_array_length(i.photo_document_ids)=0 then
  raise exception 'UNIT_HANDOVER_SIGNED_MOVE_OUT_REQUIRED' using errcode='23514';
 end if;
 select * into l from public.aqari_leases x where x.workspace_id=w and x.id=i.lease_id;
 select * into u from public.aqari_units x where x.workspace_id=w and x.id=i.unit_id and x.id=l.unit_id;
 select * into p from public.aqari_properties x where x.workspace_id=w and x.id=u.property_id;
 select * into t from public.aqari_tenants x where x.workspace_id=w and x.id=l.tenant_id;
 if l.id is null or u.id is null or p.id is null or t.id is null
  or not private.aqari_can_property(w,p.id,'maintenance','read')
  or not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 expected_count:=jsonb_array_length(i.photo_document_ids)+2;
 with roles as(
  select x.value::uuid as id,'PHOTO_'||x.ordinality::text as role,x.ordinality::integer as ord
   from jsonb_array_elements_text(i.photo_document_ids) with ordinality x(value,ordinality)
  union all select i.tenant_signature_document_id,'TENANT_SIGNATURE',1000001
  union all select i.inspector_signature_document_id,'INSPECTOR_SIGNATURE',1000002
 ),verified as(
  select r.id,r.role,r.ord,d.checksum_sha256,d.size_bytes,d.mime_type,d.storage_bucket,d.storage_path
   from roles r join public.aqari_documents d on d.workspace_id=w and d.id=r.id
   join storage.objects o on o.bucket_id=d.storage_bucket and o.name=d.storage_path
   where d.status='uploaded' and d.checksum_sha256~'^[a-f0-9]{64}$' and d.size_bytes between 1 and 26214400
    and d.mime_type in('image/jpeg','image/png','application/pdf')
    and (r.role not like 'PHOTO_%' or d.mime_type in('image/jpeg','image/png'))
    and (o.metadata->>'size')::bigint=d.size_bytes and o.metadata->>'mimetype'=d.mime_type
    and private.aqari_operations_document(w,p.id,d.id)
 )
 select count(*)::integer,
  coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'checksum_sha256',checksum_sha256,'size_bytes',size_bytes,'mime_type',mime_type) order by ord),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'checksum_sha256',checksum_sha256,'size_bytes',size_bytes,'mime_type',mime_type,'storage_bucket',storage_bucket,'storage_path',storage_path) order by ord),'[]'::jsonb)
 into actual_count,attachments,evidence from verified;
 if actual_count<>expected_count or (select count(distinct x->>'id') from jsonb_array_elements(attachments)x)<>expected_count
  or (select count(distinct x->>'role') from jsonb_array_elements(attachments)x)<>expected_count then
  raise exception 'UNIT_HANDOVER_EVIDENCE_UNVERIFIED' using errcode='23514';
 end if;
 summary_text:='محضر تسليم واستلام الوحدة '||u.unit_no||' في '||p.name||' للعقد '||l.contract_no||' والمستأجر '||t.full_name||'. الفحص المحفوظ '||i.id::text||' يتضمن '||jsonb_array_length(i.checklist)::text||' بنداً و'||jsonb_array_length(i.photo_document_ids)::text||' صورة وتوقيعَي الطرفين.';
 bundle:=jsonb_build_object(
  'kind','unit_handover','title','محضر تسليم واستلام وحدة','summary',summary_text,
  'source',jsonb_build_object('inspection_id',i.id,'lease_id',i.lease_id,'unit_id',i.unit_id,'inspection_revision',i.revision,'inspected_at',i.inspected_at,'signed_at',i.signed_at),
  'parties',jsonb_build_object('tenant_name',t.full_name,'contract_no',l.contract_no,'property_name',p.name,'unit_no',u.unit_no),
  'checklist',i.checklist,'attachments',attachments);
 return jsonb_build_object('bundle',bundle,'evidence',evidence);
end $$;
revoke all on function public.aqari_unit_handover_pdf_source(uuid,uuid) from public,anon,service_role;
grant execute on function public.aqari_unit_handover_pdf_source(uuid,uuid) to authenticated;

create or replace function public.aqari_unit_handover_pdf_get(p_workspace_id uuid,p_inspection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare source jsonb;revision integer;artifact private.aqari_unit_handover_pdf_artifacts;
begin
 source:=public.aqari_unit_handover_pdf_source(p_workspace_id,p_inspection_id);
 revision:=(source#>>'{bundle,source,inspection_revision}')::integer;
 select * into artifact from private.aqari_unit_handover_pdf_artifacts a
  where a.workspace_id=p_workspace_id and a.inspection_id=p_inspection_id and a.inspection_revision=revision;
 if not found then return '{}'::jsonb;end if;
 return (to_jsonb(artifact)-'pdf_bytes')||jsonb_build_object('pdf_base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''));
end $$;
revoke all on function public.aqari_unit_handover_pdf_get(uuid,uuid) from public,anon,service_role;
grant execute on function public.aqari_unit_handover_pdf_get(uuid,uuid) to authenticated;

create or replace function public.aqari_unit_handover_pdf_commit(
 p_workspace_id uuid,p_inspection_id uuid,p_actor_id uuid,p_source jsonb,
 p_snapshot_sha256 text,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);
 current_source jsonb;bytes bytea;revision integer;lease_id uuid;unit_id uuid;
 existing private.aqari_unit_handover_pdf_artifacts;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_actor_id is null then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 if p_source is null or jsonb_typeof(p_source)<>'object' or octet_length(p_source::text)>131072
  or p_snapshot_sha256 is null or p_snapshot_sha256!~'^[a-f0-9]{64}$'
  or p_pdf_sha256 is null or p_pdf_sha256!~'^[a-f0-9]{64}$'
  or p_pdf_base64 is null or length(p_pdf_base64)>11184812
  or p_renderer_version is null or length(p_renderer_version) not between 1 and 100 then
  raise exception 'INVALID_UNIT_HANDOVER_PDF_ARCHIVE' using errcode='23514';
 end if;
 perform 1 from private.aqari_unit_inspections i where i.workspace_id=p_workspace_id and i.id=p_inspection_id for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 current_source:=public.aqari_unit_handover_pdf_source(p_workspace_id,p_inspection_id);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if current_source is distinct from p_source then raise exception 'UNIT_HANDOVER_SOURCE_CHANGED' using errcode='40001';end if;
 revision:=(current_source#>>'{bundle,source,inspection_revision}')::integer;
 lease_id:=(current_source#>>'{bundle,source,lease_id}')::uuid;
 unit_id:=(current_source#>>'{bundle,source,unit_id}')::uuid;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 8388608 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8')
  or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise exception 'INVALID_UNIT_HANDOVER_PDF_ARCHIVE' using errcode='23514';end if;
 select * into existing from private.aqari_unit_handover_pdf_artifacts a
  where a.workspace_id=p_workspace_id and a.inspection_id=p_inspection_id and a.inspection_revision=revision;
 if found then
  if existing.pdf_sha256<>p_pdf_sha256 or existing.snapshot_sha256<>p_snapshot_sha256 then raise exception 'UNIT_HANDOVER_PDF_ARCHIVE_CONFLICT' using errcode='23505';end if;
  return jsonb_build_object('archived',true,'replayed',true,'pdf_sha256',existing.pdf_sha256,'snapshot_sha256',existing.snapshot_sha256);
 end if;
 insert into private.aqari_unit_handover_pdf_artifacts(workspace_id,inspection_id,inspection_revision,lease_id,unit_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
 values(p_workspace_id,p_inspection_id,revision,lease_id,unit_id,p_snapshot_sha256,bytes,p_pdf_sha256,p_renderer_version,p_actor_id);
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
 values(p_workspace_id,'inspections',p_inspection_id,'handover_pdf_export',p_actor_id,p_actor_id::text,'حفظ محضر تسليم واستلام PDF من فحص خروج موقع',jsonb_build_object('revision',revision,'pdf_sha256',p_pdf_sha256,'snapshot_sha256',p_snapshot_sha256,'renderer',p_renderer_version));
 return jsonb_build_object('archived',true,'replayed',false,'pdf_sha256',p_pdf_sha256,'snapshot_sha256',p_snapshot_sha256);
end $$;
revoke all on function public.aqari_unit_handover_pdf_commit(uuid,uuid,uuid,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_unit_handover_pdf_commit(uuid,uuid,uuid,jsonb,text,text,text,text) to service_role;
commit;

