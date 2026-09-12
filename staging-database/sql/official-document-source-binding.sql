-- Additive/function-only development upgrade. Existing issued versions are retained.
begin;

alter table private.aqari_official_document_series add column source_key text;
create unique index aqari_official_unique_financial_source on private.aqari_official_document_series(workspace_id,kind,source_key) where source_key is not null;
create table private.aqari_official_number_reservations(
 id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),document_no text not null unique,
 kind text not null,entity_id uuid not null,actor_id uuid not null,created_at timestamptz not null default now(),unique(workspace_id,id)
);
alter table private.aqari_official_number_reservations enable row level security;
revoke all on private.aqari_official_number_reservations from public,anon,authenticated;
create trigger aqari_official_number_immutable before update or delete on private.aqari_official_number_reservations for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_official_entity_scope(w uuid,t text,i uuid,a text default 'read')
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.aqari_can(w,'documents',a) and coalesce(case t
 when 'property' then private.aqari_can_property(w,i,'properties','read')
 when 'lease' then private.aqari_can_lease(w,i,'contracts','read')
 when 'unit' then exists(select 1 from public.aqari_units u where u.workspace_id=w and u.id=i and private.aqari_can_property(w,u.property_id,'properties','read'))
 when 'tenant' then private.aqari_can_tenant(w,i,'tenants','read')
 when 'work_order' then exists(select 1 from private.aqari_work_orders o where o.workspace_id=w and o.id=i and private.aqari_can_property(w,o.property_id,'maintenance','read'))
 when 'legal_case' then exists(select 1 from private.aqari_legal_cases c where c.workspace_id=w and c.id=i and private.aqari_can_lease(w,c.lease_id,'contracts','read'))
 else false end,false)
$$;
revoke all on function private.aqari_official_entity_scope(uuid,text,uuid,text) from public,anon,authenticated;

