-- Additive upgrade after 20260913095018_v267_contract_template_drafts.sql.
-- Existing drafts remain unapproved. Existing contracts and archived files are never rewritten.
begin;
do $preflight$ begin if to_regprocedure('public.aqari_rental_templates(uuid,text,jsonb)') is not null or to_regclass('private.aqari_rental_template_versions') is not null then raise exception 'RENTAL_TEMPLATES_ALREADY_INSTALLED';end if;end $preflight$;
create table if not exists private.aqari_rental_template_versions(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 kind text not null check(kind in('apartment','house','shop','commercial_investment')),
 version integer not null check(version>0), title text not null,
 clauses jsonb not null, content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 source_draft_id uuid references public.aqari_contract_template_drafts(id),
 reason text not null, request_sha256 text not null,
 published_by uuid not null references auth.users(id), published_by_name text not null,
 published_at timestamptz not null default now(),
 unique(workspace_id,kind,version)
);
create index if not exists aqari_rental_template_source_idx on private.aqari_rental_template_versions(source_draft_id);
create index if not exists aqari_rental_template_actor_idx on private.aqari_rental_template_versions(published_by);
alter table private.aqari_rental_template_versions enable row level security;
revoke all on private.aqari_rental_template_versions from public,anon,authenticated;

create or replace function private.aqari_rental_template_snapshot(r private.aqari_rental_template_versions)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'title',r.title,
  'clauses',r.clauses,'content_sha256',r.content_sha256,'published_at',to_char(r.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;
revoke all on function private.aqari_rental_template_snapshot(private.aqari_rental_template_versions) from public,anon,authenticated;

create or replace function private.aqari_rental_templates(w uuid,act text,d jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_rental_template_versions; latest integer; ident uuid; k text; title_value text; why text;
 source_id uuid; content jsonb; part jsonb; normalized jsonb; request_hash text; content_hash text; actor text; manager boolean;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can(w,'contracts','write');
 if act='context' then
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'can_publish',manager,
   'items',coalesce((select jsonb_agg(private.aqari_rental_template_snapshot(v) order by v.kind,v.version desc) from private.aqari_rental_template_versions v where workspace_id=w),'[]'::jsonb),
   'drafts',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.template_key,'revision',q.revision,'title',q.title,'body',q.body) order by q.template_key,q.revision desc) from public.aqari_contract_template_drafts q where q.workspace_id=w and q.template_key in('apartment','house','shop')),'[]'::jsonb) else '[]'::jsonb end);
 end if;
 if jsonb_typeof(d) is distinct from 'object' then raise invalid_parameter_value using message='بيانات القالب غير صالحة.';end if;
 if act='get' then
  select * into r from private.aqari_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if not found then raise exception 'نسخة القالب غير موجودة في مساحة العمل الحالية.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
 end if;
 if act is distinct from 'publish' then raise invalid_parameter_value using message='إجراء القالب غير صالح.';end if;
 if not manager then raise insufficient_privilege using message='اعتماد ونشر القوالب متاح للمدير العام فقط.';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if exists(select 1 from jsonb_object_keys(d) key where key not in('id','kind','title','clauses','expected_version','source_draft_id','reason','approved'))
  or d->'approved' is distinct from 'true'::jsonb then raise invalid_parameter_value using message='أكد مراجعة نص القالب واعتماده قبل النشر.';end if;
 ident:=(d->>'id')::uuid;k:=d->>'kind';title_value:=btrim(d->>'title');why:=btrim(d->>'reason');content:=d->'clauses';source_id:=nullif(d->>'source_draft_id','')::uuid;
 if ident is null or k is null or k not in('apartment','house','shop','commercial_investment')
  or title_value is null or length(title_value) not between 1 and 200 or why is null or length(why) not between 6 and 500
  or jsonb_typeof(d->'expected_version') is distinct from 'number' or d->>'expected_version' !~ '^[0-9]+$'
  or jsonb_typeof(content) is distinct from 'array' or jsonb_array_length(content) not between 1 and 50 or octet_length(content::text)>100000
 then raise invalid_parameter_value using message='أكمل نوع القالب وعنوانه وبنوده وسبب الاعتماد.';end if;
 for part in select value from jsonb_array_elements(content) loop
  if jsonb_typeof(part) is distinct from 'object' or exists(select 1 from jsonb_object_keys(part) key where key not in('title','text'))
   or jsonb_typeof(part->'title') is distinct from 'string' or length(btrim(part->>'title')) not between 1 and 200
   or jsonb_typeof(part->'text') is distinct from 'string' or length(btrim(part->>'text')) not between 1 and 30000
  then raise invalid_parameter_value using message='كل بند يحتاج عنوانًا ونصًا محفوظين.';end if;
 end loop;
 normalized:=jsonb_build_object('id',ident,'kind',k,'title',title_value,'clauses',content,'expected_version',(d->>'expected_version')::integer,'source_draft_id',source_id,'reason',why,'approved',true);
 request_hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
 -- Match the workspace lock used by lease writes; competing publishers cannot reuse a revision.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'تعذر قراءة مساحة العمل.';end if;
 select * into r from private.aqari_rental_template_versions where id=ident;
 if found then
  if r.workspace_id is distinct from w or r.published_by is distinct from auth.uid() or r.request_sha256 is distinct from request_hash then raise exception 'مرجع الاعتماد مرتبط بطلب آخر. أعد استرجاع النسخ.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
 end if;
 if source_id is not null and not exists(select 1 from public.aqari_contract_template_drafts q where q.workspace_id=w and q.id=source_id and q.template_key=k and q.status='draft') then raise exception 'مسودة المصدر لا تطابق نوع القالب ومساحة العمل.';end if;
 select coalesce(max(version),0) into latest from private.aqari_rental_template_versions where workspace_id=w and kind=k;
 if latest<>(d->>'expected_version')::integer then raise exception 'ظهرت نسخة أحدث من القالب. حدّث القائمة وراجعها قبل الاعتماد.';end if;
 content_hash:=encode(sha256(convert_to(jsonb_build_object('kind',k,'title',title_value,'clauses',content)::text,'UTF8')),'hex');
 select display_name into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_rental_template_versions(id,workspace_id,kind,version,title,clauses,content_sha256,source_draft_id,reason,request_sha256,published_by,published_by_name)
 values(ident,w,k,latest+1,title_value,content,content_hash,source_id,why,request_hash,auth.uid(),coalesce(actor,auth.uid()::text)) returning * into r;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
