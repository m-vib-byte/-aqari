-- V267 isolated Staging only. Existing source evidence is not backfilled.
create or replace function private.aqari_validate_rental_details() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb; old_d jsonb; c jsonb; previous jsonb; p jsonb; r jsonb; receipt jsonb; f text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 d:=private.aqari_unwrap(new.payload);old_d:=private.aqari_unwrap(old.payload);
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  select x into previous from jsonb_array_elements(coalesce(old_d->'contractsV202','[]')) x where x->>'id'=c->>'id';
  if c=previous or c->>'source' is distinct from 'v267-cloud' then continue;end if;
  if c->>'detailsVersion' is distinct from '2' then raise exception 'CONTRACT_DETAILS_REQUIRED';end if;
  select x into p from jsonb_array_elements(coalesce(d->'tenantProfilesV267','[]')) x where x->>'id'=c->>'tenantId';
  foreach f in array array['nameAr','nameEn','email','nationality','civilId','passportNo','phone'] loop
   if jsonb_typeof(p->f) is distinct from 'string' or length(btrim(p->>f)) not between 1 and 300 then raise exception 'TENANT_FIELD_REQUIRED:%',f;end if;
  end loop;
  if p->>'civilId' !~ '^[0-9]{12}$' or p->>'phone' !~ '^[+]?[0-9]{8,15}$' or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'TENANT_DETAILS_INVALID';end if;
  if c->'tenantProfile' is distinct from p or c->>'tenant' is distinct from p->>'nameAr' then raise exception 'TENANT_SNAPSHOT_MISMATCH';end if;
  foreach f in array array['unit','floor','contract_no','accountant','start_date','end_date','writtenOn','receivedAt'] loop
   if jsonb_typeof(c->f) is distinct from 'string' or length(btrim(c->>f)) not between 1 and 300 then raise exception 'CONTRACT_FIELD_REQUIRED:%',f;end if;
  end loop;
  foreach f in array array['contractRent','discount','rent','deposit','advance','cleaningFee'] loop
   if jsonb_typeof(c->f) is distinct from 'number' or (c->>f)::numeric<0 or (c->>f)::numeric<>round((c->>f)::numeric,3) then raise exception 'CONTRACT_AMOUNT_INVALID:%',f;end if;
  end loop;
  if (c->>'rent')::numeric<=0 or (c->>'rent')::numeric<>(c->>'contractRent')::numeric-(c->>'discount')::numeric then raise exception 'RENT_DISCOUNT_MISMATCH';end if;
  foreach f in array array['start_date','end_date','writtenOn'] loop
   if c->>f !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((c->>f)::date,'YYYY-MM-DD')<>c->>f then raise exception 'CONTRACT_DATE_INVALID';end if;
  end loop;
  if (c->>'end_date')::date<(c->>'start_date')::date then raise exception 'CONTRACT_DATE_ORDER';end if;
  if c->>'receivedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+]03:00$' or to_char((c->>'receivedAt')::timestamptz at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00'<>c->>'receivedAt' or (c->>'receivedAt')::timestamptz>now() or c->>'contractReceived' is distinct from 'مستلم' then raise exception 'CONTRACT_DELIVERY_INVALID';end if;
  if coalesce(c->>'evictionNotice','') not in ('لم يُبلّغ','تم التبليغ','غير محدد') then raise exception 'EVICTION_STATUS_REQUIRED';end if;
  if previous->>'detailsVersion'='2' then
   if previous->'contractRent' is distinct from c->'contractRent' or previous->'writtenOn' is distinct from c->'writtenOn' then raise exception 'CONTRACT_ORIGINAL_TERMS_IMMUTABLE';end if;
  elsif (c->>'writtenOn')::date<>(now() at time zone 'Asia/Kuwait')::date then raise exception 'CONTRACT_WRITING_DATE_INVALID';end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(d->'rentLedgerV202','[]')) loop
  if exists(select 1 from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) x where x=r) then continue;end if;
  select x into c from jsonb_array_elements(coalesce(d->'contractsV202','[]')) x where x->>'id'=r->>'contractId';
  if c->>'detailsVersion' is distinct from '2' then continue;end if;
  select x into receipt from jsonb_array_elements(coalesce(d->'rentReceiptsV267','[]')) x where x->>'id'=r->>'receiptNo';
  if receipt->>'detailsVersion' is distinct from '2' or receipt->>'accountant' is distinct from c->>'accountant' or r->>'accountant' is distinct from c->>'accountant' then raise exception 'RECEIPT_ACCOUNTANT_MISMATCH';end if;
  if nullif(btrim(r->>'method'),'') is null or (r->>'method'<>'نقدي' and nullif(btrim(r->>'transactionNo'),'') is null) or receipt->>'transactionNo' is distinct from r->>'transactionNo' then raise exception 'PAYMENT_TRANSACTION_REQUIRED';end if;
  foreach f in array array['tenantProfile','tenantId','floor','contractRent','discount','rent','deposit','advance','cleaningFee','writtenOn','receivedAt','contractReceived','evictionNotice','accountant'] loop
   if receipt->'contract'->f is distinct from c->f then raise exception 'RECEIPT_DETAILS_MISMATCH:%',f;end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_validate_rental_details() from public,anon,authenticated;
create trigger aqari_z_validate_rental_details before update of payload on public.aqari_app_state for each row execute function private.aqari_validate_rental_details();

-- Extend the existing audited editor with passport; preserve all original evidence.
create or replace function private.aqari_imported_tenant_save(w uuid, ref text, patch jsonb, expected bigint, reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant public.aqari_tenants; state public.aqari_app_state; d jsonb; next_profile jsonb; f text; val text; display_name text;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'tenants','write') then raise exception 'غير مصرح بتعديل الملف.' using errcode='42501';end if;
 if expected is null or reason is null or length(btrim(reason)) not between 3 and 500 or jsonb_typeof(patch) is distinct from 'object' then raise exception 'أدخل سبب التعديل وراجع البيانات.';end if;
 if exists(select 1 from jsonb_object_keys(patch) k where k not in ('nameAr','nameEn','civilId','passportNo','phone','email','nationality','address')) then raise exception 'لا يمكن تغيير بيانات المصدر أو الربط.';end if;
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
 d:=jsonb_set(d,'{tenantDirectoryV202}',coalesce((select jsonb_agg(case when x->>'tenantProfileId'=ref then x||jsonb_build_object('tenant',display_name,'nameAr',next_profile->>'nameAr','nameEn',next_profile->>'nameEn','passportNo',next_profile->>'passportNo','phone',next_profile->>'phone','email',next_profile->>'email','civilId',next_profile->>'civilId','nationality',next_profile->>'nationality') else x end order by n) from jsonb_array_elements(coalesce(d->'tenantDirectoryV202','[]')) with ordinality a(x,n)),'[]'));
 d:=jsonb_set(d,'{tenantPreparationDraftsV267}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(d->'tenantPreparationDraftsV267','[]')) x where x->>'id'<>ref),'[]'));
 -- Contract snapshots, original source statements, receipts and payment records stay historical.
 insert into private.aqari_imported_tenant_edits(workspace_id,tenant_id,actor_id,reason,before_profile,after_profile) values(w,tenant.id,auth.uid(),btrim(reason),tenant.profile,next_profile);
 update public.aqari_app_state set payload=case when state.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(state.payload,'{snapshot,values,aqari_v30}',d) when state.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(state.payload,'{values,aqari_v30}',d) else d end,revision=state.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w;
 return private.aqari_imported_tenant_read(w,ref);
end $$;
