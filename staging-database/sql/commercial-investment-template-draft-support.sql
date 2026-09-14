-- AQARI V267: allow commercial/investment wording drafts without fabricating an approved legal template.
-- Preview/Staging only. This widens the append-only draft taxonomy and makes those drafts visible
-- through the existing manager template context; publishing remains manager + recent-MFA guarded.
begin;

alter table public.aqari_contract_template_drafts
 drop constraint if exists aqari_contract_template_drafts_template_key_check;
alter table public.aqari_contract_template_drafts
 add constraint aqari_contract_template_drafts_template_key_check
 check (template_key in ('house','apartment','shop','commercial_investment','vacating_undertaking','unit_handover'));

create or replace function private.aqari_rental_templates(w uuid, act text, d jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
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
   'workspace_id',w,'user_id',auth.uid(),'can_publish',manager,
   'items',coalesce((
    select jsonb_agg(z.item order by z.item->>'kind',(z.item->>'version')::integer desc)
    from (
     select private.aqari_rental_template_snapshot(v) item from private.aqari_rental_template_versions v where v.workspace_id=w
     union all
     select private.aqari_system_rental_template_snapshot(s) item from private.aqari_system_rental_template_versions s where s.workspace_id=w
    ) z
   ),'[]'::jsonb),
   'drafts',case when manager then coalesce((
    select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.template_key,'revision',q.revision,'title',q.title,'body',q.body) order by q.template_key,q.revision desc)
    from public.aqari_contract_template_drafts q where q.workspace_id=w and q.template_key in('apartment','house','shop','commercial_investment')
   ),'[]'::jsonb) else '[]'::jsonb end
  );
 end if;
 if jsonb_typeof(d) is distinct from 'object' then raise invalid_parameter_value using message='بيانات القالب غير صالحة.';end if;
 if act='get' then
  select * into r from private.aqari_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if found then return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));end if;
  select * into sr from private.aqari_system_rental_template_versions where workspace_id=w and id=(d->>'id')::uuid;
  if not found then raise exception 'نسخة القالب غير موجودة في مساحة العمل الحالية.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_system_rental_template_snapshot(sr));
 end if;
 if act is distinct from 'publish' then raise invalid_parameter_value using message='إجراء القالب غير صالح.';end if;
 if not manager then raise insufficient_privilege using message='اعتماد ونشر القوالب متاح للمدير العام فقط.';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if exists(select 1 from jsonb_object_keys(d) key where key not in('id','kind','title','clauses','expected_version','source_draft_id','reason','approved')) or d->'approved' is distinct from 'true'::jsonb then raise invalid_parameter_value using message='أكد مراجعة نص القالب واعتماده قبل النشر.';end if;
 ident:=(d->>'id')::uuid;k:=d->>'kind';title_value:=btrim(d->>'title');why:=btrim(d->>'reason');content:=d->'clauses';source_id:=nullif(d->>'source_draft_id','')::uuid;
 if ident is null or k is null or k not in('apartment','house','shop','commercial_investment') or title_value is null or length(title_value) not between 1 and 200 or why is null or length(why) not between 6 and 500 or jsonb_typeof(d->'expected_version') is distinct from 'number' or d->>'expected_version' !~ '^[0-9]+$' or jsonb_typeof(content) is distinct from 'array' or jsonb_array_length(content) not between 1 and 50 or octet_length(content::text)>100000 then raise invalid_parameter_value using message='أكمل نوع القالب وعنوانه وبنوده وسبب الاعتماد.';end if;
 for part in select value from jsonb_array_elements(content) loop
  if jsonb_typeof(part) is distinct from 'object' or exists(select 1 from jsonb_object_keys(part) key where key not in('title','text')) or jsonb_typeof(part->'title') is distinct from 'string' or length(btrim(part->>'title')) not between 1 and 200 or jsonb_typeof(part->'text') is distinct from 'string' or length(btrim(part->>'text')) not between 1 and 30000 then raise invalid_parameter_value using message='كل بند يحتاج عنوانًا ونصًا محفوظين.';end if;
 end loop;
 normalized:=jsonb_build_object('id',ident,'kind',k,'title',title_value,'clauses',content,'expected_version',(d->>'expected_version')::integer,'source_draft_id',source_id,'reason',why,'approved',true);
 request_hash:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'تعذر قراءة مساحة العمل.';end if;
 select * into r from private.aqari_rental_template_versions where id=ident;
 if found then
  if r.workspace_id is distinct from w or r.published_by is distinct from auth.uid() or r.request_sha256 is distinct from request_hash then raise exception 'مرجع الاعتماد مرتبط بطلب آخر. أعد استرجاع النسخ.';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
 end if;
 if source_id is not null and not exists(select 1 from public.aqari_contract_template_drafts q where q.workspace_id=w and q.id=source_id and q.template_key=k and q.status='draft') then raise exception 'مسودة المصدر لا تطابق نوع القالب ومساحة العمل.';end if;
 select greatest(
  coalesce((select max(v.version) from private.aqari_rental_template_versions v where v.workspace_id=w and v.kind=k),0),
  coalesce((select max(s.version) from private.aqari_system_rental_template_versions s where s.workspace_id=w and s.kind=k),0)
 ) into latest;
 if latest<>(d->>'expected_version')::integer then raise exception 'ظهرت نسخة أحدث من القالب. حدّث القائمة وراجعها قبل الاعتماد.';end if;
 content_hash:=encode(sha256(convert_to(jsonb_build_object('kind',k,'title',title_value,'clauses',content)::text,'UTF8')),'hex');
 select display_name into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_rental_template_versions(id,workspace_id,kind,version,title,clauses,content_sha256,source_draft_id,reason,request_sha256,published_by,published_by_name)
 values(ident,w,k,latest+1,title_value,content,content_hash,source_id,why,request_hash,auth.uid(),coalesce(actor,auth.uid()::text)) returning * into r;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',private.aqari_rental_template_snapshot(r));
end $$;
revoke all on function private.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.aqari_rental_templates(uuid,text,jsonb) to authenticated;

comment on constraint aqari_contract_template_drafts_template_key_check on public.aqari_contract_template_drafts
 is 'Draft wording taxonomy includes commercial_investment. Drafts are not approved legal templates and remain manager-publish gated.';

commit;