create or replace function public.aqari_official_document_number(p_workspace_id uuid,p_request_id uuid,p_kind text,p_entity_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;r private.aqari_official_number_reservations;t text;
begin
 if auth.uid() is null or not private.aqari_official_document_access(w,true) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 t:=case when p_kind in ('payment_voucher','expense_approval','daily_collection') then 'property' when p_kind='work_order' then 'work_order' else 'lease' end;
 if private.aqari_official_template(p_kind) is null or not private.aqari_official_entity_scope(w,t,p_entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 perform 1 from public.aqari_workspaces where id=w for update;
 select * into r from private.aqari_official_number_reservations where id=p_request_id;
 if found then
  if r.workspace_id<>w or r.actor_id<>auth.uid() or r.kind<>p_kind or r.entity_id<>p_entity_id then raise exception 'DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
 else
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(p_request_id,w,'AQ-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_official_document_no_seq')::text,8,'0'),p_kind,p_entity_id,auth.uid()) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'workspace_id',r.workspace_id,'document_no',r.document_no,'kind',r.kind,'entity_id',r.entity_id);
end $$;
revoke all on function public.aqari_official_document_number(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.aqari_official_document_number(uuid,uuid,text,uuid) to authenticated;

create or replace function private.aqari_official_source(w uuid,k text,t text,i uuid,source_id uuid,fields jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare defaults jsonb;pay public.aqari_rent_payments;dep private.aqari_deposit_entries;
 expense private.aqari_financial_expenses;work private.aqari_work_orders;settlement private.aqari_vacating_settlements;
 required_entity text;receipt_count bigint;total numeric;on_date date;starts_on date;snap jsonb;v jsonb;
begin
 required_entity:=case when k in ('payment_voucher','expense_approval','daily_collection') then 'property' when k='work_order' then 'work_order'
 when k in ('rent_receipt','deposit_receipt','deposit_refund','tenant_statement','debt_notice','renewal_notice','nonrenewal_notice','receipt_voucher','key_handover','damage_report','final_settlement','clearance') then 'lease' else null end;
 if required_entity is null or t is distinct from required_entity then raise exception 'DOCUMENT_KIND_ENTITY_MISMATCH' using errcode='22023';end if;
 if not private.aqari_official_entity_scope(w,t,i,'read') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 if t='lease' then
  select jsonb_build_object('tenantName',q.full_name,'contractNo',l.contract_no,'propertyName',p.name,'unitNo',u.unit_no)
   into defaults from public.aqari_leases l join public.aqari_tenants q on q.workspace_id=w and q.id=l.tenant_id
   join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
   where l.workspace_id=w and l.id=i;
 elsif t='property' then select jsonb_build_object('propertyName',name) into defaults from public.aqari_properties where workspace_id=w and id=i;
 else
  select * into strict work from private.aqari_work_orders where workspace_id=w and id=i;
  if work.status not in ('approved','assigned','in_progress','completed') then raise exception 'DOCUMENT_APPROVED_SOURCE_REQUIRED' using errcode='23514';end if;
  select jsonb_build_object('propertyName',p.name,'vendorName',v.name,'description',work.description,'approvedAmount',work.approved_amount::text,
   'approvedBy',coalesce(nullif(pr.display_name,''),work.approved_by::text),'sourceId',work.id::text)
   into defaults from public.aqari_properties p join private.aqari_vendors v on v.workspace_id=w and v.id=work.vendor_id
   left join public.aqari_profiles pr on pr.user_id=work.approved_by where p.workspace_id=w and p.id=work.property_id;
 end if;

 if k in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','tenant_statement','debt_notice','daily_collection','final_settlement','clearance','payment_voucher','expense_approval') then
  if not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 end if;
 if k in ('rent_receipt','receipt_voucher') then
  select * into pay from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=i and p.id=source_id
   and p.status in ('paid','partial','مدفوع','جزئي') and p.amount>0
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
  if not found then raise exception 'DOCUMENT_CONFIRMED_PAYMENT_REQUIRED' using errcode='23514';end if;
  defaults:=defaults||jsonb_build_object('sourceId',pay.id::text,'amount',pay.amount::text,'period',to_char(pay.period,'YYYY-MM'),
   'paymentMethod',case pay.payment_method when 'cash' then 'نقداً' when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cheque' then 'شيك' else pay.payment_method end,
   'paymentReference',coalesce(nullif(pay.reference,''),'نقداً دون مرجع بنكي'),'reference',coalesce(nullif(pay.reference,''),'نقداً دون مرجع بنكي'),
   'collectorName',coalesce(nullif(pay.receipt->>'collectorName',''),nullif(pay.receipt->>'collector',''),nullif(pay.receipt->>'accountant','')),
   'receivedFrom',defaults->>'tenantName','reason','إيجار الفترة '||to_char(pay.period,'YYYY-MM'));
 elsif k in ('deposit_receipt','deposit_refund') then
  select * into dep from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=i and e.id=source_id
   and e.status='confirmed' and e.kind=case k when 'deposit_receipt' then 'receipt' else 'refund' end;
  if not found then raise exception 'DOCUMENT_CONFIRMED_DEPOSIT_REQUIRED' using errcode='23514';end if;
  defaults:=defaults||jsonb_build_object('sourceId',dep.id::text,'amount',dep.amount::text,'collectorName',dep.actor_name,'approvedBy',dep.actor_name,
   'reason',dep.reason,'paymentMethod',case dep.method when 'cash' then 'نقداً' when 'knet' then 'كي نت' when 'bank' then 'تحويل بنكي' when 'cheque' then 'شيك' else dep.method end);
 elsif k in ('payment_voucher','expense_approval') then
  select * into expense from private.aqari_financial_expenses e where e.workspace_id=w and e.property_id=i and e.id=source_id and e.state='approved';
  if not found then raise exception 'DOCUMENT_APPROVED_EXPENSE_REQUIRED' using errcode='23514';end if;
  defaults:=defaults||jsonb_build_object('sourceId',expense.id::text,'amount',expense.amount::text,'paidTo',expense.payee,
   'reason',expense.description,'expenseCategory',expense.category,'approvedBy',expense.approved_by_name,'invoiceReference',coalesce(nullif(expense.reference,''),expense.voucher_no));
 elsif k in ('renewal_notice','nonrenewal_notice') then
  select jsonb_build_object('currentEndDate',l.end_date::text) into v from public.aqari_leases l where l.workspace_id=w and l.id=i and l.status in ('signed','expired');
  if v is null then raise exception 'DOCUMENT_ACTIVE_LEASE_REQUIRED' using errcode='23514';end if;defaults:=defaults||v;
 elsif k in ('tenant_statement','debt_notice') then
  select start_date into starts_on from public.aqari_leases where workspace_id=w and id=i;
  on_date:=coalesce(nullif(fields->>case k when 'debt_notice' then 'dueDate' else 'toDate' end,'')::date,(now() at time zone 'Asia/Kuwait')::date);
  v:=private.aqari_official_statement(w,i,case k when 'debt_notice' then starts_on else coalesce(nullif(fields->>'fromDate','')::date,starts_on) end,on_date);
  if k='debt_notice' then
   if (v->>'closingBalance')::numeric<=0 then raise exception 'DOCUMENT_NO_ACTUAL_DEBT' using errcode='23514';end if;
   defaults:=defaults||jsonb_build_object('dueDate',on_date::text,'dueAmount',v->>'closingBalance');
  else defaults:=defaults||v;end if;
 elsif k='daily_collection' then
  if coalesce(fields->>'collectionDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'DOCUMENT_COLLECTION_DATE_REQUIRED' using errcode='22023';end if;
  on_date:=(fields->>'collectionDate')::date;
  select count(*),coalesce(sum(p.amount),0) into receipt_count,total from public.aqari_rent_payments p
   join public.aqari_leases l on l.workspace_id=w and l.id=p.lease_id join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
   where p.workspace_id=w and u.property_id=i and p.paid_at=on_date and p.status in ('paid','partial','مدفوع','جزئي')
    and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id);
  defaults:=defaults||jsonb_build_object('collectionDate',on_date::text,'receiptCount',receipt_count::text,'totalAmount',total::numeric(18,3)::text,
   'preparedBy',(select coalesce(nullif(display_name,''),auth.uid()::text) from public.aqari_profiles where user_id=auth.uid()));
 elsif k in ('final_settlement','clearance') then
  select * into settlement from private.aqari_vacating_settlements s where s.workspace_id=w and s.lease_id=i;
  if not found or settlement.status not in ('finalized','cleared','released') or (k='clearance' and settlement.status not in ('cleared','released')) then
   raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';end if;
  snap:=case k when 'clearance' then settlement.clearance_snapshot else settlement.settlement_snapshot end;
  if snap is null then raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';end if;
  -- The archived clearance must match the currently verified settlement balances.
  if k='clearance' and snap->'clearance_balances' is distinct from private.aqari_vacating_balances(w,i,settlement.vacate_date) then
   raise exception 'DOCUMENT_SETTLEMENT_CHANGED' using errcode='40001';end if;
  -- Supplemental obligations are not inferred to be settled by the old rent/deposit snapshot.
  if (exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=i)
      or exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.lease_id=i)) then
   raise exception 'DOCUMENT_SUPPLEMENTAL_SETTLEMENT_REVIEW_REQUIRED' using errcode='23514';end if;
  if k='clearance' then
   defaults:=defaults||jsonb_build_object('settlementReference',settlement.settlement_no,'approvedBy',settlement.clearance_by_name,'exceptionReason',settlement.exception_reason);
  else
   v:=snap->'final_balances';
   if v is null then raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';end if;
   if not (snap ? 'utility_balance' and snap ? 'legal_balance') then raise exception 'DOCUMENT_SUPPLEMENTAL_SETTLEMENT_REVIEW_REQUIRED' using errcode='23514';end if;
   defaults:=defaults||jsonb_build_object('rentBalance',v->>'rent_balance','damageBalance',snap->>'damage_amount','utilityBalance',snap->>'utility_balance','legalBalance',snap->>'legal_balance',
    'depositBalance',v->>'deposit_balance','netBalance',((v->>'rent_balance')::numeric+(snap->>'utility_balance')::numeric+(snap->>'legal_balance')::numeric+coalesce((snap->>'damage_amount')::numeric,0)-(v->>'deposit_balance')::numeric)::numeric(18,3)::text,
    'approvedBy',settlement.finalized_by_name);
  end if;
 end if;
 return coalesce(defaults,'{}');