end $$;
revoke all on function private.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_rental_templates(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_rental_templates(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$select private.aqari_rental_templates(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_rental_templates(uuid,text,jsonb) to authenticated;

create or replace function private.aqari_rental_template_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'النسخة المنشورة ثابتة. أنشئ إصدارًا جديدًا مع سبب الاعتماد.';end $$;
revoke all on function private.aqari_rental_template_immutable() from public,anon,authenticated;
drop trigger if exists aqari_rental_template_immutable on private.aqari_rental_template_versions;
create trigger aqari_rental_template_immutable before update or delete on private.aqari_rental_template_versions for each row execute function private.aqari_rental_template_immutable();

create or replace function private.aqari_validate_rental_template_binding() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb; previous jsonb; d jsonb:=private.aqari_unwrap(new.payload); old_d jsonb:=private.aqari_unwrap(old.payload); r private.aqari_rental_template_versions;
begin
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  select value into previous from jsonb_array_elements(coalesce(old_d->'contractsV202','[]')) where value->>'id'=c->>'id';
  if c is not distinct from previous then continue;end if;
  if previous is not null then
   if previous->'contractTemplate' is distinct from c->'contractTemplate' or previous->'clauses' is distinct from c->'clauses' then raise exception 'نسخة القالب وبنود العقد المحفوظة ثابتة؛ إصدار قالب جديد لا يغير العقود السابقة.';end if;
   continue;
  end if;
  -- Only a previously persisted, source-bound import may enter through its existing import RPC.
  if c->>'source'='statement-import' and exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.external_ref=c->>'id' and l.import_source is not null and l.snapshot=c) then continue;end if;
  if c->>'source' is distinct from 'v267-cloud' or jsonb_typeof(c->'contractTemplate') is distinct from 'object' then raise exception 'اختر نسخة قالب نشرها المدير العام قبل إنشاء العقد.';end if;
  if nullif(btrim(c#>>'{tenantProfile,nameAr}'),'') is null or nullif(btrim(c#>>'{tenantProfile,nameEn}'),'') is null
   or coalesce(c#>>'{tenantProfile,civilId}','') !~ '^[0-9]{12}$' or nullif(btrim(c#>>'{tenantProfile,passportNo}'),'') is null
   or coalesce(c#>>'{tenantProfile,email}','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
   or coalesce(c#>>'{tenantProfile,phone}','') !~ '^[+]?[0-9]{8,15}$'
  then raise exception 'أكمل الاسمين العربي والإنجليزي والرقم المدني والجواز والبريد والهاتف في ملف المستأجر قبل إبرام العقد.';end if;
  select * into r from private.aqari_rental_template_versions where workspace_id=new.workspace_id and id=(c#>>'{contractTemplate,id}')::uuid;
  if not found or c->'contractTemplate' is distinct from private.aqari_rental_template_snapshot(r) or c->'clauses' is distinct from r.clauses then raise exception 'بنود العقد لا تطابق نسخة القالب المنشورة. أعد اختيار القالب دون تعديل نصه.';end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_validate_rental_template_binding() from public,anon,authenticated;
drop trigger if exists aqari_za_rental_template_binding on public.aqari_app_state;
create trigger aqari_za_rental_template_binding before update of payload on public.aqari_app_state for each row execute function private.aqari_validate_rental_template_binding();
notify pgrst, 'reload schema';
commit;
