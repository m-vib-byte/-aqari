-- Manager contract-template studio: editable drafts, custom kinds and explicit publish.
-- No template is approved or published by this migration.
begin;

create table if not exists private.aqari_rental_template_drafts_v2(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 kind text not null check(kind ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
 kind_label text not null check(length(btrim(kind_label)) between 1 and 80),
 title text not null check(length(btrim(title)) between 1 and 200),
 fields jsonb not null default '[]'::jsonb,
 clauses jsonb not null,
 revision integer not null check(revision>0),
 status text not null default 'draft' check(status in('draft','published')),
 request_id uuid not null,
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,request_id)
);
create index if not exists aqari_rental_template_drafts_v2_list on private.aqari_rental_template_drafts_v2(workspace_id,status,updated_at desc);
alter table private.aqari_rental_template_drafts_v2 enable row level security;
revoke all on private.aqari_rental_template_drafts_v2 from public,anon,authenticated,service_role;

do $constraints$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='private.aqari_rental_template_versions'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%kind%' loop
  execute format('alter table private.aqari_rental_template_versions drop constraint %I',c.conname);
 end loop;
end $constraints$;
alter table private.aqari_rental_template_versions add constraint aqari_rental_template_versions_kind_v2_check check(kind ~ '^[a-z0-9][a-z0-9_-]{0,63}$');
alter table private.aqari_rental_template_versions add column if not exists kind_label text;
alter table private.aqari_rental_template_versions add column if not exists fields jsonb;
alter table private.aqari_rental_template_versions add column if not exists source_draft_v2_id uuid references private.aqari_rental_template_drafts_v2(id);