end $$;
revoke all on function private.aqari_official_source(uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.aqari_official_document_context(p_workspace_id uuid,p_kind text,p_entity_id uuid default null,p_source_id uuid default null,p_fields jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w uuid:=p_workspace_id;k text:=p_kind;t text;entities jsonb;sources jsonb:='[]';defaults jsonb:='{}';source_required boolean;
begin
 if auth.uid() is null or not private.aqari_official_document_access(w,false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or octet_length(p_fields::text)>16000 then raise exception 'INVALID_DOCUMENT_REQUEST' using errcode='22023';end if;
 t:=case when k in ('payment_voucher','expense_approval','daily_collection') then 'property' when k='work_order' then 'work_order'
 when k in ('rent_receipt','deposit_receipt','deposit_refund','tenant_statement','debt_notice','renewal_notice','nonrenewal_notice','receipt_voucher','key_handover','damage_report','final_settlement','clearance') then 'lease' else null end;
 if t is null then raise exception 'DOCUMENT_KIND_ENTITY_MISMATCH' using errcode='22023';end if;
 source_required:=k in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','payment_voucher','expense_approval');
 if t='lease' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label) order by x.label),'[]') into entities from (
   select l.id,l.contract_no||' — '||q.full_name||' — '||p.name||' / '||u.unit_no label from public.aqari_leases l
   join public.aqari_tenants q on q.workspace_id=w and q.id=l.tenant_id join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
   join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
   where l.workspace_id=w and private.aqari_official_entity_scope(w,t,l.id,'read') order by l.contract_no,l.id limit 2001)x;
 elsif t='property' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.name) order by x.name),'[]') into entities from
   (select id,name from public.aqari_properties where workspace_id=w and private.aqari_official_entity_scope(w,t,id,'read') order by name,id limit 2001)x;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.order_no||' — '||x.description) order by x.order_no),'[]') into entities from
   (select id,order_no,description from private.aqari_work_orders where workspace_id=w and status in ('approved','assigned','in_progress','completed') and private.aqari_official_entity_scope(w,t,id,'read') order by order_no,id limit 2001)x;
 end if;
 if jsonb_array_length(entities)>2000 then raise exception 'DOCUMENT_OPTIONS_LIMIT' using errcode='22023';end if;
 if p_entity_id is not null then
  if not private.aqari_official_entity_scope(w,t,p_entity_id,'read') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
  if source_required and not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if k in ('rent_receipt','receipt_voucher') then
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.paid_at::text||' — '||x.amount::text||' د.ك — '||x.reference) order by x.paid_at desc),'[]') into sources from
    (select p.id,p.paid_at,p.amount,p.reference from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=p_entity_id and p.status in ('paid','partial','مدفوع','جزئي') and p.amount>0
      and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) order by p.paid_at desc,p.id limit 2001)x;
  elsif k in ('deposit_receipt','deposit_refund') then
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.voucher_no||' — '||x.amount::text||' د.ك') order by x.on_date desc),'[]') into sources from
    (select id,voucher_no,amount,on_date from private.aqari_deposit_entries where workspace_id=w and lease_id=p_entity_id and kind=case k when 'deposit_receipt' then 'receipt' else 'refund' end order by on_date desc,id limit 2001)x;
  elsif k in ('payment_voucher','expense_approval') then
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.voucher_no||' — '||x.payee||' — '||x.amount::text||' د.ك') order by x.expense_date desc),'[]') into sources from
    (select id,voucher_no,payee,amount,expense_date from private.aqari_financial_expenses where workspace_id=w and property_id=p_entity_id and state='approved' order by expense_date desc,id limit 2001)x;
  end if;
  if jsonb_array_length(sources)>2000 then raise exception 'DOCUMENT_OPTIONS_LIMIT' using errcode='22023';end if;
  if not source_required or p_source_id is not null then defaults:=private.aqari_official_source(w,k,t,p_entity_id,p_source_id,p_fields);end if;
 end if;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'kind',k,'entity_type',t,'entity_id',p_entity_id,'source_id',p_source_id,
  'source_required',source_required,'entities',entities,'sources',sources,'defaults',defaults);
