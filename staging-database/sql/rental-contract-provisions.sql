-- Additive V267 Staging migration. No original source backfill.
begin;
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
  if (c->>'rentalTermsVersion'='1' and previous is not null and (c->'tenantProfile' is distinct from previous->'tenantProfile' or c->>'tenant' is distinct from previous->>'tenant')) or ((c->>'rentalTermsVersion' is distinct from '1' or previous is null) and (c->'tenantProfile' is distinct from p or c->>'tenant' is distinct from p->>'nameAr')) then raise exception 'TENANT_SNAPSHOT_MISMATCH';end if;
  foreach f in array array['unit','floor','contract_no','accountant','start_date','end_date','writtenOn'] loop
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
  if c->>'rentalTermsVersion' is distinct from '1' or c->>'contractReceived'='مستلم' then
  if c->>'receivedAt' is null or c->>'receivedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+]03:00$' or to_char((c->>'receivedAt')::timestamptz at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00'<>c->>'receivedAt' or (c->>'receivedAt')::timestamptz>now() or c->>'contractReceived' is distinct from 'مستلم' then raise exception 'CONTRACT_DELIVERY_INVALID';end if;
  elsif c->>'contractReceived' is distinct from 'لم يستلم' or coalesce(c->>'receivedAt','')<>'' then raise exception 'CONTRACT_DELIVERY_INVALID';end if;
  if coalesce(c->>'evictionNotice','') not in ('لم يُبلّغ','تم التبليغ','غير محدد') then raise exception 'EVICTION_STATUS_REQUIRED';end if;
  if previous->>'rentalTermsVersion'='1' and c->>'rentalTermsVersion' is distinct from '1' then raise exception 'لا يمكن إزالة ربط الشروط المعتمدة.';end if;
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
create function private.aqari_contract_due(c jsonb,period text) returns numeric language plpgsql immutable set search_path='' as $$
declare a jsonb;amount numeric:=(c->>'rent')::numeric;
begin
 if c->>'rentalTermsVersion'='1' then
  if c->>'freeMonthApproved'='true' and c->>'freeMonthPeriod'=period then return 0;end if;
  for a in select value from jsonb_array_elements(coalesce(c->'rentAdjustments','[]')) loop
   if a->>'effectiveMonth'<=period then amount:=(a->>'rent')::numeric;end if;
  end loop;
 end if;return amount;
end $$;
create table private.aqari_contract_versions (
 id bigint generated always as identity primary key,workspace_id uuid not null,contract_ref text not null,
 actor_id uuid not null,actor_name text not null,recorded_at timestamptz not null default now(),
 reason text not null,before_snapshot jsonb,after_snapshot jsonb not null
);
create index on private.aqari_contract_versions(workspace_id,contract_ref,id desc);
alter table private.aqari_contract_versions enable row level security;
revoke all on private.aqari_contract_versions from public,anon,authenticated;
create function private.aqari_validate_contract_provisions() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb:=private.aqari_unwrap(new.payload);old_d jsonb:=private.aqari_unwrap(old.payload);c jsonb;previous jsonb;a jsonb;r jsonb;receipt jsonb;f text;last_month text;old_n integer;idx integer;due numeric;
begin
 for previous in select value from jsonb_array_elements(coalesce(old_d->'contractsV202','[]')) where value->>'rentalTermsVersion'='1' loop
  if not exists(select 1 from jsonb_array_elements(coalesce(d->'contractsV202','[]')) x where x->>'id'=previous->>'id') then raise exception 'لا يمكن حذف العقد المرتبط وسجله السابق.';end if;
 end loop;
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  select x into previous from jsonb_array_elements(coalesce(old_d->'contractsV202','[]')) x where x->>'id'=c->>'id';
  if c=previous or c->>'rentalTermsVersion' is distinct from '1' then continue;end if;
  if c->>'source'<>'v267-cloud' then raise exception 'الشروط الجديدة متاحة للعقود الجديدة فقط دون تغيير أصل الاستيراد.';end if;
  if jsonb_typeof(c->'freeMonthApproved') is distinct from 'boolean' or jsonb_typeof(c->'rentAdjustments') is distinct from 'array' then raise exception 'أكمل إعداد الشهر المجاني وجدول التعديلات.';end if;
  if nullif(c->>'depositReceivedOn','') is not null then
   if c->>'depositReceivedOn' !~ '^\d{4}-\d{2}-\d{2}$' or (c->>'deposit')::numeric<=0 or (c->>'depositReceivedOn')::date>(now() at time zone 'Asia/Kuwait')::date then raise exception 'راجع مبلغ وتاريخ استلام التأمين.';end if;
  end if;
  if c->>'freeMonthApproved'='true' then
   if coalesce(c->>'freeMonthPeriod','') !~ '^\d{4}-(0[1-9]|1[0-2])$' or c->>'freeMonthPeriod'<left(c->>'start_date',7) or c->>'freeMonthPeriod'>left(c->>'end_date',7) then raise exception 'الشهر المجاني خارج مدة العقد.';end if;
   if (previous->>'freeMonthApproved' is distinct from 'true' or previous->>'freeMonthPeriod' is distinct from c->>'freeMonthPeriod') and not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='اعتماد المدير العام مطلوب للشهر المجاني.';end if;
  elsif coalesce(c->>'freeMonthPeriod','')<>'' then raise exception 'حدد الشهر فقط عند اعتماده.';end if;
  if previous is not null then
   if previous->>'status'<>'draft' and not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='تعديل العقد بعد المسودة يتطلب اعتماد المدير العام.';end if;
   if length(btrim(coalesce(c->>'changeReason',''))) not between 3 and 500 then raise exception 'أدخل سبب التعديل لحفظه في سجل العقد.';end if;
   foreach f in array array['tenantId','tenantProfile','tenant','property','unit','contract_no','writtenOn','contractRent','rent','discount'] loop
    if c->f is distinct from previous->f then raise exception 'هوية العقد وشروطه الأصلية ثابتة؛ استخدم تعديل الخصم المؤرخ.';end if;
   end loop;
   if c->'freeMonthApproved' is distinct from previous->'freeMonthApproved' or c->'freeMonthPeriod' is distinct from previous->'freeMonthPeriod' then
    if not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='اعتماد المدير العام مطلوب.';end if;
    if exists(select 1 from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) x where x->>'contractId'=c->>'id' and x->>'period' in (c->>'freeMonthPeriod',previous->>'freeMonthPeriod')) then raise exception 'لا يمكن تغيير شهر مجاني مرتبط بتحصيل محفوظ.';end if;
   end if;
  end if;
  old_n:=coalesce(jsonb_array_length(previous->'rentAdjustments'),0);idx:=0;last_month:='';
  if jsonb_array_length(c->'rentAdjustments')<old_n or jsonb_array_length(c->'rentAdjustments')>old_n+1 then raise exception 'التعديلات السابقة ثابتة؛ أضف تعديلاً واحداً مؤرخاً.';end if;
  for a in select value from jsonb_array_elements(c->'rentAdjustments') loop
   if coalesce(a->>'effectiveMonth','') !~ '^\d{4}-(0[1-9]|1[0-2])$' or a->>'effectiveMonth'<=last_month or a->>'effectiveMonth'<left(c->>'start_date',7) or a->>'effectiveMonth'>left(c->>'end_date',7) or length(btrim(coalesce(a->>'reason','')))<3 then raise exception 'راجع شهر التعديل وسببه.';end if;
   if jsonb_typeof(a->'discount') is distinct from 'number' or jsonb_typeof(a->'rent') is distinct from 'number' or (a->>'discount')::numeric<0 or round((a->>'discount')::numeric,3)<>(a->>'discount')::numeric or (a->>'rent')::numeric<=0 or (a->>'rent')::numeric<>(c->>'contractRent')::numeric-(a->>'discount')::numeric then raise exception 'قيمة تعديل الخصم غير صالحة.';end if;
   if idx<old_n then
    if a is distinct from previous->'rentAdjustments'->idx then raise exception 'لا يمكن استبدال تعديل سابق.';end if;
   else
    if not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='اعتماد المدير العام مطلوب لتعديل الخصم.';end if;
    if a->>'effectiveMonth'<to_char(now() at time zone 'Asia/Kuwait','YYYY-MM') then raise exception 'لا يمكن تطبيق تعديل الخصم بأثر رجعي.';end if;
    if exists(select 1 from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) x where x->>'contractId'=c->>'id' and x->>'period'>=a->>'effectiveMonth') then raise exception 'يوجد تحصيل محفوظ في فترة التعديل؛ اختر فترة لاحقة.';end if;
   end if;
   idx:=idx+1;last_month:=a->>'effectiveMonth';
  end loop;
  if c->>'status' in ('approved','signed') and previous->>'status' is distinct from c->>'status' and not private.aqari_manager(new.workspace_id) then raise insufficient_privilege using message='اعتماد المدير العام مطلوب.';end if;
  if c->>'status'='signed' and previous->>'status' is distinct from 'signed' and not exists(select 1 from public.aqari_documents where workspace_id=new.workspace_id and entity_type='lease' and entity_ref=c->>'id' and document_type='signed_contract' and status='uploaded') then raise exception 'ارفع العقد الموقّع وربطه بهذا العقد قبل اعتماد التوقيع.';end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(d->'rentLedgerV202','[]')) loop
  if exists(select 1 from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) x where x=r) then continue;end if;
  select x into c from jsonb_array_elements(coalesce(d->'contractsV202','[]')) x where x->>'id'=r->>'contractId';
  if c->>'rentalTermsVersion' is distinct from '1' then continue;end if;
  due:=private.aqari_contract_due(c,r->>'period');
  if due<=0 or (r->>'due')::numeric is distinct from due then raise exception 'المستحق لا يطابق الشهر والخصم المعتمدين، أو الشهر مجاني.';end if;
  select x into receipt from jsonb_array_elements(coalesce(d->'rentReceiptsV267','[]')) x where x->>'id'=r->>'receiptNo';
  foreach f in array array['rentalTermsVersion','depositReceivedOn','freeMonthApproved','freeMonthPeriod','rentAdjustments'] loop
   if receipt->'contract'->f is distinct from c->f then raise exception 'بيانات الوصل لا تطابق نسخة العقد المحفوظة.';end if;
  end loop;
 end loop;return new;
