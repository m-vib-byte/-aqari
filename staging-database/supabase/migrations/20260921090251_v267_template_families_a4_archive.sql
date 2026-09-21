-- Additive template metadata/history and immutable, source-bound PDF archive.
-- No business row, draft, text, approval or published template is backfilled.
begin;
alter table private.aqari_rental_template_drafts_v2 add column if not exists family_id uuid;
alter table private.aqari_rental_template_drafts_v2 add column if not exists presentation jsonb;
alter table private.aqari_rental_template_drafts_v2 add column if not exists source_version_id uuid references private.aqari_rental_template_versions(id);
alter table private.aqari_rental_template_versions add column if not exists family_id uuid;
alter table private.aqari_rental_template_versions add column if not exists presentation jsonb;
-- Incomplete drafts may be autosaved; publication validates complete text separately.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='private.aqari_rental_template_drafts_v2'::regclass and contype='c' and pg_get_constraintdef(oid) like '%btrim(title)%' loop
  execute format('alter table private.aqari_rental_template_drafts_v2 drop constraint %I',c.conname);
 end loop;
 for c in select conname from pg_constraint where conrelid='private.aqari_rental_template_versions'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (workspace_id, kind, version)' loop
  execute format('alter table private.aqari_rental_template_versions drop constraint %I',c.conname);
 end loop;
end $$;
alter table private.aqari_rental_template_drafts_v2 add constraint aqari_draft_title_size_v3 check(length(title)<=200);
create unique index aqari_template_legacy_version_uq on private.aqari_rental_template_versions(workspace_id,kind,version) where family_id is null;
create unique index aqari_template_family_version_uq on private.aqari_rental_template_versions(workspace_id,family_id,version) where family_id is not null;

create table private.aqari_rental_template_draft_history(
 workspace_id uuid not null references public.aqari_workspaces(id),draft_id uuid not null references private.aqari_rental_template_drafts_v2(id),
 revision integer not null,record jsonb not null,recorded_at timestamptz not null default now(),
 primary key(workspace_id,draft_id,revision)
);
alter table private.aqari_rental_template_draft_history enable row level security;
revoke all on private.aqari_rental_template_draft_history from public,anon,authenticated,service_role;
create trigger aqari_template_history_immutable before update or delete on private.aqari_rental_template_draft_history for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_template_family(w uuid,k text) returns uuid language sql immutable set search_path='' as $$
 select md5('aqari-template-legacy-family:'||w::text||':'||k)::uuid
$$;
create function private.aqari_template_draft_snapshot(r private.aqari_rental_template_drafts_v2) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'kind_label',r.kind_label,'family_id',coalesce(r.family_id,r.id),'source_version_id',r.source_version_id,
 'base_version',coalesce((select v.version from private.aqari_rental_template_versions v where v.id=r.source_version_id and v.workspace_id=r.workspace_id),0),
 'revision',r.revision,'title',r.title,'fields',r.fields,'clauses',r.clauses,'status',r.status,'updated_at',r.updated_at)
 ||case when r.presentation is null then '{}'::jsonb else jsonb_build_object('presentation',r.presentation) end
$$;
create function private.aqari_template_draft_history_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  insert into private.aqari_rental_template_draft_history(workspace_id,draft_id,revision,record)
  values(old.workspace_id,old.id,old.revision,private.aqari_template_draft_snapshot(old)) on conflict do nothing;
 end if;
 if new.status='draft' then
  insert into private.aqari_rental_template_draft_history(workspace_id,draft_id,revision,record)
  values(new.workspace_id,new.id,new.revision,private.aqari_template_draft_snapshot(new)) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger aqari_template_draft_history_capture after insert or update on private.aqari_rental_template_drafts_v2 for each row execute function private.aqari_template_draft_history_capture();
