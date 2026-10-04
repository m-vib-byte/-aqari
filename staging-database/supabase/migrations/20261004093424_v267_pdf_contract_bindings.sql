-- Immutable, manager-confirmed linkage of a reviewed PDF to an existing lease.
-- This does not sign/activate a lease or create any financial entry.
create table if not exists private.aqari_pdf_contract_bindings(
 artifact_document_id uuid primary key references public.aqari_documents(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null references public.aqari_properties(id),
 lease_id uuid not null references public.aqari_leases(id),
 template_document_id uuid not null references private.aqari_pdf_template_versions(document_id),
 template_revision integer not null check(template_revision>0),
 template_checksum text not null,artifact_checksum text not null,
 contract_snapshot jsonb not null,
 created_by uuid not null,created_at timestamptz not null default now()
);
create index if not exists aqari_pdf_contract_bindings_lease on private.aqari_pdf_contract_bindings(workspace_id,lease_id,created_at desc);
alter table private.aqari_pdf_contract_bindings enable row level security;
revoke all on private.aqari_pdf_contract_bindings from public,anon,authenticated;
create or replace function private.aqari_pdf_binding_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'PDF_BINDING_IMMUTABLE';end$$;
revoke all on function private.aqari_pdf_binding_immutable() from public,anon,authenticated;
do $$begin
 if not exists(select 1 from pg_trigger where tgrelid='private.aqari_pdf_contract_bindings'::regclass and tgname='immutable_binding') then
  create trigger immutable_binding before update or delete on private.aqari_pdf_contract_bindings for each row execute function private.aqari_pdf_binding_immutable();
 end if;
end$$;

create or replace function private.aqari_pdf_contract_bindings(w uuid,act text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p uuid; l public.aqari_leases;u public.aqari_units;prop public.aqari_properties;
 v private.aqari_pdf_template_versions;a private.aqari_pdf_template_approvals;
 doc public.aqari_documents;source public.aqari_documents;b private.aqari_pdf_contract_bindings;
 items jsonb;off int;q text;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=(d->>'property_id')::uuid;
 if p is null or not coalesce(private.aqari_can_property(w,p,'contracts','read'),false)
  or not coalesce(private.aqari_can_property(w,p,'documents','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into prop from public.aqari_properties where id=p and workspace_id=w;
 if prop.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if act='leases' then
  if not coalesce(private.aqari_manager(w),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if d-array['property_id','offset','query']<>'{}' or coalesce(d->>'offset','0')!~'^[0-9]{1,5}$' or length(coalesce(d->>'query',''))>100 then raise exception 'INVALID_PDF_BINDING';end if;
  off:=coalesce(d->>'offset','0')::int;q:=btrim(coalesce(d->>'query',''));
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(
   select lease.id,lease.external_ref,lease.contract_no,unit.unit_no,coalesce(lease.snapshot->>'tenant','') as tenant
   from public.aqari_leases lease join public.aqari_units unit on unit.id=lease.unit_id and unit.workspace_id=w and unit.property_id=p
   where lease.workspace_id=w and lease.status not in ('cancelled','void')
    and private.aqari_can_lease(w,lease.id,'contracts','read') and private.aqari_can_lease(w,lease.id,'documents','read')
    and (q='' or strpos(lower(concat_ws(' ',lease.contract_no,unit.unit_no,lease.snapshot->>'tenant')),lower(q))>0)
   order by lease.contract_no,lease.id limit 51 offset off)x;
  return jsonb_build_object('items',items,'has_more',jsonb_array_length(items)>50,'next_offset',off+50);
 end if;
 select * into l from public.aqari_leases where workspace_id=w and external_ref=d->>'contract_ref';
 select * into u from public.aqari_units where id=l.unit_id and workspace_id=w and property_id=p;
 if l.id is null or u.id is null or not coalesce(private.aqari_can_lease(w,l.id,'contracts','read'),false)
  or not coalesce(private.aqari_can_lease(w,l.id,'documents','read'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if act='list' then
  if d-array['property_id','contract_ref','offset']<>'{}' or coalesce(d->>'offset','0')!~'^[0-9]{1,5}$' then raise exception 'INVALID_PDF_BINDING';end if;
  off:=coalesce(d->>'offset','0')::int;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(
   select link.* from private.aqari_pdf_contract_bindings link where workspace_id=w and property_id=p and lease_id=l.id
   order by created_at desc,artifact_document_id limit 21 offset off)x;
  return jsonb_build_object('items',items,'has_more',jsonb_array_length(items)>20,'next_offset',off+20);
 elsif act<>'bind' then raise exception 'INVALID_PDF_BINDING';end if;
 if d-array['property_id','contract_ref','artifact_document_id','template_document_id','template_revision','confirmed']<>'{}'
  or d->'confirmed' is distinct from 'true'::jsonb or coalesce(d->>'template_revision','')!~'^[1-9][0-9]{0,8}$' then raise exception 'INVALID_PDF_BINDING';end if;
 if not coalesce(private.aqari_manager(w),false) or not coalesce(private.aqari_can_lease(w,l.id,'contracts','write'),false)
  or not coalesce(private.aqari_can_lease(w,l.id,'documents','write'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 -- Serialize retries using the artifact identity; a PDF cannot be reassigned.
 perform pg_advisory_xact_lock(hashtextextended('pdf-binding:'||(d->>'artifact_document_id'),0));
 select * into b from private.aqari_pdf_contract_bindings where artifact_document_id=(d->>'artifact_document_id')::uuid;
 if b.artifact_document_id is not null then
  if b.workspace_id<>w or b.property_id<>p or b.lease_id<>l.id or b.template_document_id<>(d->>'template_document_id')::uuid or b.template_revision<>(d->>'template_revision')::int
   or b.created_by<>auth.uid() then raise exception 'PDF_BINDING_CONFLICT';end if;
  return to_jsonb(b);
 end if;
 if l.status in ('cancelled','void') then raise exception 'INVALID_PDF_BINDING';end if;
 select * into v from private.aqari_pdf_template_versions where document_id=(d->>'template_document_id')::uuid and workspace_id=w and property_id=p and revision=(d->>'template_revision')::int;
 select * into a from private.aqari_pdf_template_approvals where document_id=v.document_id and workspace_id=w and property_id=p for share;
 select * into source from public.aqari_documents where id=v.document_id and workspace_id=w for share;
 select * into doc from public.aqari_documents where id=(d->>'artifact_document_id')::uuid and workspace_id=w for share;
 if v.document_id is null or a.is_active is distinct from true or source.checksum_sha256 is distinct from a.checksum_sha256
  or source.status<>'uploaded' or doc.id is null or doc.id=source.id or doc.status<>'uploaded' or doc.mime_type<>'application/pdf'
  or doc.document_type<>'property_document' or doc.entity_type<>'property' or doc.entity_ref<>prop.external_ref or doc.created_by<>auth.uid()
  or doc.checksum_sha256!~'^[a-f0-9]{64}$' or doc.size_bytes not between 1 and 4194304
  or doc.metadata->'pdf_field_template'='true'::jsonb
  or not coalesce(doc.metadata @> jsonb_build_object('property_id',p::text,'asset_role','property_contract','category','property_other','pdf_source_document_id',v.document_id::text,'pdf_source_revision',v.revision),false)
  then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 insert into private.aqari_pdf_contract_bindings(artifact_document_id,workspace_id,property_id,lease_id,template_document_id,template_revision,template_checksum,artifact_checksum,contract_snapshot,created_by)
 values(doc.id,w,p,l.id,v.document_id,v.revision,source.checksum_sha256,doc.checksum_sha256,
  jsonb_build_object('contract_ref',l.external_ref,'contract_no',l.contract_no,'tenant_id',l.tenant_id,'unit_id',u.id,'unit_no',u.unit_no,'lease_status',l.status),auth.uid()) returning * into b;
 return to_jsonb(b);
end$$;
revoke all on function private.aqari_pdf_contract_bindings(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_pdf_contract_bindings(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_pdf_contract_bindings(p_workspace_id uuid,p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.aqari_pdf_contract_bindings(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_pdf_contract_bindings(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_pdf_contract_bindings(uuid,text,jsonb) to authenticated;