end $$;
create function private.aqari_audit_contract_versions() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb;previous jsonb;actor text;d jsonb:=private.aqari_unwrap(new.payload);old_d jsonb:=private.aqari_unwrap(old.payload);
begin
 select display_name into actor from public.aqari_profiles where user_id=auth.uid();
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  select x into previous from jsonb_array_elements(coalesce(old_d->'contractsV202','[]')) x where x->>'id'=c->>'id';
  if c=previous or c->>'source' is distinct from 'v267-cloud' then continue;end if;
  insert into private.aqari_contract_versions(workspace_id,contract_ref,actor_id,actor_name,reason,before_snapshot,after_snapshot) values(new.workspace_id,c->>'id',auth.uid(),coalesce(actor,auth.uid()::text),coalesce(nullif(c->>'changeReason',''),'إنشاء أو انتقال حالة عقد'),previous,c);
 end loop;return new;
end $$;
create function public.aqari_contract_history(p_workspace_id uuid,p_contract_ref text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.aqari_can(p_workspace_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select * from private.aqari_contract_versions where workspace_id=p_workspace_id and contract_ref=p_contract_ref order by id desc limit 100) x),'[]');
end $$;
create trigger aqari_zz_contract_provisions before update of payload on public.aqari_app_state for each row execute function private.aqari_validate_contract_provisions();
create trigger aqari_contract_versions after update of payload on public.aqari_app_state for each row execute function private.aqari_audit_contract_versions();
revoke all on function private.aqari_contract_due(jsonb,text),private.aqari_validate_contract_provisions(),private.aqari_audit_contract_versions(),public.aqari_contract_history(uuid,text) from public,anon,authenticated;
grant execute on function public.aqari_contract_history(uuid,text) to authenticated;
commit;