create trigger aqari_template_draft_no_delete before delete on private.aqari_rental_template_drafts_v2 for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_template_presentation_valid(p jsonb,f jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare v jsonb;s jsonb;k text;role_name text;signer_part text;
begin
 if p is null or p='null'::jsonb then return true;end if;
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>65536 or not (p ?& array['version','paper','language','logo','signers','placements']) or exists(select 1 from jsonb_object_keys(p)x where x not in('version','paper','language','logo','signers','placements'))
 or p->'version' is distinct from '1'::jsonb or p->>'paper' is distinct from 'A4' or coalesce(p->>'language','') not in('ar','en','bilingual') then return false;end if;
 if p ? 'logo' then
  s:=p->'logo';if jsonb_typeof(s)<>'object' or exists(select 1 from jsonb_object_keys(s)x where x not in('enabled','source')) or jsonb_typeof(s->'enabled') is distinct from 'boolean' or s->>'source' is distinct from 'property' then return false;end if;
 end if;
 if p ? 'signers' then
  s:=p->'signers';if jsonb_typeof(s)<>'object' or not(s ?& array['owner','tenant']) or exists(select 1 from jsonb_object_keys(s)x where x not in('owner','tenant','receiver','accountant')) then return false;end if;
  for v in select value from jsonb_each(s) loop
   if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v)x where x not in('name','signature','fingerprint')) or jsonb_typeof(v->'name') is distinct from 'boolean' or jsonb_typeof(v->'signature') is distinct from 'boolean' or jsonb_typeof(v->'fingerprint') is distinct from 'boolean' then return false;end if;
  end loop;
 end if;
 if p ? 'placements' then
  s:=p->'placements';if jsonb_typeof(s)<>'array' or jsonb_array_length(s)>120 then return false;end if;
  if (select count(*) from jsonb_array_elements(s))<>(select count(distinct x->>'id') from jsonb_array_elements(s)x) then return false;end if;
  for v in select value from jsonb_array_elements(s) loop
   if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v)x where x not in('id','field_key','page','x_mm','y_mm','width_mm','height_mm','font_pt','language'))
    or coalesce(v->>'id','')!~'^[a-zA-Z0-9_-]{1,64}$' or coalesce(v->>'language','') not in('ar','en','bilingual')
    or coalesce(v->>'page','')!~'^[0-9]+$' then return false;end if;
   foreach k in array array['page','x_mm','y_mm','width_mm','height_mm','font_pt'] loop if jsonb_typeof(v->k) is distinct from 'number' then return false;end if;end loop;
   if (v->>'page')::numeric not between 1 and 50 or (v->>'x_mm')::numeric<8 or (v->>'y_mm')::numeric<8 or (v->>'width_mm')::numeric<8 or (v->>'height_mm')::numeric<4
    or (v->>'x_mm')::numeric+(v->>'width_mm')::numeric>202 or (v->>'y_mm')::numeric+(v->>'height_mm')::numeric>289 or (v->>'font_pt')::numeric not between 8 and 36 then return false;end if;
   k:=coalesce(v->>'field_key','');
   if k!~'^[a-z][a-z0-9_]{1,49}$' or k in('field_name','__proto__','constructor','prototype') then return false;end if;
   if k~'^(owner|tenant|receiver|accountant)_(name|signature|fingerprint)$' and not exists(select 1 from jsonb_array_elements(f)x where x->>'key'=k) then
    role_name:=split_part(k,'_',1);signer_part:=split_part(k,'_',2);
    if p#>array['signers',role_name,signer_part] is distinct from 'true'::jsonb then return false;end if;
   elsif not exists(select 1 from jsonb_array_elements(f)x where x->>'key'=k) then return false;end if;
  end loop;
 end if;
 return true;
end $$;

