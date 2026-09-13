-- Additive linked renewal workflow. Requires rental-contract-templates.sql and
-- lease-renewal-freeze-guard.sql. No balances, deposits, old terms or files move.
begin;
create table if not exists private.aqari_lease_renewals(
 workspace_id uuid not null, successor_lease_id uuid primary key, predecessor_lease_id uuid not null,
 source_snapshot jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,successor_lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,predecessor_lease_id) references public.aqari_leases(workspace_id,id),
 check(successor_lease_id<>predecessor_lease_id)
);
create index if not exists aqari_lease_renewals_predecessor on private.aqari_lease_renewals(workspace_id,predecessor_lease_id);
create index if not exists aqari_lease_renewals_actor on private.aqari_lease_renewals(created_by);
alter table private.aqari_lease_renewals enable row level security;
revoke all on private.aqari_lease_renewals from public,anon,authenticated;

create or replace function private.aqari_renewal_source(w uuid,lid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('lease_id',l.id,'contract_ref',l.external_ref,'contract_no',l.contract_no,
  'tenant_ref',t.external_ref,'property',p.name,'unit',u.unit_no,'start_date',to_char(l.start_date,'YYYY-MM-DD'),'end_date',to_char(l.end_date,'YYYY-MM-DD'),
  'snapshot_sha256',encode(sha256(convert_to(l.snapshot::text,'UTF8')),'hex'))
 from public.aqari_leases l join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
 join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
 where l.workspace_id=w and l.id=lid
$$;
revoke all on function private.aqari_renewal_source(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_lease_renewal_context(w uuid,ref text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare l public.aqari_leases; reason text; source_value jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for share;
 select * into l from public.aqari_leases where workspace_id=w and external_ref=ref;
 if not found or not private.aqari_can_lease(w,l.id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 source_value:=private.aqari_renewal_source(w,l.id);
 if not private.aqari_can_lease(w,l.id,'contracts','write') then reason:='صلاحية إنشاء عقد مطلوبة لإعداد التجديد.';
 elsif l.status not in('approved','signed','expired') or l.start_date is null or l.end_date is null or l.vacated_on is not null then reason:='التجديد يحتاج عقدًا معتمدًا أو موقّعًا أو منتهي المدة بتواريخ مكتملة، دون إخلاء مسجّل.';
 elsif exists(select 1 from private.aqari_cheques c join public.aqari_leases prior on prior.workspace_id=c.workspace_id and prior.id=c.lease_id where c.workspace_id=w and c.renewal_frozen and prior.tenant_id=l.tenant_id and prior.unit_id=l.unit_id) then reason:='تجميد التجديد ما زال قائمًا في سجل الشيكات لهذا المستأجر والوحدة.';
 elsif exists(select 1 from private.aqari_lease_renewals r join public.aqari_leases next_lease on next_lease.workspace_id=r.workspace_id and next_lease.id=r.successor_lease_id where r.workspace_id=w and r.predecessor_lease_id=l.id and next_lease.status<>'cancelled') then reason:='يوجد عقد تجديد محفوظ لهذا الأصل. افتحه لاستكماله بدل إنشاء نسخة أخرى.';
 end if;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'can_prepare',reason is null,'reason',reason,
  'source',source_value,'suggestedStart',case when l.end_date is not null then to_char(l.end_date+1,'YYYY-MM-DD') end);
end $$;
revoke all on function private.aqari_lease_renewal_context(uuid,text) from public,anon,authenticated;
grant execute on function private.aqari_lease_renewal_context(uuid,text) to authenticated;
create or replace function public.aqari_lease_renewal_context(p_workspace_id uuid,p_contract_ref text) returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_lease_renewal_context(p_workspace_id,p_contract_ref)$$;
revoke all on function public.aqari_lease_renewal_context(uuid,text) from public,anon,authenticated;
grant execute on function public.aqari_lease_renewal_context(uuid,text) to authenticated;

-- A cancellation recovery never erases a signed or financially used successor.
create or replace function private.aqari_renewal_has_commitment(w uuid,l public.aqari_leases) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.aqari_rent_payments where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_credit_allocations where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_tenant_ledger_entries where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_deposit_entries where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_cheques where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_tenant_adjustments where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_legal_costs where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_commercial_sales where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_commercial_collections where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_commercial_payment_allocations where workspace_id=w and lease_id=l.id)
 or exists(select 1 from private.aqari_contract_versions where workspace_id=w and contract_ref=l.external_ref and after_snapshot->>'status'='signed')
 or exists(select 1 from private.aqari_unit_inspections where workspace_id=w and lease_id=l.id and status='signed')
 or exists(select 1 from public.aqari_documents where workspace_id=w and entity_type='lease' and entity_ref=l.external_ref and document_type='signed_contract' and status='uploaded')
 or exists(select 1 from private.aqari_document_handovers h join public.aqari_documents d on d.workspace_id=h.workspace_id and d.id=h.document_id where h.workspace_id=w and d.entity_type='lease' and d.entity_ref=l.external_ref)
$$;
revoke all on function private.aqari_renewal_has_commitment(uuid,public.aqari_leases) from public,anon,authenticated;

create or replace function private.aqari_validate_linked_renewal() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare binding jsonb:=new.snapshot->'renewalSource'; saved private.aqari_lease_renewals; source_lease public.aqari_leases; source_value jsonb; needs_review boolean;
begin
 if tg_op='UPDATE' then
  select * into saved from private.aqari_lease_renewals where workspace_id=old.workspace_id and successor_lease_id=old.id;
  if exists(select 1 from private.aqari_lease_renewals r join public.aqari_leases next_lease
   on next_lease.workspace_id=r.workspace_id and next_lease.id=r.successor_lease_id
   where r.workspace_id=old.workspace_id and r.predecessor_lease_id=old.id and next_lease.status<>'cancelled'
    and new.end_date>=next_lease.start_date) then raise exception 'لا يمكن مد مدة الأصل لتتداخل مع عقد تجديد محفوظ.';end if;
  if saved.successor_lease_id is null then
   if old.snapshot->'renewalSource' is distinct from binding then raise exception 'لا يمكن ربط عقد قديم بالتجديد بأثر رجعي. أنشئ مسودة تجديد جديدة.';end if;
   return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.id is distinct from old.id or binding is distinct from saved.source_snapshot
   or new.tenant_id is distinct from old.tenant_id or new.unit_id is distinct from old.unit_id then raise exception 'هوية عقد التجديد ورابطه بالأصل ثابتان.';end if;
  if old.status='cancelled' and new.status<>'cancelled' then raise exception 'التجديد الملغى محفوظ للتدقيق؛ أنشئ عقد تجديد جديدًا من الأصل.';end if;
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
   if old.status not in('draft','ready','approved','signing') then raise exception 'العقد الموقّع أو المنتهي يحتاج مسار الإنهاء والتسوية، ولا يلغى كمسودة تجديد.';end if;
   if length(btrim(coalesce(new.snapshot->>'changeReason',''))) not between 3 and 500 then raise exception 'أدخل سبب إلغاء التجديد لحفظه في سجل العقد.';end if;
   if not private.aqari_can_lease(old.workspace_id,old.id,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   if old.status in('approved','signing') then
    if not private.aqari_manager(old.workspace_id) then raise insufficient_privilege using message='إلغاء تجديد معتمد غير موقّع متاح للمدير العام فقط.';end if;
    perform private.aqari_require_sensitive_aal2(old.workspace_id);
   end if;
   perform 1 from public.aqari_app_state where workspace_id=old.workspace_id for update;
   if private.aqari_renewal_has_commitment(old.workspace_id,old) then raise exception 'يوجد توقيع أو سجل مالي على التجديد؛ استخدم مسار الإنهاء والتسوية مع حفظ الالتزامات.';end if;
  end if;
  needs_review:=new.status<>'cancelled' and (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
   or (new.status is distinct from old.status and (old.status in('draft','ready','cancelled','expired') or new.status in('ready','approved','signing','signed'))));
  if not needs_review then return new;end if;
 else
  if binding is null then return new;end if;
 end if;
 if jsonb_typeof(binding) is distinct from 'object' then raise exception 'رابط العقد السابق غير صالح.';end if;
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise exception 'مساحة عمل التجديد غير متاحة.';end if;
 select * into source_lease from public.aqari_leases where workspace_id=new.workspace_id and id=(binding->>'lease_id')::uuid;
 if not found or not private.aqari_can_lease(new.workspace_id,source_lease.id,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 source_value:=private.aqari_renewal_source(new.workspace_id,source_lease.id);
 if source_lease.id=new.id or source_lease.status not in('approved','signed','expired') or source_lease.vacated_on is not null
  or source_lease.start_date is null or source_lease.end_date is null or new.start_date is null or new.end_date is null then raise exception 'العقد السابق غير متاح لتجديد مترابط بتواريخ مكتملة.';end if;
 if source_value is distinct from binding then raise exception 'تغيرت بيانات العقد السابق. راجعها وأنشئ مسودة تجديد من النسخة الحالية.';end if;
 if source_lease.tenant_id is distinct from new.tenant_id or source_lease.unit_id is distinct from new.unit_id or source_lease.contract_no=new.contract_no then raise exception 'التجديد يحتاج نفس المستأجر والوحدة ورقم عقد جديدًا.';end if;
 if new.start_date<=source_lease.end_date or new.end_date<new.start_date then raise exception 'بداية التجديد يجب أن تكون بعد نهاية العقد السابق دون تداخل.';end if;
 if exists(select 1 from private.aqari_cheques c join public.aqari_leases prior on prior.workspace_id=c.workspace_id and prior.id=c.lease_id
  where c.workspace_id=new.workspace_id and c.renewal_frozen and prior.tenant_id=source_lease.tenant_id and prior.unit_id=source_lease.unit_id) then
  raise exception 'لا يمكن اعتماد أو متابعة التجديد قبل معالجة تجميده في سجل الشيكات.' using errcode='23514';end if;
 if exists(select 1 from private.aqari_lease_renewals r join public.aqari_leases next_lease on next_lease.workspace_id=r.workspace_id and next_lease.id=r.successor_lease_id
  where r.workspace_id=new.workspace_id and r.predecessor_lease_id=source_lease.id and r.successor_lease_id<>new.id and next_lease.status<>'cancelled') then raise exception 'يوجد عقد تجديد غير ملغى مرتبط بهذا الأصل.';end if;
 if tg_op='INSERT' then
  insert into private.aqari_lease_renewals(workspace_id,successor_lease_id,predecessor_lease_id,source_snapshot,created_by)
  values(new.workspace_id,new.id,source_lease.id,binding,auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.aqari_validate_linked_renewal() from public,anon,authenticated;
drop trigger if exists aqari_linked_renewal_insert on public.aqari_leases;
create trigger aqari_linked_renewal_insert after insert on public.aqari_leases for each row execute function private.aqari_validate_linked_renewal();
drop trigger if exists aqari_linked_renewal_update on public.aqari_leases;
create trigger aqari_linked_renewal_update before update on public.aqari_leases for each row execute function private.aqari_validate_linked_renewal();

create or replace function private.aqari_lease_renewal_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'سجل ربط التجديد محفوظ ولا يقبل الحذف أو الاستبدال.';end $$;
revoke all on function private.aqari_lease_renewal_immutable() from public,anon,authenticated;
drop trigger if exists aqari_lease_renewal_immutable on private.aqari_lease_renewals;
create trigger aqari_lease_renewal_immutable before update or delete on private.aqari_lease_renewals for each row execute function private.aqari_lease_renewal_immutable();

-- Serialize new liabilities/signature evidence with cancellation, including
-- operations RPCs that do not save app_state themselves. Existing history is untouched.
create or replace function private.aqari_guard_cancelled_renewal_commitment() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare lid uuid;
begin
 if tg_table_name='aqari_documents' then
  if new.entity_type<>'lease' or new.document_type<>'signed_contract' or new.status<>'uploaded' then return new;end if;
  select id into lid from public.aqari_leases where workspace_id=new.workspace_id and external_ref=new.entity_ref;
 elsif tg_table_name='aqari_document_handovers' then
  select l.id into lid from public.aqari_documents d join public.aqari_leases l on l.workspace_id=d.workspace_id and l.external_ref=d.entity_ref
   where d.workspace_id=new.workspace_id and d.id=new.document_id and d.entity_type='lease';
 else
  if tg_table_name='aqari_unit_inspections' then
   if new.status<>'signed' then return new;end if;
  end if;
  lid:=new.lease_id;
 end if;
 if lid is null then return new;end if;
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_lease_renewals r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.successor_lease_id
  where r.workspace_id=new.workspace_id and l.id=lid and l.status='cancelled') then raise exception 'التجديد ملغى؛ لا يمكن إنشاء التزام أو توقيع جديد عليه.';end if;
 return new;
end $$;
revoke all on function private.aqari_guard_cancelled_renewal_commitment() from public,anon,authenticated;
do $triggers$ declare rel regclass;begin
 foreach rel in array array['public.aqari_rent_payments'::regclass,'private.aqari_deposit_entries'::regclass,'private.aqari_cheques'::regclass,
  'private.aqari_tenant_adjustments'::regclass,'private.aqari_legal_costs'::regclass,'private.aqari_commercial_sales'::regclass,
  'private.aqari_commercial_collections'::regclass,'private.aqari_commercial_payment_allocations'::regclass,'private.aqari_credit_allocations'::regclass,'private.aqari_tenant_ledger_entries'::regclass,'private.aqari_unit_inspections'::regclass,
  'public.aqari_documents'::regclass,'private.aqari_document_handovers'::regclass] loop
  execute format('drop trigger if exists aqari_cancelled_renewal_commitment on %s',rel);
  execute format('create trigger aqari_cancelled_renewal_commitment before insert or update on %s for each row execute function private.aqari_guard_cancelled_renewal_commitment()',rel);
 end loop;
end $triggers$;

-- Check the final projected state as well: array order must not permit an
-- approved/new successor to be validated before its source changes in that save.
create or replace function private.aqari_verify_renewal_projection() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare d jsonb:=private.aqari_unwrap(new.payload);before_d jsonb:=private.aqari_unwrap(old.payload);c jsonb;previous jsonb;l public.aqari_leases;p public.aqari_leases;review boolean;
begin
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) where value ? 'renewalSource' loop
  select value into previous from jsonb_array_elements(coalesce(before_d->'contractsV202','[]')) where value->>'id'=c->>'id';
  review:=previous is null or ((c->>'status')<>'cancelled' and
   (c->'start_date' is distinct from previous->'start_date' or c->'end_date' is distinct from previous->'end_date'
    or (c->'status' is distinct from previous->'status' and
     (previous->>'status' in('draft','ready','cancelled','expired') or c->>'status' in('ready','approved','signing','signed')))));
  if not coalesce(review,false) then continue;end if;
  select * into l from public.aqari_leases where workspace_id=new.workspace_id and external_ref=c->>'id';
  select * into p from public.aqari_leases where workspace_id=new.workspace_id and id=(c#>>'{renewalSource,lease_id}')::uuid;
  if l.id is null or p.id is null or p.status not in('approved','signed','expired') or p.vacated_on is not null
   or p.start_date is null or p.end_date is null or l.start_date<=p.end_date
   or private.aqari_renewal_source(new.workspace_id,p.id) is distinct from c->'renewalSource' then
   raise exception 'تغير أصل التجديد داخل عملية الحفظ. راجع الأصل والخلف واحفظهما من بيانات متوافقة.';end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_verify_renewal_projection() from public,anon,authenticated;
drop trigger if exists aqari_zz_verify_linked_renewals on public.aqari_app_state;
create trigger aqari_zz_verify_linked_renewals after update of payload on public.aqari_app_state for each row execute function private.aqari_verify_renewal_projection();
commit;
