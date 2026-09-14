-- AQARI V267 isolated trial: system-source rental template bootstrap.
-- This migration keeps manager-published template history immutable and adds a
-- separate immutable source for trial templates imported from owner-provided
-- documents. System-source rows have no user publisher and therefore never
-- impersonate owner/manager approval.
begin;

create table if not exists private.aqari_system_rental_template_versions(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 kind text not null check(kind in('apartment','house','shop','commercial_investment')),
 version integer not null check(version>0),
 title text not null,
 clauses jsonb not null,
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 source_document_name text not null,
 source_document_sha256 text not null check(source_document_sha256 ~ '^[a-f0-9]{64}$'),
 source_note text not null,
 imported_at timestamptz not null default now(),
 unique(workspace_id,kind,version)
);
alter table private.aqari_system_rental_template_versions enable row level security;
revoke all on private.aqari_system_rental_template_versions from public,anon,authenticated,service_role;
drop trigger if exists aqari_system_rental_template_immutable on private.aqari_system_rental_template_versions;
create trigger aqari_system_rental_template_immutable
 before update or delete on private.aqari_system_rental_template_versions
 for each row execute function private.aqari_rental_template_immutable();

create or replace function private.aqari_system_rental_template_snapshot(
 r private.aqari_system_rental_template_versions
) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'id',r.id,'kind',r.kind,'version',r.version,'title',r.title,
  'clauses',r.clauses,'content_sha256',r.content_sha256,
  'published_at',to_char(r.imported_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
 )
$$;
revoke all on function private.aqari_system_rental_template_snapshot(private.aqari_system_rental_template_versions)
 from public,anon,authenticated,service_role;

create or replace function private.aqari_rental_templates(w uuid,act text,d jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 r private.aqari_rental_template_versions;
 sr private.aqari_system_rental_template_versions;
 latest integer; ident uuid; k text; title_value text; why text;
 source_id uuid; content jsonb; part jsonb; normalized jsonb; request_hash text; content_hash text; actor text; manager boolean;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can(w,'contracts','write');

 if act='context' then
  return jsonb_build_object(
   'workspace_id',w,
   'user_id',auth.uid(),
   'can_publish',manager,
   'items',coalesce((
    select jsonb_agg(z.item order by z.item->>'kind',(z.item->>'version')::integer desc)
    from (
     select private.aqari_rental_template_snapshot(v) item
      from private.aqari_rental_template_versions v where v.workspace_id=w
     union all
     select private.aqari_system_rental_template_snapshot(s) item
      from private.aqari_system_rental_template_versions s where s.workspace_id=w
    ) z
   ),'[]'::jsonb),
   'drafts',case when manager then coalesce((
    select jsonb_agg(
      jsonb_build_object('id',q.id,'kind',q.template_key,'revision',q.revision,'title',q.title,'body',q.body)
      order by q.template_key,q.revision desc
    )
    from public.aqari_contract_template_drafts q
    where q.workspace_id=w and q.template_key in('apartment','house','shop')
   ),'[]'::jsonb) else '[]'::jsonb end
  );
 end if;

 if jsonb_typeof(d) is distinct from 'object' then
  raise invalid_parameter_value using message='بيانات القالب غير صالحة.';
 end if;

 if act='get' then
  select * into r from private.aqari_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if found then
   return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
  end if;
  select * into sr from private.aqari_system_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if not found then raise exception 'نسخة القالب غير موجودة في مساحة العمل الحالية.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_system_rental_template_snapshot(sr));
 end if;

 if act is distinct from 'publish' then
  raise invalid_parameter_value using message='إجراء القالب غير صالح.';
 end if;
 if not manager then
  raise insufficient_privilege using message='اعتماد ونشر القوالب متاح للمدير العام فقط.';
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if exists(select 1 from jsonb_object_keys(d) key where key not in('id','kind','title','clauses','expected_version','source_draft_id','reason','approved'))
  or d->'approved' is distinct from 'true'::jsonb then
  raise invalid_parameter_value using message='أكد مراجعة نص القالب واعتماده قبل النشر.';
 end if;

 ident:=(d->>'id')::uuid;
 k:=d->>'kind';
 title_value:=btrim(d->>'title');
 why:=btrim(d->>'reason');
 content:=d->'clauses';
 source_id:=nullif(d->>'source_draft_id','')::uuid;
 if ident is null or k is null or k not in('apartment','house','shop','commercial_investment')
  or title_value is null or length(title_value) not between 1 and 200
  or why is null or length(why) not between 6 and 500
  or jsonb_typeof(d->'expected_version') is distinct from 'number'
  or d->>'expected_version' !~ '^[0-9]+$'
  or jsonb_typeof(content) is distinct from 'array'
  or jsonb_array_length(content) not between 1 and 50
  or octet_length(content::text)>100000
 then raise invalid_parameter_value using message='أكمل نوع القالب وعنوانه وبنوده وسبب الاعتماد.';
 end if;

 for part in select value from jsonb_array_elements(content) loop
  if jsonb_typeof(part) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(part) key where key not in('title','text'))
   or jsonb_typeof(part->'title') is distinct from 'string'
   or length(btrim(part->>'title')) not between 1 and 200
   or jsonb_typeof(part->'text') is distinct from 'string'
   or length(btrim(part->>'text')) not between 1 and 30000
  then raise invalid_parameter_value using message='كل بند يحتاج عنوانًا ونصًا محفوظين.';end if;
 end loop;

 normalized:=jsonb_build_object(
  'id',ident,'kind',k,'title',title_value,'clauses',content,
  'expected_version',(d->>'expected_version')::integer,
  'source_draft_id',source_id,'reason',why,'approved',true
 );
 request_hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');

 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'تعذر قراءة مساحة العمل.';end if;

 select * into r from private.aqari_rental_template_versions where id=ident;
 if found then
  if r.workspace_id is distinct from w
   or r.published_by is distinct from auth.uid()
   or r.request_sha256 is distinct from request_hash
  then raise exception 'مرجع الاعتماد مرتبط بطلب آخر. أعد استرجاع النسخ.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
 end if;

 if source_id is not null and not exists(
  select 1 from public.aqari_contract_template_drafts q
  where q.workspace_id=w and q.id=source_id and q.template_key=k and q.status='draft'
 ) then raise exception 'مسودة المصدر لا تطابق نوع القالب ومساحة العمل.';end if;

 select greatest(
  coalesce((select max(v.version) from private.aqari_rental_template_versions v where v.workspace_id=w and v.kind=k),0),
  coalesce((select max(s.version) from private.aqari_system_rental_template_versions s where s.workspace_id=w and s.kind=k),0)
 ) into latest;
 if latest<>(d->>'expected_version')::integer then
  raise exception 'ظهرت نسخة أحدث من القالب. حدّث القائمة وراجعها قبل الاعتماد.';
 end if;

 content_hash:=encode(
  sha256(convert_to(jsonb_build_object('kind',k,'title',title_value,'clauses',content)::text,'UTF8')),
  'hex'
 );
 select display_name into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_rental_template_versions(
  id,workspace_id,kind,version,title,clauses,content_sha256,source_draft_id,
  reason,request_sha256,published_by,published_by_name
 )
 values(
  ident,w,k,latest+1,title_value,content,content_hash,source_id,
  why,request_hash,auth.uid(),coalesce(actor,auth.uid()::text)
 ) returning * into r;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