create function private.aqari_template_tokens_valid(title text,clauses jsonb,fields jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare txt text;token text[];k text;canonical text;seen text[]:='{}';
 aliases jsonb:='{"civil_id":"tenant_civil_id","nationality":"tenant_nationality","floor":"floor_no","tenant_passport":"tenant_passport_no","contract_start_date":"start_date","contract_end_date":"end_date","owner_representative_name":"representative_name"}';
begin
 for k in select x->>'key' from jsonb_array_elements(fields)x loop
  canonical:=coalesce(aliases->>k,k);
  if k in('field_name','constructor','prototype','__proto__') or canonical=any(seen) then return false;end if;seen:=array_append(seen,canonical);
 end loop;
 for txt in select title union all select x->>'title' from jsonb_array_elements(clauses)x union all select x->>'text' from jsonb_array_elements(clauses)x loop
  for token in select regexp_matches(txt,'\{\{([a-z][a-z0-9_]{1,49})\}\}','g') loop
   if not exists(select 1 from jsonb_array_elements(fields)x where x->>'key'=token[1]) then return false;end if;
  end loop;
  if regexp_replace(txt,'\{\{([a-z][a-z0-9_]{1,49})\}\}','','g') ~ '[{}]' then return false;end if;
 end loop;
 return true;
end $$;

create or replace function private.aqari_rental_template_snapshot(r private.aqari_rental_template_versions)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'title',r.title,'clauses',r.clauses,'content_sha256',r.content_sha256,'published_at',to_char(r.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
 ||case when r.kind_label is null then '{}'::jsonb else jsonb_build_object('kind_label',r.kind_label) end
 ||case when r.fields is null then '{}'::jsonb else jsonb_build_object('fields',r.fields) end
 ||case when r.family_id is null then '{}'::jsonb else jsonb_build_object('family_id',r.family_id) end
 ||case when r.presentation is null then '{}'::jsonb else jsonb_build_object('presentation',r.presentation) end
$$;

create or replace function private.aqari_rental_templates(w uuid,act text,d jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_rental_template_versions;sr private.aqari_system_rental_template_versions;draft private.aqari_rental_template_drafts_v2;
 source jsonb;ident uuid;fid uuid;sid uuid;k text;kl text;ttl text;content jsonb;field_list jsonb;pres jsonb;part jsonb;rid uuid;expected integer;latest integer;manager boolean;actor text;why text;hash text;chash text;normalized jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can(w,'contracts','write');
 if act='context' then return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'can_publish',manager,
  'revisable_ids',case when manager then coalesce((select jsonb_agg(id) from private.aqari_rental_template_versions where workspace_id=w),'[]'::jsonb) else '[]'::jsonb end,
  'items',coalesce((select jsonb_agg(item order by item->>'kind',item->>'family_id',(item->>'version')::int desc) from(
   select private.aqari_rental_template_snapshot(v) item from private.aqari_rental_template_versions v where workspace_id=w
   union all select private.aqari_system_rental_template_snapshot(s) from private.aqari_system_rental_template_versions s where workspace_id=w)q),'[]'::jsonb),
  'drafts',case when manager then coalesce((select jsonb_agg(private.aqari_template_draft_snapshot(q) order by updated_at desc) from private.aqari_rental_template_drafts_v2 q where workspace_id=w and status='draft'),'[]'::jsonb) else '[]'::jsonb end);end if;
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>300000 then raise invalid_parameter_value using message='INVALID_TEMPLATE_REQUEST';end if;
 ident:=nullif(d->>'id','')::uuid;
 if act='get' then
  select * into r from private.aqari_rental_template_versions where workspace_id=w and id=ident;
  if found then return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));end if;
  select * into sr from private.aqari_system_rental_template_versions where workspace_id=w and id=ident;
  if not found then raise no_data_found using message='TEMPLATE_NOT_FOUND';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_system_rental_template_snapshot(sr));
 end if;
 if not manager then raise insufficient_privilege using message='إدارة نماذج العقود متاحة للمدير العام فقط.';end if;
 if act='history' then
  if exists(select 1 from private.aqari_rental_template_drafts_v2 where workspace_id=w and id=ident) then
   return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'revisions',coalesce((select jsonb_agg(to_jsonb(h)-'workspace_id'-'draft_id' order by revision desc) from private.aqari_rental_template_draft_history h where workspace_id=w and draft_id=ident),'[]'::jsonb));
  end if;
  select * into r from private.aqari_rental_template_versions where workspace_id=w and id=ident;
  if found then
   fid:=coalesce(r.family_id,private.aqari_template_family(w,r.kind));
   return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'revisions',coalesce((select jsonb_agg(jsonb_build_object('revision',v.version,'record',private.aqari_rental_template_snapshot(v),'recorded_at',v.published_at) order by v.version desc) from private.aqari_rental_template_versions v where workspace_id=w and (v.family_id=fid or(v.family_id is null and v.kind=r.kind and fid=private.aqari_template_family(w,r.kind)))),'[]'::jsonb));
  end if;
  select * into sr from private.aqari_system_rental_template_versions where workspace_id=w and id=ident;
  if not found then raise no_data_found using message='TEMPLATE_NOT_FOUND';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'revisions',jsonb_build_array(jsonb_build_object('revision',sr.version,'record',private.aqari_system_rental_template_snapshot(sr),'recorded_at',sr.imported_at)));
 end if;
 if act in('copy_draft','revise') then
  sid:=nullif(d->>'source_id','')::uuid;rid:=nullif(d->>'request_id','')::uuid;
  if ident is null or rid is null or sid is null or ident=sid then raise invalid_parameter_value using message='INVALID_TEMPLATE_COPY';end if;
  select * into draft from private.aqari_rental_template_drafts_v2 where workspace_id=w and id=ident;
  if found then
   if draft.request_id=rid and draft.created_by=auth.uid() then return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_template_draft_snapshot(draft));end if;
   raise unique_violation using message='TEMPLATE_COPY_ID_CONFLICT';
  end if;
  if act='copy_draft' then select private.aqari_template_draft_snapshot(q) into source from private.aqari_rental_template_drafts_v2 q where workspace_id=w and id=sid;end if;
  if source is null then
   select * into r from private.aqari_rental_template_versions where workspace_id=w and id=sid;
   if found then source:=private.aqari_rental_template_snapshot(r);else select * into sr from private.aqari_system_rental_template_versions where workspace_id=w and id=sid;if found then source:=private.aqari_system_rental_template_snapshot(sr);end if;end if;
  end if;
  if source is null then raise no_data_found using message='TEMPLATE_NOT_FOUND';end if;
  if act='revise' and r.id is null then raise invalid_parameter_value using message='REVISION_REQUIRES_PUBLISHED_USER_TEMPLATE';end if;
  fid:=case when act='copy_draft' then ident else coalesce(r.family_id,private.aqari_template_family(w,r.kind)) end;
  insert into private.aqari_rental_template_drafts_v2(id,workspace_id,kind,kind_label,title,fields,clauses,revision,request_id,created_by,updated_by,family_id,presentation,source_version_id)
  values(ident,w,source->>'kind',coalesce(source->>'kind_label',source->>'kind'),coalesce(d->>'title',source->>'title'),coalesce(source->'fields','[]'),source->'clauses',1,rid,auth.uid(),auth.uid(),fid,source->'presentation',case when act='revise' then r.id end) returning * into draft;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_template_draft_snapshot(draft));
 end if;
 if act not in('save_draft','publish') then raise invalid_parameter_value using message='INVALID_TEMPLATE_ACTION';end if;
 k:=d->>'kind';kl:=d->>'kind_label';ttl:=d->>'title';content:=d->'clauses';field_list:=coalesce(d->'fields','[]'::jsonb);
 if ident is null or coalesce(k,'')!~'^[a-z0-9][a-z0-9_-]{0,63}$' or coalesce(length(btrim(kl)),0) not between 1 and 80 or ttl is null or length(ttl)>200
  or jsonb_typeof(content) is distinct from 'array' or jsonb_array_length(content)>50 or octet_length(content::text)>100000
  or jsonb_typeof(field_list) is distinct from 'array' or jsonb_array_length(field_list)>50 then raise invalid_parameter_value using message='INVALID_TEMPLATE_CONTENT';end if;
 for part in select value from jsonb_array_elements(content) loop
  if jsonb_typeof(part) is distinct from 'object' or exists(select 1 from jsonb_object_keys(part)x where x not in('title','text')) or jsonb_typeof(part->'title') is distinct from 'string' or jsonb_typeof(part->'text') is distinct from 'string' or length(part->>'title')>200 or length(part->>'text')>30000 then raise invalid_parameter_value using message='INVALID_TEMPLATE_CLAUSE';end if;
 end loop;
 for part in select value from jsonb_array_elements(field_list) loop
  if jsonb_typeof(part) is distinct from 'object' or exists(select 1 from jsonb_object_keys(part)x where x not in('key','label','type','required')) or coalesce(part->>'key','')!~'^[a-z][a-z0-9_]{1,49}$' or coalesce(length(btrim(part->>'label')),0) not between 1 and 100 or coalesce(part->>'type','') not in('text','number','date','money') or jsonb_typeof(part->'required') is distinct from 'boolean' then raise invalid_parameter_value using message='INVALID_TEMPLATE_FIELD';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(field_list))<>(select count(distinct value->>'key') from jsonb_array_elements(field_list)) then raise invalid_parameter_value using message='DUPLICATE_TEMPLATE_FIELD';end if;
 if act='save_draft' then
  rid:=nullif(d->>'request_id','')::uuid;if rid is null or jsonb_typeof(d->'revision') is distinct from 'number' or d->>'revision'!~'^[0-9]+$' then raise invalid_parameter_value using message='INVALID_DRAFT_REQUEST';end if;expected:=(d->>'revision')::int;
  select * into draft from private.aqari_rental_template_drafts_v2 where workspace_id=w and id=ident for update;
  pres:=case when d ? 'presentation' then nullif(d->'presentation','null'::jsonb) else draft.presentation end;
  if not private.aqari_template_presentation_valid(pres,field_list) then raise invalid_parameter_value using message='INVALID_TEMPLATE_PRESENTATION';end if;
  if draft.id is null then
   fid:=coalesce(nullif(d->>'family_id','')::uuid,ident);
   if expected<>0 then raise serialization_failure using message='DRAFT_REVISION_CONFLICT';end if;
   if fid<>ident then raise invalid_parameter_value using message='USE_REVISE_FOR_TEMPLATE_FAMILY';end if;
   insert into private.aqari_rental_template_drafts_v2(id,workspace_id,kind,kind_label,title,fields,clauses,revision,request_id,created_by,updated_by,family_id,presentation)
   values(ident,w,k,kl,ttl,field_list,content,1,rid,auth.uid(),auth.uid(),fid,pres) returning * into draft;
  else
   if draft.request_id=rid then
    if draft.kind=k and draft.kind_label=kl and draft.title=ttl and draft.fields=field_list and draft.clauses=content and draft.presentation is not distinct from pres then return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_template_draft_snapshot(draft));end if;
    raise unique_violation using message='DRAFT_REQUEST_REUSED';
   end if;
   if draft.status<>'draft' or draft.revision<>expected then raise serialization_failure using message='DRAFT_REVISION_CONFLICT';end if;
   if d ? 'family_id' and nullif(d->>'family_id','')::uuid is distinct from coalesce(draft.family_id,draft.id) then raise check_violation using message='TEMPLATE_FAMILY_IMMUTABLE';end if;
   if draft.source_version_id is not null and draft.kind<>k then raise check_violation using message='TEMPLATE_FAMILY_KIND_IMMUTABLE';end if;
   update private.aqari_rental_template_drafts_v2 set kind=k,kind_label=kl,title=ttl,fields=field_list,clauses=content,presentation=pres,revision=revision+1,request_id=rid,updated_by=auth.uid(),updated_at=now() where id=ident returning * into draft;
  end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_template_draft_snapshot(draft));
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if not private.aqari_template_tokens_valid(ttl,content,field_list) then raise invalid_parameter_value using message='INVALID_TEMPLATE_FIELD_TOKENS';end if;
 if d->'approved' is distinct from 'true'::jsonb or length(btrim(ttl))=0 or jsonb_array_length(content)=0 or exists(select 1 from jsonb_array_elements(content)x where length(btrim(x->>'title'))=0 or length(btrim(x->>'text'))=0) or content::text ~ '\{\{[[:space:]]*field_name[[:space:]]*\}\}' then raise invalid_parameter_value using message='REVIEW_COMPLETE_TEMPLATE_AND_PDF_FIRST';end if;
 why:=btrim(d->>'reason');sid:=nullif(d->>'source_draft_id','')::uuid;
 if sid is null or coalesce(length(why),0) not between 6 and 500 or jsonb_typeof(d->'expected_version') is distinct from 'number' or d->>'expected_version'!~'^[0-9]+$' then raise invalid_parameter_value using message='INVALID_TEMPLATE_APPROVAL';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;if not found then raise no_data_found using message='WORKSPACE_NOT_FOUND';end if;
 select * into draft from private.aqari_rental_template_drafts_v2 where workspace_id=w and id=sid for update;
 pres:=case when d ? 'presentation' then nullif(d->'presentation','null'::jsonb) else draft.presentation end;fid:=coalesce(draft.family_id,draft.id);
 if draft.id is null or draft.kind<>k or draft.kind_label<>kl or draft.title<>ttl or draft.fields<>field_list or draft.clauses<>content or draft.presentation is distinct from pres or (d ? 'revision' and (d->>'revision')::int<>draft.revision) then raise serialization_failure using message='DRAFT_CHANGED_REVIEW_AGAIN';end if;
 if not private.aqari_template_presentation_valid(pres,field_list) then raise invalid_parameter_value using message='INVALID_TEMPLATE_PRESENTATION';end if;
 normalized:=jsonb_build_object('id',ident,'family_id',fid,'kind',k,'kind_label',kl,'title',ttl,'fields',field_list,'clauses',content,'presentation',pres,'source_draft_id',sid,'revision',draft.revision,'expected_version',(d->>'expected_version')::int,'reason',why,'approved',true);
 hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
 select * into r from private.aqari_rental_template_versions where id=ident;
 if found then if r.workspace_id<>w or r.published_by<>auth.uid() or r.request_sha256<>hash then raise unique_violation using message='TEMPLATE_APPROVAL_REQUEST_REUSED';end if;return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));end if;
 if draft.status<>'draft' then raise serialization_failure using message='DRAFT_ALREADY_PUBLISHED';end if;
 select coalesce(max(v.version),0) into latest from private.aqari_rental_template_versions v where workspace_id=w and (v.family_id=fid or (v.family_id is null and v.kind=k and fid=private.aqari_template_family(w,k)));
 if latest<>(d->>'expected_version')::int then raise serialization_failure using message='TEMPLATE_VERSION_CONFLICT';end if;
 chash:=encode(sha256(convert_to((normalized-'id'-'source_draft_id'-'revision'-'expected_version'-'reason'-'approved')::text,'UTF8')),'hex');select display_name into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_rental_template_versions(id,workspace_id,family_id,kind,kind_label,version,title,fields,clauses,presentation,content_sha256,source_draft_v2_id,reason,request_sha256,published_by,published_by_name)
 values(ident,w,fid,k,kl,latest+1,ttl,field_list,content,pres,chash,sid,why,hash,auth.uid(),coalesce(actor,auth.uid()::text)) returning * into r;
 update private.aqari_rental_template_drafts_v2 set status='published',updated_by=auth.uid(),updated_at=now() where id=sid;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