create or replace function private.aqari_rental_template_snapshot(r private.aqari_rental_template_versions)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'title',r.title,
  'clauses',r.clauses,'content_sha256',r.content_sha256,'published_at',to_char(r.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  ||case when r.kind_label is null then '{}'::jsonb else jsonb_build_object('kind_label',r.kind_label) end
  ||case when r.fields is null then '{}'::jsonb else jsonb_build_object('fields',r.fields) end
$$;
revoke all on function private.aqari_rental_template_snapshot(private.aqari_rental_template_versions) from public,anon,authenticated,service_role;

create or replace function private.aqari_rental_templates(w uuid,act text,d jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_rental_template_versions;sr private.aqari_system_rental_template_versions;draft private.aqari_rental_template_drafts_v2;
 latest integer;ident uuid;k text;kind_name text;title_value text;why text;source_id uuid;content jsonb;field_list jsonb;part jsonb;
 normalized jsonb;request_hash text;content_hash text;actor text;manager boolean;expected_revision integer;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can(w,'contracts','write');
 if act='context' then
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'can_publish',manager,
   'items',coalesce((select jsonb_agg(z.item order by z.item->>'kind',(z.item->>'version')::integer desc) from(
    select private.aqari_rental_template_snapshot(v) item from private.aqari_rental_template_versions v where v.workspace_id=w
    union all select private.aqari_system_rental_template_snapshot(s) item from private.aqari_system_rental_template_versions s where s.workspace_id=w
   )z),'[]'::jsonb),
   'drafts',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'kind_label',q.kind_label,'revision',q.revision,'title',q.title,'fields',q.fields,'clauses',q.clauses,'status',q.status,'updated_at',q.updated_at) order by q.updated_at desc) from private.aqari_rental_template_drafts_v2 q where q.workspace_id=w and q.status='draft'),'[]'::jsonb) else '[]'::jsonb end);
 end if;
 if jsonb_typeof(d) is distinct from 'object' then raise invalid_parameter_value using message='بيانات النموذج غير صالحة.';end if;
 if act='get' then
  select * into r from private.aqari_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if found then return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));end if;
  select * into sr from private.aqari_system_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if not found then raise exception 'نسخة النموذج غير موجودة في مساحة العمل الحالية.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_system_rental_template_snapshot(sr));
 end if;
 if act not in('save_draft','publish') then raise invalid_parameter_value using message='إجراء النموذج غير صالح.';end if;
 if not manager then raise insufficient_privilege using message='إدارة نماذج العقود متاحة للمدير العام فقط.';end if;
 ident:=(d->>'id')::uuid;k:=d->>'kind';kind_name:=btrim(d->>'kind_label');title_value:=btrim(d->>'title');content:=d->'clauses';field_list:=coalesce(d->'fields','[]'::jsonb);
 if ident is null or k is null or k!~'^[a-z0-9][a-z0-9_-]{0,63}$' or length(kind_name) not between 1 and 80 or length(title_value) not between 1 and 200
  or jsonb_typeof(content) is distinct from 'array' or jsonb_array_length(content) not between 1 and 50 or octet_length(content::text)>100000
  or jsonb_typeof(field_list) is distinct from 'array' or jsonb_array_length(field_list)>50
 then raise invalid_parameter_value using message='أكمل نوع النموذج واسمه وبنوده.';end if;
 for part in select value from jsonb_array_elements(content) loop
  if jsonb_typeof(part) is distinct from 'object' or exists(select 1 from jsonb_object_keys(part)x where x not in('title','text')) or length(btrim(part->>'title')) not between 1 and 200 or length(btrim(part->>'text')) not between 1 and 30000 then raise invalid_parameter_value using message='كل بند يحتاج عنوانًا ونصًا.';end if;
 end loop;
 for part in select value from jsonb_array_elements(field_list) loop
  if jsonb_typeof(part) is distinct from 'object' or exists(select 1 from jsonb_object_keys(part)x where x not in('key','label','type','required')) or coalesce(part->>'key','')!~'^[a-z][a-z0-9_]{1,49}$' or length(btrim(part->>'label')) not between 1 and 100 or part->>'type' not in('text','number','date','money') or jsonb_typeof(part->'required') is distinct from 'boolean' then raise invalid_parameter_value using message='بيانات الحقول المتغيرة غير صالحة.';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(field_list))<>(select count(distinct value->>'key') from jsonb_array_elements(field_list)) then raise invalid_parameter_value using message='رموز الحقول المتغيرة يجب ألا تتكرر.';end if;
 if act='save_draft' then
  if (d->>'request_id')::uuid is null or jsonb_typeof(d->'revision') is distinct from 'number' or d->>'revision'!~'^[0-9]+$' then raise invalid_parameter_value using message='مرجع المسودة غير صالح.';end if;
  expected_revision:=(d->>'revision')::integer;
  select * into draft from private.aqari_rental_template_drafts_v2 where workspace_id=w and id=ident for update;
  if not found then
   if expected_revision<>0 then raise serialization_failure using message='DRAFT_REVISION_CONFLICT';end if;
   insert into private.aqari_rental_template_drafts_v2(id,workspace_id,kind,kind_label,title,fields,clauses,revision,request_id,created_by,updated_by)
   values(ident,w,k,kind_name,title_value,field_list,content,1,(d->>'request_id')::uuid,auth.uid(),auth.uid()) returning * into draft;
  else
   if draft.status<>'draft' or draft.revision<>expected_revision then raise serialization_failure using message='DRAFT_REVISION_CONFLICT';end if;
   update private.aqari_rental_template_drafts_v2 set kind=k,kind_label=kind_name,title=title_value,fields=field_list,clauses=content,revision=revision+1,request_id=(d->>'request_id')::uuid,updated_by=auth.uid(),updated_at=now() where id=ident returning * into draft;
  end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',jsonb_build_object('id',draft.id,'kind',draft.kind,'kind_label',draft.kind_label,'revision',draft.revision,'title',draft.title,'fields',draft.fields,'clauses',draft.clauses,'status',draft.status,'updated_at',draft.updated_at));
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if d->'approved' is distinct from 'true'::jsonb then raise invalid_parameter_value using message='أكد مراجعة النص وملف PDF قبل النشر.';end if;
 why:=btrim(d->>'reason');source_id:=nullif(d->>'source_draft_id','')::uuid;
 if length(why) not between 6 and 500 or jsonb_typeof(d->'expected_version') is distinct from 'number' or d->>'expected_version'!~'^[0-9]+$' then raise invalid_parameter_value using message='أدخل سبب الاعتماد والنسخة المتوقعة.';end if;
 if source_id is not null then select * into draft from private.aqari_rental_template_drafts_v2 where workspace_id=w and id=source_id and status='draft' for update;if not found or draft.kind<>k or draft.title<>title_value or draft.fields<>field_list or draft.clauses<>content then raise exception 'المسودة تغيرت؛ احفظها وعاين PDF مرة أخرى.';end if;end if;
 normalized:=jsonb_build_object('id',ident,'kind',k,'kind_label',kind_name,'title',title_value,'fields',field_list,'clauses',content,'expected_version',(d->>'expected_version')::integer,'source_draft_id',source_id,'reason',why,'approved',true);
 request_hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');perform 1 from public.aqari_app_state where workspace_id=w for update;if not found then raise exception 'تعذر قراءة مساحة العمل.';end if;
 select * into r from private.aqari_rental_template_versions where id=ident;if found then if r.workspace_id<>w or r.published_by<>auth.uid() or r.request_sha256<>request_hash then raise exception 'مرجع الاعتماد مرتبط بطلب آخر.';end if;return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));end if;
 select greatest(coalesce((select max(v.version) from private.aqari_rental_template_versions v where v.workspace_id=w and v.kind=k),0),coalesce((select max(s.version) from private.aqari_system_rental_template_versions s where s.workspace_id=w and s.kind=k),0)) into latest;
 if latest<>(d->>'expected_version')::integer then raise serialization_failure using message='ظهرت نسخة أحدث. حدّث القائمة وراجعها قبل الاعتماد.';end if;
 content_hash:=encode(sha256(convert_to(jsonb_build_object('kind',k,'kind_label',kind_name,'title',title_value,'fields',field_list,'clauses',content)::text,'UTF8')),'hex');select display_name into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_rental_template_versions(id,workspace_id,kind,kind_label,version,title,fields,clauses,content_sha256,source_draft_v2_id,reason,request_sha256,published_by,published_by_name)
 values(ident,w,k,kind_name,latest+1,title_value,field_list,content,content_hash,source_id,why,request_hash,auth.uid(),coalesce(actor,auth.uid()::text)) returning * into r;
 if source_id is not null then update private.aqari_rental_template_drafts_v2 set status='published',updated_by=auth.uid(),updated_at=now() where id=source_id;end if;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
end $$;
revoke all on function private.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.aqari_rental_templates(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
