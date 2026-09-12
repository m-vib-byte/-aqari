-- AQARI V267 official forms: immutable issued snapshots and controlled archive.
-- CODE ONLY. Apply to isolated Staging after document catalog and MFA helpers.
begin;

create sequence if not exists private.aqari_official_document_no_seq;

create table private.aqari_official_document_series(
 id uuid primary key,
 workspace_id uuid not null,
 kind text not null,
 document_no text not null,
 entity_type text not null check(entity_type in ('property','unit','tenant','lease','employee','vendor','work_order','legal_case')),
 entity_id uuid not null,
 status text not null default 'issued' check(status in ('issued','void')),
 current_version integer not null default 1 check(current_version>0),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 voided_by uuid,
 voided_at timestamptz,
 void_reason text,
 unique(workspace_id,id),
 unique(workspace_id,document_no)
);

create table private.aqari_official_document_versions(
 id uuid primary key,
 workspace_id uuid not null,
 series_id uuid not null,
 version integer not null check(version>0),
 template_version integer not null check(template_version>0),
 title text not null,
 body text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 supersedes_version integer,
 issued_by uuid not null,
 issued_by_name text not null,
 issued_at timestamptz not null default now(),
 unique(workspace_id,series_id,version),
 foreign key(workspace_id,series_id) references private.aqari_official_document_series(workspace_id,id)
);

create table private.aqari_official_document_events(
 id uuid primary key,
 workspace_id uuid not null,
 series_id uuid not null,
 action text not null check(action in ('issue','supersede','void','pdf_export')),
 reason text not null,
 actor_id uuid not null,
 recorded_at timestamptz not null default now(),
 details jsonb not null default '{}',
 unique(workspace_id,id),
 foreign key(workspace_id,series_id) references private.aqari_official_document_series(workspace_id,id)
);

create index aqari_official_document_archive_scope on private.aqari_official_document_series(workspace_id,entity_type,entity_id,created_at desc);
create index aqari_official_document_versions_scope on private.aqari_official_document_versions(workspace_id,series_id,version desc);

alter table private.aqari_official_document_series enable row level security;
alter table private.aqari_official_document_versions enable row level security;
alter table private.aqari_official_document_events enable row level security;
revoke all on private.aqari_official_document_series,private.aqari_official_document_versions,private.aqari_official_document_events from public,anon,authenticated;

create trigger aqari_official_versions_immutable before update or delete on private.aqari_official_document_versions
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_official_events_immutable before update or delete on private.aqari_official_document_events
 for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_official_document_access(w uuid,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.aqari_memberships m
  where m.workspace_id=w and m.user_id=auth.uid() and m.is_active
   and (m.role='general_manager' or (not write_access and m.role='accountant'))
 )
$$;
revoke all on function private.aqari_official_document_access(uuid,boolean) from public,anon,authenticated;

create function public.aqari_official_document_register(
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
 if p_action not in ('list','get') then perform private.aqari_require_sensitive_aal2(w); end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);

 if p_action='list' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'kind',s.kind,'document_no',s.document_no,'entity_type',s.entity_type,'entity_id',s.entity_id,
   'status',s.status,'current_version',s.current_version,'created_at',s.created_at,'void_reason',s.void_reason,
   'version',jsonb_build_object('id',v.id,'title',v.title,'content_sha256',v.content_sha256,'issued_at',v.issued_at,'issued_by_name',v.issued_by_name)
  ) order by s.created_at desc) from private.aqari_official_document_series s join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id and v.version=s.current_version where s.workspace_id=w),'[]'::jsonb));
 end if;

 if p_action='get' then
  ident:=(d->>'id')::uuid;
  return coalesce((select jsonb_build_object('series',to_jsonb(s),'versions',coalesce(jsonb_agg(to_jsonb(v) order by v.version),'[]'::jsonb))
   from private.aqari_official_document_series s join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id
   where s.workspace_id=w and s.id=ident group by s.id),'{}'::jsonb);
 end if;

 reason_text:=btrim(coalesce(d->>'reason',''));
 if length(reason_text)<3 then raise exception 'DOCUMENT_REASON_REQUIRED' using errcode='23514'; end if;

 if p_action='issue' then
  ident:=(d->>'id')::uuid; doc_no:=btrim(coalesce(d->>'document_no',''));
  if doc_no='' then doc_no:='AQ-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_official_document_no_seq')::text,8,'0'); end if;
  supplied_hash:=lower(coalesce(d->>'content_sha256',''));
  if supplied_hash!~'^[a-f0-9]{64}$' or length(btrim(coalesce(d->>'kind','')))<2 or length(btrim(coalesce(d->>'title','')))<2 or length(btrim(coalesce(d->>'body','')))<5 then raise exception 'INVALID_DOCUMENT_SNAPSHOT' using errcode='23514'; end if;
  select * into series from private.aqari_official_document_series where workspace_id=w and id=ident;
  if found then
   select * into strict version_row from private.aqari_official_document_versions where workspace_id=w and series_id=ident and version=1;
   if series.kind=d->>'kind' and series.entity_type=d->>'entity_type' and series.entity_id=(d->>'entity_id')::uuid and version_row.content_sha256=supplied_hash then
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
 if series.status<>'issued' then raise exception 'DOCUMENT_ALREADY_VOID' using errcode='23514'; end if;

 if p_action='supersede' then
  if (d->>'expected_version')::integer<>series.current_version then raise exception 'STALE_DOCUMENT_VERSION' using errcode='40001'; end if;
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

revoke all on function public.aqari_official_document_register(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_official_document_register(uuid,text,jsonb) to authenticated;
commit;
