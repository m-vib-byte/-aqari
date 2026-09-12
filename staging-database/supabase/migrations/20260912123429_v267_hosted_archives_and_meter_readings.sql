begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Source: staging-database/sql/unit-meter-readings.sql
-- Append-only unit handover readings. Apply only after verified backup and scope.
-- Depends on staff-property-scope.sql, operations-register.sql and MFA helpers.

create table private.aqari_unit_meter_readings(
 id uuid primary key,workspace_id uuid not null,property_id uuid not null,unit_id uuid not null,
 lease_id uuid not null,meter_id uuid not null,phase text not null check(phase in ('entry','periodic','exit')),
 reading numeric(18,3) not null check(reading>=0 and reading<1000000000000000),
 reading_unit text not null check(reading_unit in ('kWh','m3')),
 observed_on date not null,source_ref text not null check(length(btrim(source_ref)) between 3 and 500),
 photo_document_id uuid references public.aqari_documents(id),
 supersedes_id uuid references private.aqari_unit_meter_readings(id),
 reason text not null check(length(btrim(reason)) between 3 and 500),
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 unique(workspace_id,id),unique(supersedes_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(meter_id) references public.aqari_utility_meters(id)
);
create index aqari_unit_meter_history on private.aqari_unit_meter_readings(workspace_id,lease_id,meter_id,observed_on);
alter table private.aqari_unit_meter_readings enable row level security;
revoke all on private.aqari_unit_meter_readings from public,anon,authenticated;
create trigger aqari_unit_meter_readings_immutable before update or delete on private.aqari_unit_meter_readings
 for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_unit_meter_access(w uuid,p uuid,a text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.aqari_can_property(w,p,'maintenance',a) or private.aqari_can_property(w,p,'properties',a)
$$;
revoke all on function private.aqari_unit_meter_access(uuid,uuid,text) from public,anon,authenticated;

create function private.aqari_unit_meter_register(w uuid,a text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare l public.aqari_leases;u public.aqari_units;m public.aqari_utility_meters;
 r private.aqari_unit_meter_readings;old private.aqari_unit_meter_readings;
 ident uuid;photo uuid;prior uuid;amount numeric;observed date;unit_label text;expected jsonb;
begin
 if auth.uid() is null or not (private.aqari_can(w,'maintenance','read') or private.aqari_can(w,'properties','read')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if a is null or a not in ('list','record') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>8192 then raise invalid_parameter_value using message='INVALID_METER_REQUEST';end if;
 if a='list' then
  return jsonb_build_object(
   'leases',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unit_id',q.id,'unit_no',q.unit_no,'property_id',p.id,'property_name',p.name,'property_ref',p.external_ref,'start_date',x.start_date,'can_write',private.aqari_unit_meter_access(w,p.id,'write')) order by p.name,q.unit_no,x.start_date desc) from public.aqari_leases x join public.aqari_units q on q.workspace_id=x.workspace_id and q.id=x.unit_id join public.aqari_properties p on p.workspace_id=q.workspace_id and p.id=q.property_id where x.workspace_id=w and private.aqari_unit_meter_access(w,p.id,'read')),'[]'),
   'meters',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'property_id',x.property_id,'unit_no',x.unit_no,'kind',x.kind,'serial_no',x.serial_no) order by x.kind,x.serial_no) from public.aqari_utility_meters x where x.workspace_id=w and private.aqari_unit_meter_access(w,x.property_id,'read')),'[]'),
   'readings',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('superseded',exists(select 1 from private.aqari_unit_meter_readings n where n.workspace_id=w and n.supersedes_id=x.id)) order by x.recorded_at desc,x.id) from private.aqari_unit_meter_readings x where x.workspace_id=w and private.aqari_unit_meter_access(w,x.property_id,'read')),'[]'));
 end if;
 ident:=(d->>'id')::uuid;photo:=nullif(d->>'photo_document_id','')::uuid;prior:=nullif(d->>'supersedes_id','')::uuid;
 select * into l from public.aqari_leases where workspace_id=w and id=(d->>'lease_id')::uuid;
 select * into u from public.aqari_units where workspace_id=w and id=l.unit_id;
 if l.id is null or u.id is null or not private.aqari_unit_meter_access(w,u.property_id,'write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 -- Serialize readings/corrections on the existing lease, including concurrent retries.
 perform 1 from public.aqari_leases where workspace_id=w and id=l.id for update;
 select * into m from public.aqari_utility_meters where workspace_id=w and id=(d->>'meter_id')::uuid;
 if m.id is null or m.property_id<>u.property_id or nullif(btrim(m.unit_no),'') is distinct from btrim(u.unit_no) then raise check_violation using message='METER_UNIT_MISMATCH';end if;
 if ident is null or coalesce(d->>'phase','') not in ('entry','periodic','exit') or coalesce(d->>'reading','')!~'^[0-9]{1,15}(\.[0-9]{1,3})?$' or coalesce(d->>'observed_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or length(btrim(coalesce(d->>'source_ref',''))) not between 3 and 500 or length(btrim(coalesce(d->>'reason',''))) not between 3 and 500 then raise check_violation using message='INVALID_METER_READING';end if;
 amount:=(d->>'reading')::numeric;observed:=(d->>'observed_on')::date;unit_label:=case m.kind when 'water' then 'm3' when 'electricity' then 'kWh' end;
 if unit_label is null or observed>(now() at time zone 'Asia/Kuwait')::date then raise check_violation using message='INVALID_READING_DATE_OR_KIND';end if;
 expected:=jsonb_build_object('id',ident,'workspace_id',w,'property_id',u.property_id,'unit_id',u.id,'lease_id',l.id,'meter_id',m.id,'phase',d->>'phase','reading',amount,'reading_unit',unit_label,'observed_on',observed,'source_ref',btrim(d->>'source_ref'),'photo_document_id',photo,'supersedes_id',prior,'reason',btrim(d->>'reason'));
 select * into r from private.aqari_unit_meter_readings where id=ident;
 if found then
  if (to_jsonb(r)-'recorded_by'-'recorded_at') is distinct from expected then raise unique_violation using message='METER_IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(r);
 end if;
 if photo is not null and (not private.aqari_operations_document(w,u.property_id,photo) or not exists(select 1 from public.aqari_documents doc where doc.workspace_id=w and doc.id=photo and doc.mime_type in ('image/jpeg','image/png','image/webp') and doc.metadata->>'unit_meter_reading_id'=ident::text and doc.metadata->>'meter_id'=m.id::text)) then raise check_violation using message='METER_PHOTO_UNVERIFIED';end if;
 if prior is not null then
  select * into old from private.aqari_unit_meter_readings where workspace_id=w and id=prior;
  if old.id is null or old.lease_id<>l.id or old.meter_id<>m.id or old.phase<>d->>'phase' or exists(select 1 from private.aqari_unit_meter_readings where supersedes_id=prior) then raise check_violation using message='METER_CORRECTION_CONFLICT';end if;
 end if;
 if d->>'phase' in ('entry','exit') and exists(select 1 from private.aqari_unit_meter_readings x where x.workspace_id=w and x.lease_id=l.id and x.meter_id=m.id and x.phase=d->>'phase' and x.id is distinct from prior and not exists(select 1 from private.aqari_unit_meter_readings n where n.supersedes_id=x.id)) then raise unique_violation using message='METER_PHASE_ALREADY_RECORDED';end if;
 -- Active historical readings must remain monotonic; no invented rollover values.
 if exists(select 1 from private.aqari_unit_meter_readings x where x.workspace_id=w and x.lease_id=l.id and x.meter_id=m.id and x.id is distinct from prior and not exists(select 1 from private.aqari_unit_meter_readings n where n.supersedes_id=x.id) and ((x.observed_on<observed and x.reading>amount) or (x.observed_on>observed and x.reading<amount) or (d->>'phase'='entry' and (observed>x.observed_on or amount>x.reading)) or (d->>'phase'='exit' and (observed<x.observed_on or amount<x.reading)) or (x.phase='entry' and (observed<x.observed_on or amount<x.reading)) or (x.phase='exit' and (observed>x.observed_on or amount>x.reading)))) then raise check_violation using message='METER_READING_ORDER_CONFLICT';end if;
 insert into private.aqari_unit_meter_readings(id,workspace_id,property_id,unit_id,lease_id,meter_id,phase,reading,reading_unit,observed_on,source_ref,photo_document_id,supersedes_id,reason,recorded_by)
 values(ident,w,u.property_id,u.id,l.id,m.id,d->>'phase',amount,unit_label,observed,btrim(d->>'source_ref'),photo,prior,btrim(d->>'reason'),auth.uid()) returning * into r;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
 values(w,'unit_meter',ident,case when prior is null then 'record' else 'correct' end,auth.uid(),auth.uid()::text,r.reason,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function private.aqari_unit_meter_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_unit_meter_register(uuid,text,jsonb) to authenticated;
create function public.aqari_unit_meter_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_unit_meter_register(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_unit_meter_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_unit_meter_register(uuid,text,jsonb) to authenticated;

-- Source: staging-database/sql/financial-archive.sql
-- Scoped monthly history projection. No financial writes or new accounting totals.

create function private.aqari_financial_archive(w uuid,month_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare first_day date;next_month date;base jsonb;entries jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if month_key is null or month_key!~'^[0-9]{4}-(0[1-9]|1[0-2])$' then raise invalid_parameter_value using message='INVALID_ARCHIVE_MONTH';end if;
 first_day:=(month_key||'-01')::date;next_month:=(first_day+interval '1 month')::date;
 base:=public.aqari_financial_register(w,'list',jsonb_build_object('month',month_key));
 select coalesce(jsonb_agg(to_jsonb(x) order by x.on_date,x.stream,x.id),'[]') into entries from(
  select 'rent'::text stream,p.id,u.property_id,p.lease_id,p.paid_at on_date,p.amount::text amount,'received'::text direction,
   case when exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) then 'cancelled' else p.status end status,
   p.reference,coalesce(p.receipt->>'collectorName','') description
  from public.aqari_rent_payments p join public.aqari_leases l on l.workspace_id=p.workspace_id and l.id=p.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where p.workspace_id=w and p.paid_at>=first_day and p.paid_at<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select 'expense',e.id,e.property_id,null,e.expense_date,e.amount::text,'paid',e.state,coalesce(e.voucher_no,e.reference),e.description from private.aqari_financial_expenses e
  where e.workspace_id=w and e.expense_date>=first_day and e.expense_date<next_month and private.aqari_can_property(w,e.property_id,'finance','read')
  union all
  select 'deposit',e.id,u.property_id,e.lease_id,e.on_date,e.amount::text,e.kind,e.status,e.voucher_no,e.reason from private.aqari_deposit_entries e
  join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.on_date>=first_day and e.on_date<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select 'adjustment',e.id,u.property_id,e.lease_id,e.occurred_on,e.amount::text,e.direction,'recorded',e.source_type||':'||e.source_id,e.reason from private.aqari_tenant_adjustments e
  join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.occurred_on>=first_day and e.occurred_on<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select case when e.kind in ('opening_credit','opening_debit','opening_balance') then 'opening' else 'tenant_ledger' end,e.id,u.property_id,e.lease_id,e.occurred_on,e.amount::text,e.direction,'recorded',e.source_type||':'||e.source_id,e.reason from private.aqari_tenant_ledger_entries e
  left join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id left join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.occurred_on>=first_day and e.occurred_on<next_month and (private.aqari_can_property(w,u.property_id,'finance','read') or (e.lease_id is null and private.aqari_manager(w)))
  union all
  select 'credit_allocation',e.id,u.property_id,e.lease_id,e.period,e.amount::text,'allocation','recorded',e.credit_entry_id::text,'تخصيص رصيد سابق، وليس تحصيلاً جديداً' from private.aqari_credit_allocations e
  join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where e.workspace_id=w and e.period>=first_day and e.period<next_month and private.aqari_can_property(w,u.property_id,'finance','read')
  union all
  select 'petty_cash',e.id,e.property_id,null,(e.created_at at time zone 'Asia/Kuwait')::date,e.amount::text,e.kind,'recorded',coalesce(e.invoice_id,''),'حركة عهدة مالية' from private.aqari_petty_cash_entries e
  where e.workspace_id=w and e.created_at>=(first_day::timestamp at time zone 'Asia/Kuwait') and e.created_at<(next_month::timestamp at time zone 'Asia/Kuwait') and (private.aqari_can_property(w,e.property_id,'finance','read') or (e.property_id is null and private.aqari_manager(w)))
 ) x;
 return jsonb_build_object('month',month_key,'properties',base->'properties','period',base->'period','summary',base->'summary','history',base->'history','history_truncated',jsonb_array_length(base->'history')>=100,'entries',entries,'scope','scoped_sources_not_consolidated_profit');
end $$;
revoke all on function private.aqari_financial_archive(uuid,text) from public,anon,authenticated;
grant execute on function private.aqari_financial_archive(uuid,text) to authenticated;
create function public.aqari_financial_archive(p_workspace_id uuid,p_month text) returns jsonb
language sql stable security invoker set search_path='' as $$select private.aqari_financial_archive(p_workspace_id,p_month)$$;
revoke all on function public.aqari_financial_archive(uuid,text) from public,anon,authenticated;
grant execute on function public.aqari_financial_archive(uuid,text) to authenticated;

-- Source: staging-database/sql/official-document-account-statement.sql
-- Authoritative per-contract statement. No credentials or production seed data.

create or replace function private.aqari_official_statement(w uuid,lid uuid,from_date date,to_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases;opening numeric;charges numeric;payments numeric;credits numeric;finish date;
begin
 if auth.uid() is null or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found or l.status not in ('signed','expired') or l.start_date is null or l.end_date is null or l.monthly_rent is null then raise exception 'DOCUMENT_ACTIVE_LEASE_REQUIRED' using errcode='23514';end if;
 if from_date is null or to_date is null or from_date>to_date or from_date<l.start_date or to_date>(now() at time zone 'Asia/Kuwait')::date or to_date-l.start_date>36600 then raise exception 'INVALID_DOCUMENT_RANGE' using errcode='23514';end if;
 -- An opening entry needs an explicit reconciled cut-over; adding historical rent again would double count.
 if exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.tenant_id=l.tenant_id
  and e.kind in ('opening_credit','opening_debit','opening_balance') and e.occurred_on<=to_date) then raise exception 'DOCUMENT_OPENING_RECONCILIATION_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.tenant_id=l.tenant_id and e.lease_id is null
  and e.direction='debit' and e.occurred_on<=to_date) then raise exception 'DOCUMENT_UNALLOCATED_DEBT_REVIEW_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from private.aqari_commercial_terms c where c.workspace_id=w and c.lease_id=lid and (c.sales_percentage>0 or c.grace_days>0 or c.cam_amount>0)) then
  raise exception 'DOCUMENT_COMMERCIAL_RECONCILIATION_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from private.aqari_tenant_ledger_entries e join private.aqari_credit_allocations a on a.workspace_id=e.workspace_id and a.credit_entry_id=e.id
  where e.workspace_id=w and e.lease_id=lid and a.lease_id<>lid) then raise exception 'DOCUMENT_CREDIT_TRANSFER_REVIEW_REQUIRED' using errcode='23514';end if;
 finish:=least(l.end_date,coalesce(l.vacated_on,l.end_date),to_date);
 with entries as (
  select greatest(p::date,l.start_date) on_date,'charge' stream,
   case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end amount
   from generate_series(date_trunc('month',l.start_date),date_trunc('month',finish),interval '1 month')p
  union all select p.paid_at,'payment',p.amount from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=lid and p.paid_at<=to_date
   and p.status in ('paid','partial','مدفوع','جزئي') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  union all select a.occurred_on,case a.direction when 'debit' then 'charge' else 'credit' end,a.amount from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.occurred_on<=to_date
  union all select e.occurred_on,case e.direction when 'debit' then 'charge' else 'credit' end,e.amount from private.aqari_tenant_ledger_entries e
   where e.workspace_id=w and e.lease_id=lid and e.occurred_on<=to_date and e.kind<>'receipt_cancellation'
  union all select a.period,'credit',a.amount from private.aqari_credit_allocations a join private.aqari_tenant_ledger_entries e on e.workspace_id=w and e.id=a.credit_entry_id
   where a.workspace_id=w and a.lease_id=lid and e.lease_id is null and a.period<=to_date
 )select coalesce(sum(case when stream='charge' then amount else -amount end)filter(where on_date<from_date),0),
  coalesce(sum(amount)filter(where stream='charge' and on_date between from_date and to_date),0),
  coalesce(sum(amount)filter(where stream='payment' and on_date between from_date and to_date),0),
  coalesce(sum(amount)filter(where stream='credit' and on_date between from_date and to_date),0)
  into opening,charges,payments,credits from entries;
 return jsonb_build_object('fromDate',from_date::text,'toDate',to_date::text,'openingBalance',opening::numeric(18,3)::text,'charges',charges::numeric(18,3)::text,
  'payments',payments::numeric(18,3)::text,'credits',credits::numeric(18,3)::text,'closingBalance',(opening+charges-payments-credits)::numeric(18,3)::text);
end $$;
revoke all on function private.aqari_official_statement(uuid,uuid,date,date) from public,anon,authenticated;

-- Source: staging-database/sql/official-document-template-validation.sql
-- Generated by scripts/build-official-form-sql.mjs. Review/apply in the isolated target only.

create or replace function private.aqari_official_template(k text) returns jsonb
language sql immutable security invoker set search_path='' as $function$
 select $catalog${"rent_receipt":{"title":"وصل إيجار","prefix":"RENT","required":["documentNo","issuedAt","tenantName","propertyName","unitNo","contractNo","period","amount","paymentMethod","paymentReference","collectorName"],"body":"نشهد باستلام مبلغ {{amount}} د.ك من السيد/السيدة {{tenantName}} عن إيجار الوحدة {{unitNo}} في {{propertyName}} عن الفترة {{period}}، بموجب العقد رقم {{contractNo}} وطريقة السداد {{paymentMethod}} والمرجع {{paymentReference}}.","immutableAfterIssue":true,"version":1},"deposit_receipt":{"title":"وصل تأمين","prefix":"DEPOSIT","required":["documentNo","issuedAt","tenantName","propertyName","unitNo","contractNo","amount","paymentMethod","collectorName"],"body":"نشهد باستلام مبلغ {{amount}} د.ك كتأمين مستقل عن الأجرة للوحدة {{unitNo}} في {{propertyName}}، مرتبطاً بالعقد رقم {{contractNo}}.","immutableAfterIssue":true,"version":1},"deposit_refund":{"title":"سند رد تأمين","prefix":"DEP-REF","required":["documentNo","issuedAt","tenantName","contractNo","amount","reason","approvedBy"],"body":"تم رد مبلغ التأمين وقدره {{amount}} د.ك إلى {{tenantName}} عن العقد رقم {{contractNo}}، بعد اعتماد التسوية، وسبب الحركة: {{reason}}.","immutableAfterIssue":true,"version":1},"tenant_statement":{"title":"كشف حساب مستأجر","prefix":"STMT","required":["documentNo","issuedAt","tenantName","contractNo","fromDate","toDate","openingBalance","charges","payments","credits","closingBalance"],"body":"كشف حساب للفترة من {{fromDate}} إلى {{toDate}}. الرصيد الافتتاحي {{openingBalance}} د.ك، المطلوب {{charges}} د.ك، المدفوع {{payments}} د.ك، والتسويات الدائنة {{credits}} د.ك، والمتبقي {{closingBalance}} د.ك.","immutableAfterIssue":true,"version":2},"debt_notice":{"title":"إشعار مديونية","prefix":"DEBT","required":["documentNo","issuedAt","tenantName","contractNo","dueAmount","dueDate","graceDeadline"],"body":"يرجى سداد المبلغ المستحق وقدره {{dueAmount}} د.ك عن العقد رقم {{contractNo}}، المستحق بتاريخ {{dueDate}}، في موعد أقصاه {{graceDeadline}}. هذا الإشعار مبني على الرصيد الفعلي وقت الإصدار.","immutableAfterIssue":true,"version":1},"renewal_notice":{"title":"إشعار تجديد عقد","prefix":"RENEW","required":["documentNo","issuedAt","tenantName","contractNo","currentEndDate","responseDeadline"],"body":"نفيدكم بقرب انتهاء العقد رقم {{contractNo}} بتاريخ {{currentEndDate}}. يرجى تسجيل قرار التجديد قبل {{responseDeadline}}، ولا يعد هذا الإشعار عقداً جديداً.","immutableAfterIssue":true,"version":1},"nonrenewal_notice":{"title":"إشعار عدم تجديد","prefix":"NONRENEW","required":["documentNo","issuedAt","tenantName","contractNo","currentEndDate","vacateDate"],"body":"نفيدكم بعدم تجديد العقد رقم {{contractNo}} بعد انتهائه بتاريخ {{currentEndDate}}، ويرجى استكمال إجراءات التسليم والإخلاء في موعد {{vacateDate}} وفق التسوية النهائية.","immutableAfterIssue":true,"version":1},"receipt_voucher":{"title":"سند قبض","prefix":"RV","required":["documentNo","issuedAt","receivedFrom","amount","reason","paymentMethod","reference","collectorName"],"body":"استلمنا من {{receivedFrom}} مبلغاً وقدره {{amount}} د.ك، وذلك عن {{reason}}، بطريقة {{paymentMethod}}، مرجع {{reference}}.","immutableAfterIssue":true,"version":1},"payment_voucher":{"title":"سند صرف","prefix":"PV","required":["documentNo","issuedAt","paidTo","amount","reason","expenseCategory","approvedBy"],"body":"صُرف إلى {{paidTo}} مبلغ وقدره {{amount}} د.ك عن {{reason}}، تحت بند {{expenseCategory}}، بعد اعتماد {{approvedBy}}.","immutableAfterIssue":true,"version":1},"work_order":{"title":"أمر شغل","prefix":"WO","required":["documentNo","issuedAt","propertyName","vendorName","description","approvedAmount","approvedBy"],"body":"يُكلف المقاول {{vendorName}} بتنفيذ الأعمال التالية في {{propertyName}}: {{description}}. الحد المالي المعتمد {{approvedAmount}} د.ك، ولا تعتمد الفاتورة قبل إثبات الإنجاز.","immutableAfterIssue":true,"version":1},"expense_approval":{"title":"اعتماد مصروف","prefix":"EXP","required":["documentNo","issuedAt","propertyName","expenseCategory","amount","invoiceReference","approvedBy"],"body":"اعتمد المصروف بمبلغ {{amount}} د.ك على العقار {{propertyName}}، بند {{expenseCategory}}، فاتورة/مرجع {{invoiceReference}}، واعتماد {{approvedBy}}.","immutableAfterIssue":true,"version":1},"key_handover":{"title":"محضر تسليم واستلام مفاتيح","prefix":"KEYS","required":["documentNo","issuedAt","tenantName","propertyName","unitNo","keyCount","deliveredBy","receivedBy"],"body":"تم تسليم واستلام عدد {{keyCount}} مفتاحاً للوحدة {{unitNo}} في {{propertyName}} بين {{deliveredBy}} و{{receivedBy}}.","immutableAfterIssue":true,"version":1},"damage_report":{"title":"محضر أضرار","prefix":"DMG","required":["documentNo","issuedAt","tenantName","propertyName","unitNo","inspectionReference","damageSummary","estimatedAmount"],"body":"بناء على المعاينة رقم {{inspectionReference}}، سُجلت الأضرار التالية في الوحدة {{unitNo}}: {{damageSummary}}. التقدير الأولي {{estimatedAmount}} د.ك ولا يصبح ذمة نهائية قبل الاعتماد.","immutableAfterIssue":true,"version":1},"final_settlement":{"title":"التسوية النهائية","prefix":"SETTLE","required":["documentNo","issuedAt","tenantName","contractNo","rentBalance","damageBalance","utilityBalance","legalBalance","depositBalance","netBalance","approvedBy"],"body":"التسوية النهائية للعقد رقم {{contractNo}}: إيجار {{rentBalance}} د.ك، أضرار {{damageBalance}} د.ك، خدمات {{utilityBalance}} د.ك، قضائي {{legalBalance}} د.ك، تأمين {{depositBalance}} د.ك، والصافي {{netBalance}} د.ك.","immutableAfterIssue":true,"version":1},"clearance":{"title":"براءة ذمة","prefix":"CLEAR","required":["documentNo","issuedAt","tenantName","contractNo","settlementReference","approvedBy"],"body":"تشهد الإدارة بإقفال الالتزامات المعتمدة للعقد رقم {{contractNo}} وفق التسوية النهائية رقم {{settlementReference}}. لا تصدر هذه الوثيقة عند وجود التزام مفتوح إلا باستثناء رسمي محفوظ.","immutableAfterIssue":true,"version":1},"daily_collection":{"title":"كشف التحصيل اليومي","prefix":"DAILY","required":["documentNo","issuedAt","collectionDate","propertyName","receiptCount","totalAmount","preparedBy"],"body":"كشف تحصيل العقار {{propertyName}} ليوم {{collectionDate}}: عدد الوصولات {{receiptCount}}، وإجمالي التحصيل الفعلي {{totalAmount}} د.ك، أعده {{preparedBy}}.","immutableAfterIssue":true,"version":1}}$catalog$::jsonb->k
$function$;
revoke all on function private.aqari_official_template(text) from public,anon,authenticated;

create or replace function private.aqari_official_canonical(j jsonb) returns text
language plpgsql immutable security invoker set search_path='' as $function$
begin
 if jsonb_typeof(j)='object' then return '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||private.aqari_official_canonical(value),',' order by key collate "C") from jsonb_each(j)),'')||'}';
 elsif jsonb_typeof(j)='array' then return '['||coalesce((select string_agg(private.aqari_official_canonical(value),',' order by n) from jsonb_array_elements(j) with ordinality a(value,n)),'')||']';
 else return j::text;end if;
end $function$;
revoke all on function private.aqari_official_canonical(jsonb) from public,anon,authenticated;

create or replace function private.aqari_official_validate(k text,doc_no text,v integer,title text,body text,payload jsonb,hash text) returns void
language plpgsql immutable security invoker set search_path='' as $function$
declare spec jsonb:=private.aqari_official_template(k);fields jsonb:=$fields${"documentNo":{"label":"رقم المستند","type":"text","multiline":false,"maxLength":5000},"issuedAt":{"label":"تاريخ الإصدار","type":"date","multiline":false,"maxLength":5000},"tenantName":{"label":"اسم المستأجر","type":"text","multiline":false,"maxLength":5000},"propertyName":{"label":"اسم العقار","type":"text","multiline":false,"maxLength":5000},"unitNo":{"label":"رقم الوحدة","type":"text","multiline":false,"maxLength":5000},"contractNo":{"label":"رقم العقد","type":"text","multiline":false,"maxLength":5000},"period":{"label":"فترة الإيجار","type":"month","multiline":false,"maxLength":5000},"amount":{"label":"المبلغ (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"paymentMethod":{"label":"طريقة الدفع","type":"text","multiline":false,"maxLength":5000},"paymentReference":{"label":"مرجع الدفع","type":"text","multiline":false,"maxLength":5000},"collectorName":{"label":"اسم المحصل","type":"text","multiline":false,"maxLength":5000},"reason":{"label":"سبب الحركة","type":"text","multiline":true,"maxLength":5000},"approvedBy":{"label":"اسم المعتمد","type":"text","multiline":false,"maxLength":5000},"fromDate":{"label":"من تاريخ","type":"date","multiline":false,"maxLength":5000},"toDate":{"label":"إلى تاريخ","type":"date","multiline":false,"maxLength":5000},"openingBalance":{"label":"الرصيد الافتتاحي (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"charges":{"label":"المطلوب (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"payments":{"label":"المدفوع (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"credits":{"label":"التسويات الدائنة (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"closingBalance":{"label":"الرصيد الختامي (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"dueAmount":{"label":"المستحق الفعلي (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"dueDate":{"label":"تاريخ الاستحقاق","type":"date","multiline":false,"maxLength":5000},"graceDeadline":{"label":"آخر مهلة للسداد","type":"date","multiline":false,"maxLength":5000},"currentEndDate":{"label":"تاريخ انتهاء العقد","type":"date","multiline":false,"maxLength":5000},"responseDeadline":{"label":"آخر موعد للرد","type":"date","multiline":false,"maxLength":5000},"vacateDate":{"label":"تاريخ الإخلاء","type":"date","multiline":false,"maxLength":5000},"receivedFrom":{"label":"استلمنا من","type":"text","multiline":false,"maxLength":5000},"reference":{"label":"المرجع","type":"text","multiline":false,"maxLength":5000},"paidTo":{"label":"المستفيد من الصرف","type":"text","multiline":false,"maxLength":5000},"expenseCategory":{"label":"بند المصروف","type":"text","multiline":false,"maxLength":5000},"vendorName":{"label":"اسم المقاول","type":"text","multiline":false,"maxLength":5000},"description":{"label":"وصف الأعمال","type":"text","multiline":true,"maxLength":5000},"approvedAmount":{"label":"المبلغ المعتمد (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"invoiceReference":{"label":"مرجع الفاتورة","type":"text","multiline":false,"maxLength":5000},"keyCount":{"label":"عدد المفاتيح","type":"decimal","multiline":false,"maxLength":5000},"deliveredBy":{"label":"اسم المسلّم","type":"text","multiline":false,"maxLength":5000},"receivedBy":{"label":"اسم المستلم","type":"text","multiline":false,"maxLength":5000},"inspectionReference":{"label":"مرجع المعاينة","type":"text","multiline":false,"maxLength":5000},"damageSummary":{"label":"وصف الأضرار","type":"text","multiline":true,"maxLength":5000},"estimatedAmount":{"label":"التكلفة التقديرية (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"rentBalance":{"label":"رصيد الإيجار (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"damageBalance":{"label":"رصيد الأضرار (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"utilityBalance":{"label":"رصيد الخدمات (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"legalBalance":{"label":"رصيد القضايا (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"depositBalance":{"label":"رصيد التأمين (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"netBalance":{"label":"صافي التسوية (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"settlementReference":{"label":"مرجع التسوية","type":"text","multiline":false,"maxLength":5000},"collectionDate":{"label":"تاريخ التحصيل","type":"date","multiline":false,"maxLength":5000},"receiptCount":{"label":"عدد الوصولات","type":"decimal","multiline":false,"maxLength":5000},"totalAmount":{"label":"إجمالي التحصيل (د.ك)","type":"decimal","multiline":false,"maxLength":5000},"preparedBy":{"label":"اسم معدّ الكشف","type":"text","multiline":false,"maxLength":5000}}$fields$::jsonb;
 key text;value text;field_type text;rendered text;snapshot jsonb;actual_hash text;test_date date;
begin
 if spec is null or v is distinct from (spec->>'version')::integer or title is distinct from spec->>'title'
  or jsonb_typeof(payload) is distinct from 'object' or payload->>'documentNo' is distinct from doc_no then
  raise exception 'INVALID_DOCUMENT_TEMPLATE' using errcode='23514';end if;
 for key in select jsonb_array_elements_text(spec->'required') loop
  if jsonb_typeof(payload->key) is distinct from 'string' then raise exception 'INVALID_DOCUMENT_FIELD: %',key using errcode='23514';end if;
  value:=payload->>key;field_type:=fields#>>array[key,'type'];
  if value is distinct from btrim(value) or length(value)=0 or length(value)>5000 then raise exception 'INVALID_DOCUMENT_FIELD: %',key using errcode='23514';end if;
  if field_type='date' then
   if value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_DOCUMENT_DATE' using errcode='23514';end if;
   begin test_date:=value::date;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'INVALID_DOCUMENT_DATE' using errcode='23514';end;
  elsif field_type='month' and value !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_DOCUMENT_PERIOD' using errcode='23514';
  elsif field_type='decimal' then
   if key in ('keyCount','receiptCount') then
    if value !~ '^\d{1,7}$' then raise exception 'INVALID_DOCUMENT_COUNT' using errcode='23514';end if;
   elsif value !~ (case when key in ('openingBalance','closingBalance','netBalance') then '^-?\d{1,12}(\.\d{1,3})?$' else '^\d{1,12}(\.\d{1,3})?$' end) then raise exception 'INVALID_DOCUMENT_AMOUNT' using errcode='23514';end if;
  end if;
 end loop;
 if (payload->>'fromDate')::date>(payload->>'toDate')::date or (payload->>'dueDate')::date>(payload->>'graceDeadline')::date
  or (k='debt_notice' and (payload->>'dueAmount')::numeric<=0) then raise exception 'INVALID_DOCUMENT_RANGE' using errcode='23514';end if;
 rendered:=spec->>'body';for key in select jsonb_array_elements_text(spec->'required') loop rendered:=replace(rendered,'{{'||key||'}}',payload->>key);end loop;
 if body is distinct from rendered then raise exception 'DOCUMENT_BODY_MISMATCH' using errcode='23514';end if;
 snapshot:=jsonb_build_object('kind',k,'title',title,'documentNo',doc_no,'version',v,'issuedAt',payload->>'issuedAt','body',body,'payload',payload);
 actual_hash:=encode(sha256(convert_to(private.aqari_official_canonical(snapshot),'UTF8')),'hex');
 if hash is distinct from actual_hash then raise exception 'DOCUMENT_HASH_MISMATCH' using errcode='23514';end if;
end $function$;
revoke all on function private.aqari_official_validate(text,text,integer,text,text,jsonb,text) from public,anon,authenticated;

-- Source: staging-database/sql/official-document-source-binding.sql
-- Additive/function-only development upgrade. Existing issued versions are retained.

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
   'collectorName',coalesce(nullif(pay.receipt->>'collectorName',''),nullif(pay.receipt->>'collector','')),
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


-- Source: staging-database/sql/official-document-access-hardening.sql
-- Function-only scope upgrade. Requires official-document-source-binding.sql. Preserves the archive.

create or replace function public.aqari_official_document_register(
 p_workspace_id uuid,p_action text,p_data jsonb default '{}'
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=p_data; series private.aqari_official_document_series;
 version_row private.aqari_official_document_versions; actor text; next_version integer; doc_no text;
 ident uuid; reason_text text; supplied_hash text;
begin
 if auth.uid() is null or not private.aqari_official_document_access(w,p_action<>'list' and p_action<>'get') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if p_action not in ('list','get','issue','supersede','void') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>131072 then
  raise exception 'INVALID_DOCUMENT_REQUEST' using errcode='22023';
 end if;
 if p_action not in ('list','get') then
  perform private.aqari_require_sensitive_aal2(w);
  perform 1 from public.aqari_app_state where workspace_id=w for update;
  if not found then raise exception 'DOCUMENT_WORKSPACE_UNAVAILABLE' using errcode='23514';end if;
 end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);

 if p_action='list' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'kind',s.kind,'document_no',s.document_no,'entity_type',s.entity_type,'entity_id',s.entity_id,
   'status',s.status,'current_version',s.current_version,'created_at',s.created_at,'void_reason',s.void_reason,
   'version',jsonb_build_object('id',v.id,'title',v.title,'content_sha256',v.content_sha256,'issued_at',v.issued_at,'issued_by_name',v.issued_by_name)
  ) order by s.created_at desc) from private.aqari_official_document_series s join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id and v.version=s.current_version where s.workspace_id=w and private.aqari_official_entity_scope(w,s.entity_type,s.entity_id,'read')),'[]'::jsonb));
 end if;

 if p_action='get' then
  ident:=(d->>'id')::uuid;
  return coalesce((select jsonb_build_object('series',to_jsonb(s),'versions',coalesce(jsonb_agg(to_jsonb(v) order by v.version),'[]'::jsonb))
   from private.aqari_official_document_series s join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id
   where s.workspace_id=w and s.id=ident and private.aqari_official_entity_scope(w,s.entity_type,s.entity_id,'read') group by s.id),'{}'::jsonb);
 end if;

 reason_text:=btrim(coalesce(d->>'reason',''));
 if length(reason_text)<3 then raise exception 'DOCUMENT_REASON_REQUIRED' using errcode='23514'; end if;

 if p_action='issue' then
  if not private.aqari_official_entity_scope(w,d->>'entity_type',(d->>'entity_id')::uuid,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
  perform 1 from public.aqari_workspaces where id=w for update;
  ident:=(d->>'id')::uuid; doc_no:=btrim(coalesce(d->>'document_no',''));
  if doc_no='' then doc_no:='AQ-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_official_document_no_seq')::text,8,'0'); end if;
  supplied_hash:=lower(coalesce(d->>'content_sha256',''));
  if supplied_hash!~'^[a-f0-9]{64}$' or length(btrim(coalesce(d->>'kind','')))<2 or length(btrim(coalesce(d->>'title','')))<2 or length(btrim(coalesce(d->>'body','')))<5 then raise exception 'INVALID_DOCUMENT_SNAPSHOT' using errcode='23514'; end if;
  select * into series from private.aqari_official_document_series where workspace_id=w and id=ident;
  if found then
   select * into strict version_row from private.aqari_official_document_versions where workspace_id=w and series_id=ident and version=1;
   if series.kind=d->>'kind' and series.entity_type=d->>'entity_type' and series.entity_id=(d->>'entity_id')::uuid and version_row.content_sha256=supplied_hash
    and version_row.title is not distinct from d->>'title'
    and version_row.body is not distinct from d->>'body'
    and version_row.payload is not distinct from d->'payload'
    and version_row.template_version=coalesce((d->>'template_version')::integer,1)
    and series.document_no=coalesce(nullif(btrim(d->>'document_no'),''),series.document_no) then
    return jsonb_build_object('series',to_jsonb(series),'version',to_jsonb(version_row),'replayed',true);
   end if;
   raise exception 'DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode='23505';
  end if;
  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,created_by)
  values(ident,w,d->>'kind',doc_no,d->>'entity_type',(d->>'entity_id')::uuid,auth.uid()) returning * into series;
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
  values((d->>'version_id')::uuid,w,ident,1,coalesce((d->>'template_version')::integer,1),d->>'title',d->>'body',d->'payload',supplied_hash,auth.uid(),actor) returning * into version_row;
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
  values((d->>'event_id')::uuid,w,ident,'issue',reason_text,auth.uid(),jsonb_build_object('version',1,'hash',supplied_hash));
  return jsonb_build_object('series',to_jsonb(series),'version',to_jsonb(version_row));
 end if;

 ident:=(d->>'id')::uuid;
 select * into series from private.aqari_official_document_series where workspace_id=w and id=ident for update;
 if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
 if not private.aqari_official_entity_scope(w,series.entity_type,series.entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 if series.status<>'issued' then raise exception 'DOCUMENT_ALREADY_VOID' using errcode='23514'; end if;

 if p_action='supersede' then
  if (d->>'expected_version')::integer is distinct from series.current_version then raise exception 'STALE_DOCUMENT_VERSION' using errcode='40001'; end if;
  next_version:=series.current_version+1; supplied_hash:=lower(coalesce(d->>'content_sha256',''));
  if supplied_hash!~'^[a-f0-9]{64}$' or length(btrim(coalesce(d->>'title','')))<2 or length(btrim(coalesce(d->>'body','')))<5 then raise exception 'INVALID_DOCUMENT_SNAPSHOT' using errcode='23514'; end if;
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,supersedes_version,issued_by,issued_by_name)
  values((d->>'version_id')::uuid,w,ident,next_version,coalesce((d->>'template_version')::integer,1),d->>'title',d->>'body',d->'payload',supplied_hash,series.current_version,auth.uid(),actor) returning * into version_row;
  update private.aqari_official_document_series set current_version=next_version where workspace_id=w and id=ident returning * into series;
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
  values((d->>'event_id')::uuid,w,ident,'supersede',reason_text,auth.uid(),jsonb_build_object('version',next_version,'hash',supplied_hash));
  return jsonb_build_object('series',to_jsonb(series),'version',to_jsonb(version_row));
 end if;

 update private.aqari_official_document_series set status='void',voided_by=auth.uid(),voided_at=now(),void_reason=reason_text where workspace_id=w and id=ident returning * into series;
 insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
 values((d->>'event_id')::uuid,w,ident,'void',reason_text,auth.uid(),jsonb_build_object('version',series.current_version));
 return jsonb_build_object('series',to_jsonb(series));
end $$;


-- Source: staging-database/sql/official-document-pdf-archive.sql
-- Original PDF bytes, append-only and bound to an immutable document version.
-- Apply after official-document-access-hardening.sql. No hosted target is selected here.

create table private.aqari_official_pdf_artifacts (
 workspace_id uuid not null,
 series_id uuid not null,
 version integer not null,
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 pdf_bytes bytea not null check(octet_length(pdf_bytes) between 8 and 2097152),
 pdf_sha256 text not null check(pdf_sha256 = encode(sha256(pdf_bytes),'hex')),
 renderer_version text not null check(length(renderer_version) between 1 and 100),
 archived_by uuid not null,
 archived_at timestamptz not null default now(),
 primary key(workspace_id,series_id,version),
 foreign key(workspace_id,series_id,version) references private.aqari_official_document_versions(workspace_id,series_id,version)
);
alter table private.aqari_official_pdf_artifacts enable row level security;
revoke all on private.aqari_official_pdf_artifacts from public,anon,authenticated,service_role;
create trigger aqari_official_pdf_immutable before update or delete on private.aqari_official_pdf_artifacts
 for each row execute function private.aqari_reject_immutable_change();

create function public.aqari_official_pdf_get(p_workspace_id uuid,p_document_id uuid,p_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare doc jsonb; artifact private.aqari_official_pdf_artifacts;
begin
 doc:=public.aqari_official_document_register(p_workspace_id,'get',jsonb_build_object('id',p_document_id));
 if doc='{}'::jsonb then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_version is null or not exists(select 1 from jsonb_array_elements(doc->'versions') v where (v->>'version')::integer=p_version)then
  raise exception 'DOCUMENT_VERSION_NOT_FOUND' using errcode='P0002';
 end if;
 select * into artifact from private.aqari_official_pdf_artifacts where workspace_id=p_workspace_id and series_id=p_document_id and version=p_version;
 if not found then return '{}'::jsonb;end if;
 return (to_jsonb(artifact)-'pdf_bytes')||jsonb_build_object('pdf_base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),'document_status',doc#>>'{series,status}');
end $$;
revoke all on function public.aqari_official_pdf_get(uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.aqari_official_pdf_get(uuid,uuid,integer) to authenticated;

-- Browser JWTs cannot supply arbitrary PDF bytes. Only the trusted backend can
-- commit output, and it must identify the authenticated requester. User scope is
-- checked again in this transaction, not inferred from possession of a service key.
create function public.aqari_official_pdf_commit(
 p_workspace_id uuid,p_document_id uuid,p_version integer,p_actor_id uuid,
 p_snapshot_sha256 text,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
)returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);
 doc jsonb; snapshot jsonb; bytes bytea; existing private.aqari_official_pdf_artifacts;
begin
 if current_setting('role',true) is distinct from 'service_role' or p_actor_id is null then
  raise insufficient_privilege using message='TRUSTED_RENDERER_REQUIRED';
 end if;
 if p_pdf_base64 is null or length(p_pdf_base64)>2796204 or p_pdf_sha256 is null or p_snapshot_sha256 is null
  or p_pdf_sha256!~'^[a-f0-9]{64}$' or p_snapshot_sha256!~'^[a-f0-9]{64}$'
  or p_renderer_version is null or length(p_renderer_version) not between 1 and 100 then
  raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';
 end if;
 -- Lock the series to serialize first writers with corrections and voiding.
 perform 1 from private.aqari_official_document_series where workspace_id=p_workspace_id and id=p_document_id for update;
 perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
 doc:=public.aqari_official_document_register(p_workspace_id,'get',jsonb_build_object('id',p_document_id));
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if doc='{}'::jsonb then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select v into snapshot from jsonb_array_elements(doc->'versions') v where (v->>'version')::integer=p_version;
 if snapshot is null or snapshot->>'content_sha256' is distinct from p_snapshot_sha256 then
  raise exception 'PDF_SNAPSHOT_MISMATCH' using errcode='23514';
 end if;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8')
  or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise exception 'INVALID_PDF_ARCHIVE' using errcode='23514';end if;
 select * into existing from private.aqari_official_pdf_artifacts where workspace_id=p_workspace_id and series_id=p_document_id and version=p_version;
 if found then
  if existing.pdf_sha256<>p_pdf_sha256 or existing.snapshot_sha256<>p_snapshot_sha256 then raise exception 'PDF_ARCHIVE_CONFLICT' using errcode='23505';end if;
  return jsonb_build_object('archived',true,'replayed',true,'pdf_sha256',existing.pdf_sha256);
 end if;
 if doc#>>'{series,status}'<>'issued' then raise exception 'VOID_DOCUMENT_ORIGINAL_UNAVAILABLE' using errcode='23514';end if;
 insert into private.aqari_official_pdf_artifacts(workspace_id,series_id,version,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by)
 values(p_workspace_id,p_document_id,p_version,p_snapshot_sha256,bytes,p_pdf_sha256,p_renderer_version,p_actor_id);
 insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
 values(gen_random_uuid(),p_workspace_id,p_document_id,'pdf_export','حفظ النسخة الأصلية من ملف PDF',p_actor_id,jsonb_build_object('version',p_version,'pdf_sha256',p_pdf_sha256,'snapshot_sha256',p_snapshot_sha256,'renderer',p_renderer_version));
 return jsonb_build_object('archived',true,'replayed',false,'pdf_sha256',p_pdf_sha256);
end $$;
revoke all on function public.aqari_official_pdf_commit(uuid,uuid,integer,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_official_pdf_commit(uuid,uuid,integer,uuid,text,text,text,text) to service_role;

-- Source: staging-database/sql/workspace-feature-discovery.sql
-- Run only in an independently verified development target, after staff-property-scope.sql
-- and financial-register.sql. Does not create accounts, assignments or business records.

create or replace function public.aqari_workspace_access(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;access jsonb:='{}';s text;r text;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 foreach s in array private.aqari_section_keys() loop
  access:=access||jsonb_build_object(s,jsonb_build_object('read',private.aqari_can(p_workspace_id,s,'read'),'write',private.aqari_can(p_workspace_id,s,'write')));
 end loop;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'role',r,
  'sections',coalesce(cfg->'sections','{}'),'permissions',access,'labels',coalesce(cfg->'labels','{}'),
  'features',jsonb_build_object(
   'final_gap_register',r='general_manager' and to_regprocedure('public.aqari_final_gap_register(uuid,text,jsonb)') is not null,
   'official_documents',r='general_manager' and to_regprocedure('public.aqari_official_document_register(uuid,text,jsonb)') is not null and to_regprocedure('public.aqari_official_document_context(uuid,text,uuid,uuid,jsonb)') is not null,
   'external_integrations',r='general_manager' and to_regprocedure('public.aqari_external_integrations(uuid,text,jsonb)') is not null,
   'financial_archive',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_archive(uuid,text)') is not null,
   'compliance_register',r='general_manager' and to_regprocedure('public.aqari_compliance_register(uuid,text,text,jsonb)') is not null,
   'kpi_dashboard',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_kpi_dashboard(uuid,date,date)') is not null,
   'maintenance_plans',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_maintenance_plans(uuid,text,jsonb)') is not null,
   'operations_register',r='general_manager' and to_regprocedure('public.aqari_operations_register(uuid,text,text,jsonb)') is not null,
   'unit_readiness',private.aqari_can(p_workspace_id,'properties','read') and to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null,
   'unit_meter_readings',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_unit_meter_register(uuid,text,jsonb)') is not null,
   'vacating_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_review(uuid,text,jsonb)') is not null,
   'vacating_settlement',private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_settlement(uuid,text,jsonb)') is not null,
   'exit_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and to_regprocedure('public.aqari_exit_review(uuid,text,jsonb)') is not null,
   'staff_access',r='general_manager' and to_regprocedure('public.aqari_staff_access(uuid,text,jsonb)') is not null,
   'financial_register',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_register(uuid,text,jsonb)') is not null,
   'deposit_register',private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_deposit_register(uuid,text,jsonb)') is not null));
end $$;
revoke all on function public.aqari_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.aqari_workspace_access(uuid) to authenticated;

commit;