end $$;
revoke all on function public.aqari_official_document_context(uuid,text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.aqari_official_document_context(uuid,text,uuid,uuid,jsonb) to authenticated;

-- Revalidate the real record at every write. Source values cannot be changed through a forged client payload.
create or replace function private.aqari_official_source_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare s private.aqari_official_document_series;defaults jsonb;key text;value jsonb;v_source_key text;
begin
 select * into strict s from private.aqari_official_document_series where workspace_id=new.workspace_id and id=new.series_id;
 if new.version=1 and not exists(select 1 from private.aqari_official_number_reservations r where r.workspace_id=s.workspace_id and r.id=s.id and r.document_no=s.document_no and r.kind=s.kind and r.entity_id=s.entity_id and r.actor_id=auth.uid()) then raise exception 'DOCUMENT_RESERVED_NUMBER_REQUIRED' using errcode='23514';end if;
 perform private.aqari_official_validate(s.kind,s.document_no,new.template_version,new.title,new.body,new.payload,new.content_sha256);
 if not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 -- Serialize mutable work-order state with issuance. Financial mutations also
 -- take the workspace ledger lock held by the public registration RPC.
 if s.kind='work_order' then perform 1 from private.aqari_work_orders where workspace_id=s.workspace_id and id=s.entity_id for share;end if;
 defaults:=private.aqari_official_source(s.workspace_id,s.kind,s.entity_type,s.entity_id,nullif(new.payload->>'sourceId','')::uuid,new.payload);
 for key,value in select * from jsonb_each(defaults) loop
  if new.payload->key is distinct from value then raise exception 'DOCUMENT_SOURCE_MISMATCH: %',key using errcode='23514';end if;
 end loop;
 if s.kind in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','payment_voucher','expense_approval','work_order') then v_source_key:=defaults->>'sourceId';
 elsif s.kind='daily_collection' then v_source_key:=s.entity_id::text||':'||(defaults->>'collectionDate');end if;
 if s.source_key is not null and s.source_key is distinct from v_source_key then raise exception 'DOCUMENT_SOURCE_CANNOT_CHANGE' using errcode='23514';end if;
 if v_source_key is not null then update private.aqari_official_document_series set source_key=v_source_key where workspace_id=s.workspace_id and id=s.id;end if;
 return new;
end $$;
revoke all on function private.aqari_official_source_guard() from public,anon,authenticated;
create trigger aqari_official_source_guard before insert on private.aqari_official_document_versions for each row execute function private.aqari_official_source_guard();

commit;
