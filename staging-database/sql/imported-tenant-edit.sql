-- Staging only: audited edits of imported tenant contact/profile fields.
create table private.aqari_imported_tenant_edits (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 tenant_id uuid not null references public.aqari_tenants(id),
 actor_id uuid not null references auth.users(id),
 reason text not null,
 before_profile jsonb not null,
 after_profile jsonb not null,
 created_at timestamptz not null default now()
);
create index aqari_imported_tenant_edits_lookup on private.aqari_imported_tenant_edits(workspace_id,tenant_id,id desc);
create index aqari_imported_tenant_edits_actor on private.aqari_imported_tenant_edits(actor_id);
alter table private.aqari_imported_tenant_edits enable row level security;
create policy imported_tenant_edits_no_direct on private.aqari_imported_tenant_edits for all to authenticated using(false) with check(false);
revoke all on private.aqari_imported_tenant_edits from public,anon,authenticated;

create function private.aqari_imported_tenant_read(w uuid, ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant public.aqari_tenants; revision bigint; history jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'tenants','read') then raise exception 'غير مصرح بعرض الملف.' using errcode='42501';end if;
 select * into tenant from public.aqari_tenants where workspace_id=w and external_ref=ref and import_source is not null;
 if not found then raise exception 'الملف المستورد غير موجود.';end if;
 select s.revision into revision from public.aqari_app_state s where s.workspace_id=w;
 select coalesce(jsonb_agg(row_to_json(h) order by h.id desc),'[]'::jsonb) into history from
 (select id,reason,created_at,before_profile,after_profile from private.aqari_imported_tenant_edits where workspace_id=w and tenant_id=tenant.id order by id desc limit 10) h;
 return jsonb_build_object('profile',tenant.profile,'revision',revision,'history',history);
end $$;