end $$;
revoke all on function private.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.aqari_rental_templates(uuid,text,jsonb) to authenticated;

create or replace function private.aqari_validate_rental_template_binding()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 c jsonb; previous jsonb; expected jsonb;
 d jsonb:=private.aqari_unwrap(new.payload);
 old_d jsonb:=private.aqari_unwrap(old.payload);
begin
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  select value into previous
   from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'))
   where value->>'id'=c->>'id';

  if c is not distinct from previous then continue;end if;
  if previous is not null then
   if previous->'contractTemplate' is distinct from c->'contractTemplate'
    or previous->'clauses' is distinct from c->'clauses'
   then raise exception 'نسخة القالب وبنود العقد المحفوظة ثابتة؛ إصدار قالب جديد لا يغير العقود السابقة.';end if;
   continue;
  end if;

  if c->>'source'='statement-import' and exists(
   select 1 from public.aqari_leases l
   where l.workspace_id=new.workspace_id and l.external_ref=c->>'id'
    and l.import_source is not null and l.snapshot=c
  ) then continue;end if;

  if c->>'source' is distinct from 'v267-cloud'
   or jsonb_typeof(c->'contractTemplate') is distinct from 'object'
  then raise exception 'اختر نسخة قالب نشرها المدير العام أو قالب مصدر نظامي قبل إنشاء العقد.';end if;

  if nullif(btrim(c#>>'{tenantProfile,nameAr}'),'') is null
   or nullif(btrim(c#>>'{tenantProfile,nameEn}'),'') is null
   or coalesce(c#>>'{tenantProfile,civilId}','') !~ '^[0-9]{12}$'
   or nullif(btrim(c#>>'{tenantProfile,passportNo}'),'') is null
   or coalesce(c#>>'{tenantProfile,email}','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
   or coalesce(c#>>'{tenantProfile,phone}','') !~ '^[+]?[0-9]{8,15}$'
  then raise exception 'أكمل الاسمين العربي والإنجليزي والرقم المدني والجواز والبريد والهاتف في ملف المستأجر قبل إبرام العقد.';end if;

  expected:=null;
  select private.aqari_rental_template_snapshot(v) into expected
   from private.aqari_rental_template_versions v
   where v.workspace_id=new.workspace_id and v.id=(c#>>'{contractTemplate,id}')::uuid;
  if expected is null then
   select private.aqari_system_rental_template_snapshot(s) into expected
    from private.aqari_system_rental_template_versions s
    where s.workspace_id=new.workspace_id and s.id=(c#>>'{contractTemplate,id}')::uuid;
  end if;
  if expected is null
   or c->'contractTemplate' is distinct from expected
   or c->'clauses' is distinct from expected->'clauses'
  then raise exception 'بنود العقد لا تطابق نسخة القالب المنشورة أو قالب المصدر النظامي. أعد اختيار القالب دون تعديل نصه.';end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_validate_rental_template_binding() from public,anon,authenticated,service_role;

with source as (
 select
  'نموذج شقة تشغيلي - مرجع برج ضحاوي (تجريبي للمراجعة)'::text as title,
  '[
   {"title":"1. بيانات العين والمدة والمبالغ","text":"تثبت بيانات العقار والوحدة والدور ومدة العقد وبداية ونهاية الإيجار والقيمة الأصلية والتأمين وسائر المبالغ في الحقول المعتمدة بالعقد، ويلتزم الطرف الثاني بالسداد في المواعيد المحددة، وتبقى مبالغ التأمين منفصلة عن الأجرة وتسوّى عند الإخلاء وفق الحالة الفعلية للعين."},
   {"title":"2. الغرض من الاستعمال والاستلام","text":"يكون استعمال العين للغرض المحدد في العقد، ويقر الطرف الثاني بمعاينتها واستلامها بالحالة المثبتة، ولا يغيّر الغرض أو يجري تغييراً جوهرياً فيها إلا بموافقة كتابية وفق الإجراءات المعتمدة."},
   {"title":"3. التعديلات والمسؤولية والتنازل","text":"لا يجوز إجراء إضافات أو إزالة أو وضع إعلانات أو تخزين مواد خطرة أو التأجير من الباطن أو التنازل عن العين إلا وفق الموافقات الكتابية والتراخيص النظامية، ويتحمل الطرف الثاني ما ينشأ عن مخالفته."},
   {"title":"4. السداد والرسوم والخدمات","text":"تسدد الأجرة بوسيلة الدفع المعتمدة، وتثبت رسوم النظافة والخدمات وأي مبالغ إضافية في حقول مستقلة وواضحة، ولا تعد جزءاً من الأجرة الأصلية إلا إذا نص العقد صراحة على ذلك."},
   {"title":"5. الصيانة والاستهلاكات","text":"يلتزم الطرف الثاني بأعمال الصيانة والاستهلاكات الواقعة عليه وفق العقد، ويبلغ الإدارة عن الأعطال، وتثبت أي رسوم صيانة أو خدمات بصورة مستقلة ومعلومة."},
   {"title":"6. الأمن والسلامة والمرافق المشتركة","text":"يلتزم الطرف الثاني بقواعد الأمن والسلامة واستعمال الممرات والمواقف والمرافق المشتركة للغرض المخصص لها، ويحافظ على العين ومحتوياتها ولا يتصرف فيما لا يملكه."},
   {"title":"7. التراخيص وإثبات الإخلاء","text":"يلتزم الطرف الثاني بالحصول على التراخيص والموافقات اللازمة للغرض المستأجر من أجله متى كانت مطلوبة، ويثبت الإخلاء أو التسليم بمستند رسمي أو إجراء موثق في النظام."},
   {"title":"8. الإخلاء والإشعارات والتسويات","text":"عند الرغبة في الإخلاء أو انتهاء مدة العقد تطبق مهلة الإشعار والرسوم والتسويات المثبتة في العقد والنظام، وتوثق المراسلات وحالة الاستحقاقات قبل إتمام الإخلاء."},
   {"title":"9. الأنظمة والاختصاص وقيود الاستخدام","text":"تطبق القوانين واللوائح الكويتية ذات الصلة، وتكون بيانات الترخيص والاستخدام المحظور وأي قيود إضافية مثبتة في العقد أو ملف العقار جزءاً من الالتزامات التشغيلية."},
   {"title":"10. النسخ الرسمية والحفظ","text":"يصدر العقد بعد اعتماده بنسختين رسميتين تحملان رقم العقد والسيريال نفسه: نسخة للمستأجر ونسخة للمالك أو الإدارة، وتحفظ النسختان في الأرشيف مع سجل التدقيق."}
  ]'::jsonb as clauses
), target as (
 select w.id workspace_id,s.title,s.clauses
 from public.aqari_workspaces w cross join source s
 where w.slug='aqari-v267-staging'
)
insert into private.aqari_system_rental_template_versions(
 id,workspace_id,kind,version,title,clauses,content_sha256,
 source_document_name,source_document_sha256,source_note
)
select
 extensions.gen_random_uuid(),t.workspace_id,'apartment',1,t.title,t.clauses,
 encode(sha256(convert_to(jsonb_build_object('kind','apartment','title',t.title,'clauses',t.clauses)::text,'UTF8')),'hex'),
 'عقد ايجار برج ضحاوي.pdf',
 'e2bf1fd709c2f3850462c870099171216a414ff705dd6858c5886679424dbc29',
 'قالب تشغيلي تجريبي مستند إلى عقد برج ضحاوي المرفوع وإلى متطلبات دورة العقد. لا يمثل اعتماداً قانونياً نهائياً، ويظل قابلاً للاستبدال بإصدار مدير عام بعد المراجعة.'
from target t
where not exists(
 select 1 from private.aqari_system_rental_template_versions x
 where x.workspace_id=t.workspace_id and x.kind='apartment' and x.version=1
);

commit;
