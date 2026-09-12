-- Function-only scope upgrade. Requires official-document-source-binding.sql. Preserves the archive.
begin;
create or replace function public.aqari_official_document_register(
 p_workspace_id uuid,p_action text,p_data jsonb default '{}'
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=p_data; series private.aqari_official_document_series;
 version_row private.aqari_official_document_versions; actor text; next_version integer; doc_no text;
 ident uuid; reason_text text; supplied_hash text;
begin
 if auth.uid() is null or not private.aqari_official_document_access(w,p_action<>'list' and p_action<>'get') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if p_action not in ('list','get','issue','supersede','void') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>131072 then
  raise exception 'INVALID_DOCUMENT_REQUEST' using errcode='22023';
 end if;
 if p_action not in ('list','get') then
  perform private.aqari_require_sensitive_aal2(w);
  perform 1 from public.aqari_app_state where workspace_id=w for update;
  if not found then raise exception 'DOCUMENT_WORKSPACE_UNAVAILABLE' using errcode='23514';end if;
 end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);

 if p_action='list' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'kind',s.kind,'document_no',s.document_no,'entity_type',s.entity_type,'entity_id',s.entity_id,
   'status',s.status,'current_version',s.current_version,'created_at',s.created_at,'void_reason',s.void_reason,
   'version',jsonb_build_object('id',v.id,'title',v.title,'content_sha256',v.content_sha256,'issued_at',v.issued_at,'issued_by_name',v.issued_by_name)
  ) order by s.created_at desc) from private.aqari_official_document_series s join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id and v.version=s.current_version where s.workspace_id=w and private.aqari_official_entity_scope(w,s.entity_type,s.entity_id,'read')),'[]'::jsonb));
 end if;

 if p_action='get' then
  ident:=(d->>'id')::uuid;
  return coalesce((select jsonb_build_object('series',to_jsonb(s),'versions',coalesce(jsonb_agg(to_jsonb(v) order by v.version),'[]'::jsonb))
   from private.aqari_official_document_series s join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id
   where s.workspace_id=w and s.id=ident and private.aqari_official_entity_scope(w,s.entity_type,s.entity_id,'read') group by s.id),'{}'::jsonb);
 end if;

 reason_text:=btrim(coalesce(d->>'reason',''));
 if length(reason_text)<3 then raise exception 'DOCUMENT_REASON_REQUIRED' using errcode='23514'; end if;

 if p_action='issue' then
  if not private.aqari_official_entity_scope(w,d->>'entity_type',(d->>'entity_id')::uuid,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
  perform 1 from public.aqari_workspaces where id=w for update;
  ident:=(d->>'id')::uuid; doc_no:=btrim(coalesce(d->>'document_no',''));
  if doc_no='' then doc_no:='AQ-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_official_document_no_seq')::text,8,'0'); end if;
  supplied_hash:=lower(coalesce(d->>'content_sha256',''));
  if supplied_hash!~'^[a-f0-9]{64}$' or length(btrim(coalesce(d->>'kind','')))<2 or length(btrim(coalesce(d->>'title','')))<2 or length(btrim(coalesce(d->>'body','')))<5 then raise exception 'INVALID_DOCUMENT_SNAPSHOT' using errcode='23514'; end if;
  select * into series from private.aqari_official_document_series where workspace_id=w and id=ident;
  if found then
   select * into strict version_row from private.aqari_official_document_versions where workspace_id=w and series_id=ident and version=1;
   if series.kind=d->>'kind' and series.entity_type=d->>'entity_type' and series.entity_id=(d->>'entity_id')::uuid and version_row.content_sha256=supplied_hash
    and version_row.title is not distinct from d->>'title'
    and version_row.body is not distinct from d->>'body'
    and version_row.payload is not distinct from d->'payload'
    and version_row.template_version=coalesce((d->>'template_version')::integer,1)
    and series.document_no=coalesce(nullif(btrim(d->>'document_no'),''),series.document_no) then
    return jsonb_build_object('series',to_jsonb(series),'version',to_jsonb(version_row),'replayed',true);
   end if;
   raise exception 'DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode='23505';
  end if;
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,created_by)
  values(ident,w,d->>'kind',doc_no,d->>'entity_type',(d->>'entity_id')::uuid,auth.uid()) returning * into series;
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
  values((d->>'version_id')::uuid,w,ident,1,coalesce((d->>'template_version')::integer,1),d->>'title',d->>'body',d->'payload',supplied_hash,auth.uid(),actor) returning * into version_row;
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
  values((d->>'event_id')::uuid,w,ident,'issue',reason_text,auth.uid(),jsonb_build_object('version',1,'hash',supplied_hash));
  return jsonb_build_object('series',to_jsonb(series),'version',to_jsonb(version_row));
 end if;

 ident:=(d->>'id')::uuid;
 select * into series from private.aqari_official_document_series where workspace_id=w and id=ident for update;
 if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
 if not private.aqari_official_entity_scope(w,series.entity_type,series.entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 if series.status<>'issued' then raise exception 'DOCUMENT_ALREADY_VOID' using errcode='23514'; end if;

 if p_action='supersede' then
  if (d->>'expected_version')::integer is distinct from series.current_version then raise exception 'STALE_DOCUMENT_VERSION' using errcode='40001'; end if;
  next_version:=series.current_version+1; supplied_hash:=lower(coalesce(d->>'content_sha256',''));
  if supplied_hash!~'^[a-f0-9]{64}$' or length(btrim(coalesce(d->>'title','')))<2 or length(btrim(coalesce(d->>'body','')))<5 then raise exception 'INVALID_DOCUMENT_SNAPSHOT' using errcode='23514'; end if;
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,supersedes_version,issued_by,issued_by_name)
  values((d->>'version_id')::uuid,w,ident,next_version,coalesce((d->>'template_version')::integer,1),d->>'title',d->>'body',d->'payload',supplied_hash,series.current_version,auth.uid(),actor) returning * into version_row;
  update private.aqari_official_document_series set current_version=next_version where workspace_id=w and id=ident returning * into series;
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
  values((d->>'event_id')::uuid,w,ident,'supersede',reason_text,auth.uid(),jsonb_build_object('version',next_version,'hash',supplied_hash));
  return jsonb_build_object('series',to_jsonb(series),'version',to_jsonb(version_row));
 end if;

 update private.aqari_official_document_series set status='void',voided_by=auth.uid(),voided_at=now(),void_reason=reason_text where workspace_id=w and id=ident returning * into series;
 insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
 values((d->>'event_id')::uuid,w,ident,'void',reason_text,auth.uid(),jsonb_build_object('version',series.current_version));
 return jsonb_build_object('series',to_jsonb(series));
end $$;

commit;
