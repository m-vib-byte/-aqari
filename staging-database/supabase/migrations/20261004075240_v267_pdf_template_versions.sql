-- Additive immutable PDF lineage. Existing PDFs/leases/values are not rewritten.
create table if not exists private.aqari_pdf_template_versions(
 document_id uuid primary key references private.aqari_pdf_template_approvals(document_id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null references public.aqari_properties(id),
 family_id uuid not null,revision integer not null check(revision>0),
 base_document_id uuid references private.aqari_pdf_template_approvals(document_id),
 copied_from_document_id uuid references public.aqari_documents(id),
 created_by uuid not null,created_at timestamptz not null default now(),
 unique(family_id,revision)
);
create index if not exists aqari_pdf_template_versions_scope on private.aqari_pdf_template_versions(workspace_id,property_id,family_id,revision desc);
alter table private.aqari_pdf_template_versions enable row level security;
revoke all on private.aqari_pdf_template_versions from public,anon,authenticated;
-- Existing independent approved documents become independent roots, once.
insert into private.aqari_pdf_template_versions(document_id,workspace_id,property_id,family_id,revision,created_by,created_at)
 select document_id,workspace_id,property_id,document_id,1,approved_by,approved_at from private.aqari_pdf_template_approvals
 on conflict(document_id) do nothing;
-- Preserve the previous permission/approval/request implementation privately.
do $$begin
 if to_regprocedure('private.aqari_pdf_templates_v400(uuid,text,jsonb)') is null then
  execute replace(pg_get_functiondef('private.aqari_pdf_templates(uuid,text,jsonb)'::regprocedure),
   'FUNCTION private.aqari_pdf_templates(', 'FUNCTION private.aqari_pdf_templates_v400(');
 end if;
end$$;
revoke all on function private.aqari_pdf_templates_v400(uuid,text,jsonb) from public,anon,authenticated;

create or replace function private.aqari_pdf_templates(w uuid,act text,data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb;p uuid;doc uuid;origin jsonb;parent uuid;family uuid;expected int;next_revision int;off int;
 result jsonb;items jsonb;v private.aqari_pdf_template_versions;head private.aqari_pdf_template_versions;
begin
 -- Always establish the live membership and property permissions first.
 ctx:=private.aqari_pdf_templates_v400(w,'context',jsonb_build_object('property_id',data->>'property_id','document_id',data->>'document_id'));
 p:=(data->>'property_id')::uuid;doc:=(data->>'document_id')::uuid;
 if act='context' then
  result:=private.aqari_pdf_templates_v400(w,act,data);
  select * into v from private.aqari_pdf_template_versions where document_id=doc and workspace_id=w and property_id=p;
  if v.document_id is not null then
   select * into head from private.aqari_pdf_template_versions where family_id=v.family_id order by revision desc limit 1;
   result:=result||jsonb_build_object('template_version',jsonb_build_object('document_id',v.document_id,'revision',v.revision,'is_latest',head.document_id=v.document_id));
  end if;
  return result;
 elsif act='history' then
  if (ctx->>'can_publish')::boolean is distinct from true then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if data-array['property_id','document_id','offset']<>'{}' or coalesce(data->>'offset','0')!~'^[0-9]{1,5}$' then raise exception 'INVALID_PDF_TEMPLATE_REQUEST';end if;
  off:=coalesce(data->>'offset','0')::int;
  select * into v from private.aqari_pdf_template_versions where document_id=doc and workspace_id=w and property_id=p;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from(
   select h.document_id,h.revision,h.created_at,a.mapping->>'title' as title,a.is_active,h.base_document_id,h.copied_from_document_id,
    not exists(select 1 from private.aqari_pdf_template_versions n where n.family_id=h.family_id and n.revision>h.revision) as is_latest
   from private.aqari_pdf_template_versions h join private.aqari_pdf_template_approvals a using(document_id)
   where h.family_id=v.family_id and h.workspace_id=w and h.property_id=p order by h.revision desc limit 21 offset off)q;
  return jsonb_build_object('items',items,'next_offset',off+20,'has_more',jsonb_array_length(items)>20);
 elsif act='list' then
  if data-array['property_id','offset']<>'{}' or coalesce(data->>'offset','0')!~'^[0-9]{1,5}$' then raise exception 'INVALID_PDF_TEMPLATE_REQUEST';end if;
  off:=coalesce(data->>'offset','0')::int;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from(
   select a.document_id,a.mapping->>'title' as title,a.approved_at,a.is_active,ver.revision
   from private.aqari_pdf_template_approvals a join private.aqari_pdf_template_versions ver using(document_id)
   where a.workspace_id=w and a.property_id=p
    and ((ctx->>'can_publish')::boolean or private.aqari_pdf_template_active(w,p,a.document_id))
    and not exists(select 1 from private.aqari_pdf_template_versions n where n.family_id=ver.family_id and n.revision>ver.revision)
   order by a.approved_at desc,a.document_id limit 21 offset off)q;
  return jsonb_build_object('items',items,'next_offset',off+20,'has_more',jsonb_array_length(items)>20);
 elsif act='publish' then
  if (ctx->>'can_publish')::boolean is distinct from true or not coalesce(private.aqari_can(w,'documents','write'),false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if data-array['property_id','document_id','mapping','origin']<>'{}' or doc is null then raise exception 'INVALID_PDF_TEMPLATE_REQUEST';end if;
  origin:=coalesce(nullif(data->'origin','null'::jsonb),'{}');
  if jsonb_typeof(origin)<>'object' then raise exception 'INVALID_PDF_TEMPLATE_ORIGIN';end if;
  perform pg_advisory_xact_lock(hashtextextended('pdf-template:'||doc::text,0));
  select * into v from private.aqari_pdf_template_versions where document_id=doc;
  if v.document_id is not null then
   -- Lost response retries reactivate only the same immutable document; no new revision.
   result:=private.aqari_pdf_templates_v400(w,act,data-'origin');
   return result||jsonb_build_object('revision',v.revision);
  end if;
  family:=doc;next_revision:=1;
  if origin->>'kind'='revision' then
   if origin-array['kind','document_id','revision']<>'{}' or coalesce(origin->>'revision','')!~'^[1-9][0-9]{0,8}$' then raise exception 'INVALID_PDF_TEMPLATE_ORIGIN';end if;
   parent:=(origin->>'document_id')::uuid;expected:=(origin->>'revision')::int;
   select * into v from private.aqari_pdf_template_versions where document_id=parent and workspace_id=w and property_id=p and revision=expected;
   if v.document_id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   family:=v.family_id;
   perform pg_advisory_xact_lock(hashtextextended('pdf-family:'||family::text,0));
   select * into head from private.aqari_pdf_template_versions where family_id=family order by revision desc limit 1;
   if head.document_id<>parent or head.revision<>expected then raise exception 'PDF_TEMPLATE_REVISION_CONFLICT' using errcode='40001';end if;
   next_revision:=expected+1;
  elsif origin->>'kind'='copy' then
   if origin-array['kind','document_id','property_id']<>'{}' then raise exception 'INVALID_PDF_TEMPLATE_ORIGIN';end if;
   parent:=(origin->>'document_id')::uuid;
   if parent is null or (origin->>'property_id')::uuid=p or not coalesce(private.aqari_pdf_fill_allowed(w,(origin->>'property_id')::uuid),false)
    or not exists(select 1 from public.aqari_documents d join public.aqari_properties prop on prop.id=(origin->>'property_id')::uuid and prop.workspace_id=w
     where d.id=parent and d.workspace_id=w and d.status='uploaded' and d.entity_type='property' and d.entity_ref=prop.external_ref and d.mime_type='application/pdf'
      and d.metadata @> jsonb_build_object('property_id',prop.id::text,'pdf_field_template',true,'asset_role','property_contract')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  elsif origin<>'{}' then raise exception 'INVALID_PDF_TEMPLATE_ORIGIN';end if;
  result:=private.aqari_pdf_templates_v400(w,act,data-'origin');
  insert into private.aqari_pdf_template_versions(document_id,workspace_id,property_id,family_id,revision,base_document_id,copied_from_document_id,created_by)
   values(doc,w,p,family,next_revision,case when origin->>'kind'='revision' then parent end,case when origin->>'kind'='copy' then parent end,auth.uid());
  return result||jsonb_build_object('revision',next_revision);
 end if;
 return private.aqari_pdf_templates_v400(w,act,data);
end$$;
revoke all on function private.aqari_pdf_templates(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_pdf_templates(uuid,text,jsonb) to authenticated;