create function private.aqari_imported_tenant_save(w uuid, ref text, patch jsonb, expected bigint, reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant public.aqari_tenants; state public.aqari_app_state; d jsonb; next_profile jsonb; f text; val text; display_name text;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'tenants','write') then raise exception 'غير مصرح بتعديل الملف.' using errcode='42501';end if;
 if expected is null or reason is null or length(btrim(reason)) not between 3 and 500 or jsonb_typeof(patch) is distinct from 'object' then raise exception 'أدخل سبب التعديل وراجع البيانات.';end if;
 if exists(select 1 from jsonb_object_keys(patch) k where k not in ('nameAr','nameEn','civilId','phone','email','nationality','address')) then raise exception 'لا يمكن تغيير بيانات المصدر أو الربط.';end if;
 select * into state from public.aqari_app_state where workspace_id=w for update;
 if not found or state.revision<>expected then raise exception 'تغيّرت البيانات؛ حدّث الملف قبل الحفظ.' using errcode='40001';end if;
 select * into tenant from public.aqari_tenants where workspace_id=w and external_ref=ref and import_source is not null for update;
 if not found then raise exception 'الملف المستورد غير موجود.';end if;
 d:=private.aqari_unwrap(state.payload);
 if not exists(select 1 from jsonb_array_elements(coalesce(d->'tenantProfilesV267','[]')) x where x->>'id'=ref and x=tenant.profile) then raise exception 'تعارض بين الملف والسجل المحفوظ؛ يلزم المراجعة.';end if;
 next_profile:=tenant.profile;
 for f,val in select key,value from jsonb_each_text(patch) loop
  if jsonb_typeof(patch->f) is distinct from 'string' or length(val)>300 then raise exception 'راجع نوع البيانات وطولها.';end if;
  val:=btrim(val);
  if f in ('civilId','phone') then val:=translate(val,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');end if;
  if f='phone' then val:=regexp_replace(val,'[ ()-]','','g');end if;
  next_profile:=jsonb_set(next_profile,array[f],to_jsonb(val));
 end loop;
 display_name:=coalesce(nullif(next_profile->>'nameAr',''),nullif(next_profile->>'nameEn',''));
 if display_name is null then raise exception 'أدخل اسم المستأجر بالعربية أو الإنجليزية.';end if;
 if coalesce(next_profile->>'civilId','')<>'' and next_profile->>'civilId' !~ '^[0-9]{12}$' then raise exception 'الرقم المدني يجب أن يكون ١٢ رقماً أو يُترك فارغاً.';end if;
 if coalesce(next_profile->>'phone','')<>'' and next_profile->>'phone' !~ '^[+]?[0-9]{8,15}$' then raise exception 'راجع رقم الهاتف أو اتركه فارغاً.';end if;
 if coalesce(next_profile->>'email','')<>'' and next_profile->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'راجع البريد الإلكتروني.';end if;
 if coalesce(next_profile->>'civilId','')<>'' and exists(select 1 from public.aqari_tenants t where t.workspace_id=w and t.id<>tenant.id and t.civil_id=next_profile->>'civilId') then raise exception 'الرقم المدني مرتبط بمستأجر آخر.';end if;
 -- Email is the portal identity; do not silently transfer an existing account.
 if coalesce(tenant.profile->>'email','') is distinct from coalesce(next_profile->>'email','') then
  if exists(select 1 from auth.users u where lower(u.email)=lower(tenant.profile->>'email') or lower(u.email)=lower(next_profile->>'email')) then raise exception 'البريد مرتبط بحساب؛ يلزم إجراء مستقل للتحقق من هوية صاحب الحساب.';end if;
 end if;
 update public.aqari_tenants set full_name=display_name,civil_id=nullif(next_profile->>'civilId',''),phone=nullif(next_profile->>'phone',''),email=nullif(lower(next_profile->>'email'),''),profile=next_profile where id=tenant.id and workspace_id=w;
 d:=jsonb_set(d,'{tenantProfilesV267}',(select jsonb_agg(case when x->>'id'=ref then next_profile else x end order by n) from jsonb_array_elements(d->'tenantProfilesV267') with ordinality a(x,n)));
 d:=jsonb_set(d,'{tenants}',coalesce((select jsonb_agg(case when x->>4=ref or exists(select 1 from jsonb_array_elements(x) v where v->>'aqariTenantProfileV267'=ref) then jsonb_set(x,'{0}',to_jsonb(display_name)) else x end order by n) from jsonb_array_elements(coalesce(d->'tenants','[]')) with ordinality a(x,n)),'[]'));
 d:=jsonb_set(d,'{tenantDirectoryV202}',coalesce((select jsonb_agg(case when x->>'tenantProfileId'=ref then x||jsonb_build_object('tenant',display_name,'phone',next_profile->>'phone','email',next_profile->>'email','civilId',next_profile->>'civilId','nationality',next_profile->>'nationality') else x end order by n) from jsonb_array_elements(coalesce(d->'tenantDirectoryV202','[]')) with ordinality a(x,n)),'[]'));
 d:=jsonb_set(d,'{tenantPreparationDraftsV267}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(d->'tenantPreparationDraftsV267','[]')) x where x->>'id'<>ref),'[]'));
 -- Contract snapshots, original source statements, receipts and payment records stay historical.
 insert into private.aqari_imported_tenant_edits(workspace_id,tenant_id,actor_id,reason,before_profile,after_profile) values(w,tenant.id,auth.uid(),btrim(reason),tenant.profile,next_profile);
 update public.aqari_app_state set payload=case when state.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(state.payload,'{snapshot,values,aqari_v30}',d) when state.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(state.payload,'{values,aqari_v30}',d) else d end,revision=state.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w;
 return private.aqari_imported_tenant_read(w,ref);
end $$;
revoke all on function private.aqari_imported_tenant_read(uuid,text),private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text) from public,anon;
grant execute on function private.aqari_imported_tenant_read(uuid,text),private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text) to authenticated;
create function public.aqari_imported_tenant_read(p_workspace_id uuid,p_ref text) returns jsonb language sql security invoker set search_path='' as $$select private.aqari_imported_tenant_read(p_workspace_id,p_ref)$$;
create function public.aqari_imported_tenant_save(p_workspace_id uuid,p_ref text,p_patch jsonb,p_expected_revision bigint,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.aqari_imported_tenant_save(p_workspace_id,p_ref,p_patch,p_expected_revision,p_reason)$$;
revoke all on function public.aqari_imported_tenant_read(uuid,text),public.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text) from public,anon;
grant execute on function public.aqari_imported_tenant_read(uuid,text),public.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text) to authenticated;