end $$;

revoke all on function private.aqari_template_family(uuid,text),private.aqari_template_draft_snapshot(private.aqari_rental_template_drafts_v2),private.aqari_template_draft_history_capture(),private.aqari_template_presentation_valid(jsonb,jsonb),private.aqari_template_tokens_valid(text,jsonb,jsonb),private.aqari_rental_template_snapshot(private.aqari_rental_template_versions),private.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.aqari_rental_templates(uuid,text,jsonb) to authenticated;
-- Replace the historical three-kind trial guard without weakening approval.
create or replace function private.aqari_restrict_new_rental_template_kind() returns trigger language plpgsql set search_path='' as $$begin
 if coalesce(new.kind,'')!~'^[a-z0-9][a-z0-9_-]{0,63}$' then raise check_violation using message='INVALID_TEMPLATE_KIND';end if;return new;
end $$;
revoke all on function private.aqari_restrict_new_rental_template_kind() from public,anon,authenticated,service_role;
-- Archive functions follow below.
create table private.aqari_rental_document_archive(
 id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),
 template_id uuid not null,template_family_id uuid,template_version integer not null,
 kind text not null,title text not null,property_id uuid not null,unit_id uuid not null,tenant_id uuid not null,lease_id uuid not null,receipt_id uuid,
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),snapshot_sha256 text not null,
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 8 and 2097152),pdf_sha256 text not null,
 renderer_version text not null,issued_by uuid not null references auth.users(id),issued_by_name text not null,
 issued_at timestamptz not null default now(),reason text not null,
 check(snapshot_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')),
 check(pdf_sha256=encode(sha256(pdf_bytes),'hex')),
 unique(workspace_id,id)
);
create index aqari_rental_document_archive_scope on private.aqari_rental_document_archive(workspace_id,property_id,lease_id,issued_at desc);
alter table private.aqari_rental_document_archive enable row level security;
revoke all on private.aqari_rental_document_archive from public,anon,authenticated,service_role;
create trigger aqari_rental_document_archive_immutable before update or delete on private.aqari_rental_document_archive for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_rental_document_source(w uuid,tid uuid,lid uuid,rid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases;u public.aqari_units;p public.aqari_properties;tn public.aqari_tenants;rp public.aqari_rent_payments;
 tv private.aqari_rental_template_versions;st private.aqari_system_rental_template_versions;c jsonb;src jsonb;template jsonb;state jsonb;scopes jsonb;ptype text;
begin
 if auth.uid() is null or not private.aqari_can_lease(w,lid,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid;if not found then raise no_data_found using message='LEASE_NOT_FOUND';end if;
 select * into u from public.aqari_units where workspace_id=w and id=l.unit_id;
 select * into p from public.aqari_properties where workspace_id=w and id=u.property_id;
 select * into tn from public.aqari_tenants where workspace_id=w and id=l.tenant_id;
 if u.id is null or p.id is null or tn.id is null or not private.aqari_can_property(w,p.id,'properties','read') or not private.aqari_can_tenant(w,tn.id,'tenants','read') then raise insufficient_privilege using message='SOURCE_ACCESS_DENIED';end if;
 select private.aqari_unwrap(payload) into state from public.aqari_app_state where workspace_id=w;
 if (select count(*) from jsonb_array_elements(coalesce(state->'contractsV202','[]'))x where x->>'id' in(l.external_ref,l.id::text))<>1 then raise check_violation using message='CONTRACT_SOURCE_BINDING_MISMATCH';end if;
 select x into c from jsonb_array_elements(state->'contractsV202')x where x->>'id' in(l.external_ref,l.id::text);
 if c is distinct from l.snapshot or ((c->>'tenantId') is distinct from tn.external_ref and (c->>'tenantId') is distinct from tn.id::text)
  or (nullif(c->>'unitId','') is not null and c->>'unitId'<>u.id::text)
  or (nullif(c->>'propertyId','') is not null and c->>'propertyId'<>p.id::text) then raise check_violation using message='CONTRACT_SOURCE_BINDING_MISMATCH';end if;
 select * into tv from private.aqari_rental_template_versions where workspace_id=w and id=tid;
 if found then template:=private.aqari_rental_template_snapshot(tv);else
  select * into st from private.aqari_system_rental_template_versions where workspace_id=w and id=tid;
  if not found then raise no_data_found using message='PUBLISHED_TEMPLATE_REQUIRED';end if;template:=private.aqari_system_rental_template_snapshot(st);
 end if;
 select coalesce(property_type,'') into ptype from private.aqari_property_master where workspace_id=w and property_id=p.id;ptype:=coalesce(ptype,'');
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'template_id',s.template_id,'revision',s.revision) order by s.id),'[]'::jsonb) into scopes
 from private.aqari_property_template_scopes s where s.workspace_id=w and s.kind=template->>'kind' and s.is_active and ((s.scope_kind='property' and s.property_id=p.id) or(s.scope_kind='property_type' and lower(s.property_type)=lower(ptype)));
 if jsonb_array_length(scopes)>0 and not exists(select 1 from jsonb_array_elements(scopes)x where x->>'template_id'=tid::text) then raise check_violation using message='CONTRACT_TEMPLATE_NOT_ALLOWED_FOR_PROPERTY';end if;
 if rid is not null then
  if not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='RECEIPT_ACCESS_DENIED';end if;
  select * into rp from public.aqari_rent_payments where workspace_id=w and id=rid and lease_id=l.id;
  if not found or coalesce(rp.status,'') not in('paid','partial','مدفوع','جزئي') or coalesce(rp.amount,0)<=0 or exists(select 1 from private.aqari_receipt_cancellations x where x.workspace_id=w and x.payment_id=rp.id) then raise check_violation using message='RECEIPT_SOURCE_BINDING_MISMATCH';end if;
 elsif template->>'kind'='rent_receipt' then raise check_violation using message='RECEIPT_REQUIRED';end if;
 src:=jsonb_build_object('template',template,'lease',to_jsonb(l),'contract',c,'property',private.aqari_property_master_snapshot(w,p.id),
  'unit',private.aqari_unit_master_snapshot(w,u.id),'property_row',to_jsonb(p),'unit_row',to_jsonb(u),'tenant',to_jsonb(tn),'template_scopes',scopes,'receipt',case when rid is null then 'null'::jsonb else to_jsonb(rp) end);
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'source',src,'source_sha256',encode(sha256(convert_to(src::text,'UTF8')),'hex'));
end $$;
create function public.aqari_rental_document_source(p_workspace_id uuid,p_template_id uuid,p_lease_id uuid,p_receipt_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$select private.aqari_rental_document_source(p_workspace_id,p_template_id,p_lease_id,p_receipt_id)$$;

create function private.aqari_rental_document_archive(w uuid,act text,d jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row private.aqari_rental_document_archive;pid uuid;lid uuid;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d) is distinct from 'object' then raise invalid_parameter_value using message='INVALID_ARCHIVE_REQUEST';end if;
 if act='list' then
  pid:=nullif(d->>'property_id','')::uuid;lid:=nullif(d->>'lease_id','')::uuid;
  if pid is not null and not private.aqari_can_property(w,pid,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if lid is not null and not private.aqari_can_lease(w,lid,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'items',coalesce((select jsonb_agg(to_jsonb(a)-'pdf_bytes'-'snapshot' order by issued_at desc) from private.aqari_rental_document_archive a
   where workspace_id=w and (pid is null or property_id=pid) and (lid is null or lease_id=lid) and private.aqari_can_property(w,property_id,'properties','read') and private.aqari_can_lease(w,lease_id,'contracts','read')),'[]'::jsonb));
 elsif act='get' then
  select * into row from private.aqari_rental_document_archive where workspace_id=w and id=(d->>'id')::uuid;
  if not found then raise no_data_found using message='ARCHIVED_DOCUMENT_NOT_FOUND';end if;
  if not private.aqari_can_property(w,row.property_id,'properties','read') or not private.aqari_can_lease(w,row.lease_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',(to_jsonb(row)-'pdf_bytes')||jsonb_build_object('pdf_base64',replace(encode(row.pdf_bytes,'base64'),E'\n','')));
 end if;
 raise invalid_parameter_value using message='INVALID_ARCHIVE_ACTION';
end $$;
create function public.aqari_rental_document_archive(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql stable security invoker set search_path='' as $$select private.aqari_rental_document_archive(p_workspace_id,p_action,p_data)$$;

create function public.aqari_rental_document_issue(
 p_workspace_id uuid,p_actor_id uuid,p_actor_claims jsonb,p_request_id uuid,p_template_id uuid,p_lease_id uuid,p_receipt_id uuid,
 p_source_sha256 text,p_snapshot jsonb,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text,p_approved boolean,p_reason text
)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare oldsub text:=current_setting('request.jwt.claim.sub',true);oldclaims text:=current_setting('request.jwt.claims',true);
 src jsonb;bytes bytea;h text;actor text;a private.aqari_rental_document_archive;result jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_actor_id is null then raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';end if;
 if p_request_id is null or p_approved is distinct from true or coalesce(length(btrim(p_reason)),0) not between 6 and 500 or jsonb_typeof(p_actor_claims) is distinct from 'object'
  or jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>500000 or coalesce(p_source_sha256,'')!~'^[a-f0-9]{64}$'
  or p_pdf_base64 is null or length(p_pdf_base64)>2796204 or coalesce(p_pdf_sha256,'')!~'^[a-f0-9]{64}$' or coalesce(length(p_renderer_version),0) not between 1 and 100 then raise invalid_parameter_value using message='INVALID_DOCUMENT_ISSUE';end if;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',(p_actor_claims||jsonb_build_object('sub',p_actor_id,'role','authenticated'))::text,true);
 if not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'administration','write') or not private.aqari_can(p_workspace_id,'contracts','write') then raise insufficient_privilege using message='OWNER_APPROVAL_REQUIRED';end if;
 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 -- Common state lock serializes with current contract/template mutations. Master
 -- rows are locked too so issuance cannot straddle an owner/unit edit.
 perform 1 from public.aqari_app_state where workspace_id=p_workspace_id for update;
 lock table private.aqari_property_template_scopes in share mode;
 perform 1 from public.aqari_leases where workspace_id=p_workspace_id and id=p_lease_id for share;
 perform 1 from public.aqari_units where workspace_id=p_workspace_id and id=(select unit_id from public.aqari_leases where workspace_id=p_workspace_id and id=p_lease_id) for share;
 perform 1 from public.aqari_properties where workspace_id=p_workspace_id and id=(select u.property_id from public.aqari_units u join public.aqari_leases l on l.unit_id=u.id and l.workspace_id=u.workspace_id where l.workspace_id=p_workspace_id and l.id=p_lease_id) for share;
 perform 1 from private.aqari_property_master where workspace_id=p_workspace_id and property_id=(select u.property_id from public.aqari_units u join public.aqari_leases l on l.unit_id=u.id and l.workspace_id=u.workspace_id where l.workspace_id=p_workspace_id and l.id=p_lease_id) for share;
 perform 1 from private.aqari_unit_master where workspace_id=p_workspace_id and unit_id=(select unit_id from public.aqari_leases where workspace_id=p_workspace_id and id=p_lease_id) for share;
 perform 1 from public.aqari_tenants where workspace_id=p_workspace_id and id=(select tenant_id from public.aqari_leases where workspace_id=p_workspace_id and id=p_lease_id) for share;
 if p_receipt_id is not null then perform 1 from public.aqari_rent_payments where workspace_id=p_workspace_id and id=p_receipt_id for share;end if;
 bytes:=decode(p_pdf_base64,'base64');h:=encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise check_violation using message='INVALID_PDF_ARCHIVE';end if;
 select * into a from private.aqari_rental_document_archive where id=p_request_id;
 if found then
  if a.workspace_id<>p_workspace_id or a.issued_by<>p_actor_id or a.template_id<>p_template_id or a.lease_id<>p_lease_id or a.receipt_id is distinct from p_receipt_id or a.source_sha256<>p_source_sha256 or a.snapshot_sha256<>h or a.pdf_sha256<>p_pdf_sha256 or a.renderer_version<>p_renderer_version or a.reason<>btrim(p_reason) then raise unique_violation using message='DOCUMENT_REQUEST_REUSED';end if;
  if not private.aqari_can_property(p_workspace_id,a.property_id,'properties','read') or not private.aqari_can_lease(p_workspace_id,a.lease_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  result:=jsonb_build_object('workspace_id',p_workspace_id,'user_id',p_actor_id,'archived',true,'replayed',true,'record',to_jsonb(a)-'pdf_bytes'-'snapshot');
 else
  src:=private.aqari_rental_document_source(p_workspace_id,p_template_id,p_lease_id,p_receipt_id);
  if src->>'source_sha256'<>p_source_sha256 or p_snapshot->'source' is distinct from src->'source' then raise serialization_failure using message='DOCUMENT_SOURCE_CHANGED_REVIEW_AGAIN';end if;
  select display_name into actor from public.aqari_profiles where user_id=p_actor_id;
  insert into private.aqari_rental_document_archive(id,workspace_id,template_id,template_family_id,template_version,kind,title,property_id,unit_id,tenant_id,lease_id,receipt_id,source_sha256,snapshot,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,issued_by,issued_by_name,reason)
  values(p_request_id,p_workspace_id,p_template_id,nullif(src#>>'{source,template,family_id}','')::uuid,(src#>>'{source,template,version}')::int,src#>>'{source,template,kind}',src#>>'{source,template,title}',(src#>>'{source,property,id}')::uuid,(src#>>'{source,unit,id}')::uuid,(src#>>'{source,tenant,id}')::uuid,p_lease_id,p_receipt_id,p_source_sha256,p_snapshot,h,bytes,p_pdf_sha256,p_renderer_version,p_actor_id,coalesce(actor,p_actor_id::text),btrim(p_reason)) returning * into a;
  result:=jsonb_build_object('workspace_id',p_workspace_id,'user_id',p_actor_id,'archived',true,'replayed',false,'record',to_jsonb(a)-'pdf_bytes'-'snapshot');
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(oldsub,''),true);perform set_config('request.jwt.claims',coalesce(oldclaims,''),true);
 return result;
end $$;
revoke all on function private.aqari_rental_document_source(uuid,uuid,uuid,uuid),private.aqari_rental_document_archive(uuid,text,jsonb),public.aqari_rental_document_source(uuid,uuid,uuid,uuid),public.aqari_rental_document_archive(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.aqari_rental_document_source(uuid,uuid,uuid,uuid),private.aqari_rental_document_archive(uuid,text,jsonb),public.aqari_rental_document_source(uuid,uuid,uuid,uuid),public.aqari_rental_document_archive(uuid,text,jsonb) to authenticated;
revoke all on function public.aqari_rental_document_issue(uuid,uuid,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.aqari_rental_document_issue(uuid,uuid,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text,text,text,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
