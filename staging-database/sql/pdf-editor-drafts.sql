-- Independent PDF working copies. No contract, payment, app-state or document writes.
create table private.aqari_pdf_editor_drafts (
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null references public.aqari_properties(id),
 document_id uuid not null references public.aqari_documents(id),
 created_by uuid not null,
 revision bigint not null check(revision>0),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=350000),
 last_request uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index aqari_pdf_editor_drafts_owner on private.aqari_pdf_editor_drafts(workspace_id,created_by,property_id,updated_at desc,id);
create index aqari_pdf_editor_drafts_document on private.aqari_pdf_editor_drafts(document_id);
create index aqari_pdf_editor_drafts_property on private.aqari_pdf_editor_drafts(property_id);
alter table private.aqari_pdf_editor_drafts enable row level security;
revoke all on private.aqari_pdf_editor_drafts from public,anon,authenticated;
comment on table private.aqari_pdf_editor_drafts is 'Private per-manager working copies. Never issued contracts, official numbers, payments or approved templates. No automatic expiration/deletion.';

create function private.aqari_pdf_editor_drafts(p_workspace_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prop uuid; doc uuid; draft uuid; req uuid; expected bigint; saved private.aqari_pdf_editor_drafts;
 snap jsonb; m jsonb; f jsonb; k text; val jsonb; ids text[]:='{}'; offset_n int; items jsonb;
begin
 if actor is null or not coalesce(private.aqari_manager(p_workspace_id),false)
  or not coalesce(private.aqari_can(p_workspace_id,'contracts','read'),false)
  then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>355000 then raise exception 'INVALID_PDF_DRAFT';end if;
 prop:=(p_data->>'property_id')::uuid;
 if prop is null or not exists(select 1 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=prop) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_action='list' then
  if p_data-array['property_id','offset']<>'{}' or coalesce(p_data->>'offset','0')!~'^[0-9]{1,5}$' then raise exception 'INVALID_PDF_DRAFT';end if;
  offset_n:=coalesce(p_data->>'offset','0')::int;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (
   select d.id,d.document_id,d.revision,d.updated_at,coalesce(nullif(d.snapshot#>>'{mapping,title}',''),'مسودة دون اسم') as title
   from private.aqari_pdf_editor_drafts d where d.workspace_id=p_workspace_id and d.property_id=prop and d.created_by=actor
   order by d.updated_at desc,d.id limit 20 offset offset_n
  ) q;
  return jsonb_build_object('items',items,'next_offset',offset_n+20,'has_more',exists(select 1 from private.aqari_pdf_editor_drafts d where d.workspace_id=p_workspace_id and d.property_id=prop and d.created_by=actor offset offset_n+20 limit 1));
 end if;
 draft:=(p_data->>'id')::uuid;
 if draft is null then raise exception 'INVALID_PDF_DRAFT';end if;
 if p_action='save' then
  if not coalesce(private.aqari_can(p_workspace_id,'contracts','write'),false) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
  if p_data-array['property_id','id','document_id','expected_revision','request_id','snapshot']<>'{}'
   or coalesce(p_data->>'expected_revision','')!~'^[0-9]{1,12}$' then raise exception 'INVALID_PDF_DRAFT';end if;
  req:=(p_data->>'request_id')::uuid;doc:=(p_data->>'document_id')::uuid;expected:=(p_data->>'expected_revision')::bigint;snap:=p_data->'snapshot';m:=snap->'mapping';
  if req is null or doc is null or snap is null or jsonb_typeof(snap)<>'object' or snap-array['mapping','values','page','selected']<>'{}'
   or octet_length(snap::text)>350000 or jsonb_typeof(m) is distinct from 'object'
   or m-array['version','title','propertyId','fields']<>'{}' or m->'version' is distinct from '1'::jsonb or m->>'propertyId' is distinct from prop::text
   or jsonb_typeof(m->'title') is distinct from 'string' or length(m->>'title')>160
   or jsonb_typeof(m->'fields') is distinct from 'array' or jsonb_array_length(m->'fields')>100
   or jsonb_typeof(snap->'page') is distinct from 'number' or jsonb_typeof(snap->'values') is distinct from 'object' or coalesce(snap->>'page','')!~'^([1-9]|[12][0-9]|30)$'
   then raise exception 'INVALID_PDF_DRAFT';end if;
  for f in select value from jsonb_array_elements(m->'fields') loop
   if jsonb_typeof(f)<>'object' or f-array['id','label','type','page','x','y','width','height','fontSize','align','color']<>'{}'
    or coalesce(f->>'id','')!~'^[A-Za-z0-9_-]{1,80}$' or f->>'id'=any(ids)
    or jsonb_typeof(f->'label') is distinct from 'string' or length(f->>'label')>100
    or coalesce(f->>'type','') not in ('text','date','number','money') or coalesce(f->>'align','') not in ('left','right','center')
    or jsonb_typeof(f->'page') is distinct from 'number' or coalesce(f->>'page','')!~'^([1-9]|[12][0-9]|30)$'
    or (f ? 'color' and coalesce(f->>'color','')!~'^#[0-9A-Fa-f]{6}$') then raise exception 'INVALID_PDF_DRAFT';end if;
   ids:=array_append(ids,f->>'id');
   foreach k in array array['x','y','width','height','fontSize'] loop
    if jsonb_typeof(f->k) is distinct from 'number' then raise exception 'INVALID_PDF_DRAFT';end if;
   end loop;
   if (f->>'x')::numeric<0 or (f->>'y')::numeric<0 or (f->>'width')::numeric<=0 or (f->>'height')::numeric<=0
    or (f->>'x')::numeric+(f->>'width')::numeric>1.000001 or (f->>'y')::numeric+(f->>'height')::numeric>1.000001
    or (f->>'fontSize')::numeric not between 6 and 48 then raise exception 'INVALID_PDF_DRAFT';end if;
  end loop;
  for k,val in select * from jsonb_each(snap->'values') loop
   if not k=any(ids) or jsonb_typeof(val)<>'string' or length(val#>>'{}')>1000 then raise exception 'INVALID_PDF_DRAFT';end if;
  end loop;
  if snap->>'selected' is not null and (jsonb_typeof(snap->'selected')<>'string' or not (snap->>'selected')=any(ids)) then raise exception 'INVALID_PDF_DRAFT';end if;
  -- Same draft serializes creation, CAS updates and lost-response retries.
  perform pg_advisory_xact_lock(hashtextextended('aqari-pdf-draft:'||draft::text,0));
 elsif p_action='get' then
  if p_data-array['property_id','id']<>'{}' then raise exception 'INVALID_PDF_DRAFT';end if;
 else raise exception 'INVALID_PDF_DRAFT';end if;
 select * into saved from private.aqari_pdf_editor_drafts d where d.id=draft;
 if found and (saved.workspace_id<>p_workspace_id or saved.property_id<>prop or saved.created_by<>actor) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_action='get' then
  if saved.id is null then raise exception 'PDF_DRAFT_NOT_FOUND';end if;
  doc:=saved.document_id;
 end if;
 if not exists(select 1 from public.aqari_documents d join public.aqari_properties p on p.id=prop and p.workspace_id=p_workspace_id
  where d.id=doc and d.workspace_id=p_workspace_id and d.status='uploaded' and d.mime_type='application/pdf'
   and d.entity_type='property' and d.entity_ref=p.external_ref and d.document_type='property_document'
   and d.metadata->>'category'='property_other' and d.metadata->>'asset_role'='property_contract' and d.metadata->>'property_id'=prop::text
 ) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_action='save' then
  if saved.id is not null and saved.last_request=req then
   if saved.document_id<>doc or saved.snapshot<>snap or saved.revision<>expected+1 then raise exception 'PDF_DRAFT_RETRY_CONFLICT';end if;
  else
   if coalesce(saved.revision,0)<>expected then raise exception 'PDF_DRAFT_REVISION_CONFLICT' using errcode='40001';end if;
   if saved.id is null then
    insert into private.aqari_pdf_editor_drafts(id,workspace_id,property_id,document_id,created_by,revision,snapshot,last_request)
     values(draft,p_workspace_id,prop,doc,actor,1,snap,req) returning * into saved;
   else
    update private.aqari_pdf_editor_drafts set document_id=doc,revision=revision+1,snapshot=snap,last_request=req,updated_at=now() where id=draft returning * into saved;
   end if;
  end if;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function private.aqari_pdf_editor_drafts(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_pdf_editor_drafts(uuid,text,jsonb) to authenticated;
create function public.aqari_pdf_editor_drafts(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.aqari_pdf_editor_drafts(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_pdf_editor_drafts(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_pdf_editor_drafts(uuid,text,jsonb) to authenticated;
