-- Verified administrative recording of commercial receipts, never a bank action.
-- Apply after commercial-sales.sql, commercial-sales-vacating-guard.sql and
-- collection-account-management.sql. All amounts are KWD, independent of rent.
begin;
-- An existing rent-payment allocation is a different receipt source. A lease
-- keeps that mode for its entire history, including reversed allocations.
create or replace function private.aqari_commercial_legacy_history(w uuid,lid uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare found_history boolean:=false;begin
 if to_regclass('private.aqari_commercial_payment_allocations') is not null then
  execute 'select exists(select 1 from private.aqari_commercial_payment_allocations where workspace_id=$1 and lease_id=$2)' into found_history using w,lid;
 end if;
 return found_history;
end $$;
revoke all on function private.aqari_commercial_legacy_history(uuid,uuid) from public,anon,authenticated;
create table if not exists private.aqari_commercial_collections(
 id uuid primary key,workspace_id uuid not null,lease_id uuid not null,account_id uuid not null,
 account_snapshot jsonb not null,method text not null check(method in('cash','bank_transfer')),
 occurred_on date not null,amount numeric(15,3) not null check(amount>0),
 reference text not null check(length(btrim(reference)) between 3 and 160),
 source_document_id uuid not null references public.aqari_documents(id),source_checksum text not null check(source_checksum~'^[a-f0-9]{64}$'),
 request_data jsonb not null,recorded_by uuid not null,recorded_at timestamptz not null default now(),
 unique(workspace_id,id),unique(workspace_id,account_id,reference),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,account_id) references private.aqari_collection_accounts(workspace_id,id)
);
create table if not exists private.aqari_commercial_collection_allocations(
 workspace_id uuid not null,collection_id uuid not null,sale_id uuid not null,amount numeric(15,3) not null check(amount>0),
 primary key(workspace_id,collection_id,sale_id),
 foreign key(workspace_id,collection_id) references private.aqari_commercial_collections(workspace_id,id),
 foreign key(workspace_id,sale_id) references private.aqari_commercial_sales(workspace_id,id)
);
create index if not exists aqari_commercial_allocations_sale on private.aqari_commercial_collection_allocations(workspace_id,sale_id);
create index if not exists aqari_commercial_collections_lease_date on private.aqari_commercial_collections(workspace_id,lease_id,occurred_on,id);
create table if not exists private.aqari_commercial_collection_reversals(
 id uuid primary key,workspace_id uuid not null,collection_id uuid not null,amount numeric(15,3) not null check(amount>0),
 occurred_on date not null,reason text not null check(length(btrim(reason)) between 5 and 500),
 request_data jsonb not null,recorded_by uuid not null,recorded_at timestamptz not null default now(),
 unique(workspace_id,id),unique(workspace_id,collection_id),
 foreign key(workspace_id,collection_id) references private.aqari_commercial_collections(workspace_id,id)
);
do $$declare n text;begin
 foreach n in array array['aqari_commercial_collections','aqari_commercial_collection_allocations','aqari_commercial_collection_reversals'] loop
  execute format('alter table private.%I enable row level security',n);
  execute format('revoke all on private.%I from public,anon,authenticated',n);
  execute format('drop trigger if exists %I on private.%I',n||'_immutable',n);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.aqari_reject_immutable_change()',n||'_immutable',n);
 end loop;
end $$;

-- Internal integrity check. No role can execute this helper directly. Its
-- public read/write callers check identity and property scope before entering.
create or replace function private.aqari_assert_commercial_collections(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if private.aqari_commercial_legacy_history(w,lid) then raise check_violation using message='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED';end if;
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_collections c
  where c.workspace_id=w and c.lease_id=lid and (
   c.amount<>(select coalesce(sum(a.amount),0) from private.aqari_commercial_collection_allocations a where a.workspace_id=w and a.collection_id=c.id)
   or c.account_snapshot->>'id' is distinct from c.account_id::text
   or c.account_snapshot->>'currency' is distinct from 'KWD'
   or c.account_snapshot->>'property_id' is distinct from (select u.property_id::text from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=lid)
   or c.account_snapshot->>'kind' is distinct from case c.method when 'cash' then 'cashbox' else 'bank' end
   or exists(select 1 from private.aqari_commercial_collection_reversals r where r.workspace_id=w and r.collection_id=c.id and (r.amount<>c.amount or r.occurred_on<c.occurred_on))
  )) or exists(
   select 1 from private.aqari_commercial_collection_allocations a
   join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id
   join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id
   left join private.aqari_commercial_sales_reversals sr on sr.workspace_id=s.workspace_id and sr.sale_id=s.id
   left join private.aqari_commercial_collection_reversals cr on cr.workspace_id=c.workspace_id and cr.collection_id=c.id
   where a.workspace_id=w and (c.lease_id=lid or s.lease_id=lid) and (
    c.lease_id<>s.lease_id or a.amount>s.amount or c.occurred_on<s.period_end
    or (sr.id is not null and (cr.id is null or cr.occurred_on>sr.occurred_on))
   )
  ) or exists(
   select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and
   s.amount<(select coalesce(sum(a.amount),0) from private.aqari_commercial_collection_allocations a
    where a.workspace_id=w and a.sale_id=s.id and not exists(select 1 from private.aqari_commercial_collection_reversals r where r.workspace_id=w and r.collection_id=a.collection_id))
  ) or exists(
   -- A later reversal must not make a backdated replacement receipt appear
   -- valid while it overpays the original charge at an earlier cutoff date.
   select 1 from (
    select e.sale_id,e.on_date,sum(sum(e.delta)) over(partition by e.sale_id order by e.on_date) paid
    from (
     select a.sale_id,c.occurred_on on_date,a.amount delta from private.aqari_commercial_collection_allocations a
      join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id where c.workspace_id=w and c.lease_id=lid
     union all
     select a.sale_id,r.occurred_on,-a.amount from private.aqari_commercial_collection_allocations a
      join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id
      join private.aqari_commercial_collection_reversals r on r.workspace_id=c.workspace_id and r.collection_id=c.id where c.workspace_id=w and c.lease_id=lid
    )e group by e.sale_id,e.on_date
   )history join private.aqari_commercial_sales s on s.workspace_id=w and s.id=history.sale_id where history.paid<0 or history.paid>s.amount
  ) then raise check_violation using message='COMMERCIAL_COLLECTION_LEDGER_MISMATCH';end if;
end $$;
revoke all on function private.aqari_assert_commercial_collections(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_commercial_balance(w uuid,lid uuid,as_of date) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare charges numeric:=0;charge_reversals numeric:=0;receipts numeric:=0;receipt_reversals numeric:=0;rows jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') or not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if as_of is null or as_of>(now() at time zone 'Asia/Kuwait')::date then raise invalid_parameter_value using message='INVALID_COMMERCIAL_AS_OF';end if;
 -- Keep the totals and event lines on one serialized financial history even
 -- when this helper is called independently by another statement/report RPC.
 perform 1 from public.aqari_app_state where workspace_id=w for share;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_assert_commercial_collections(w,lid);
 select coalesce(sum(s.amount),0) into charges from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end<=as_of;
 select coalesce(sum(s.amount),0) into charge_reversals from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.occurred_on<=as_of;
 select coalesce(sum(c.amount),0) into receipts from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid and c.occurred_on<=as_of;
 select coalesce(sum(r.amount),0) into receipt_reversals from private.aqari_commercial_collection_reversals r join private.aqari_commercial_collections c on c.workspace_id=r.workspace_id and c.id=r.collection_id where r.workspace_id=w and c.lease_id=lid and r.occurred_on<=as_of;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'source_type',x.source_type,'occurred_on',x.occurred_on,'amount',to_char(x.amount,'FM999999999999990.000'),'direction',x.direction,'sale_id',x.sale_id,'collection_id',x.collection_id,'reference',x.reference) order by x.occurred_on,x.source_type,x.id),'[]') into rows from (
  select s.id,'commercial_sales'::text source_type,s.period_end occurred_on,s.amount,'debit'::text direction,s.id sale_id,null::uuid collection_id,s.source_reference reference from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end<=as_of
  union all select r.id,'commercial_sales_reversal',r.occurred_on,s.amount,'credit',s.id,null,r.reason from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.occurred_on<=as_of
  union all select c.id,'commercial_collection',c.occurred_on,c.amount,'credit',null,c.id,c.reference from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid and c.occurred_on<=as_of
  union all select r.id,'commercial_collection_reversal',r.occurred_on,r.amount,'debit',null,c.id,r.reason from private.aqari_commercial_collection_reversals r join private.aqari_commercial_collections c on c.workspace_id=r.workspace_id and c.id=r.collection_id where r.workspace_id=w and c.lease_id=lid and r.occurred_on<=as_of
 )x;
 return jsonb_build_object('lease_id',lid,'as_of',as_of,'charge_total',to_char(charges,'FM999999999999990.000'),'reversed_charge_total',to_char(charge_reversals,'FM999999999999990.000'),'collected_total',to_char(receipts,'FM999999999999990.000'),'collection_reversed_total',to_char(receipt_reversals,'FM999999999999990.000'),'balance',to_char(charges-charge_reversals-receipts+receipt_reversals,'FM999999999999990.000'),'lines',rows);
end $$;
revoke all on function private.aqari_commercial_balance(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.aqari_commercial_collection_json(w uuid,ident uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('collection',to_jsonb(c)||jsonb_build_object('amount',to_char(c.amount,'FM999999999999990.000')),
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('sale_id',a.sale_id,'amount',to_char(a.amount,'FM999999999999990.000')) order by a.sale_id),'[]') from private.aqari_commercial_collection_allocations a where a.workspace_id=w and a.collection_id=c.id),
  'reversal',(select to_jsonb(r)||jsonb_build_object('amount',to_char(r.amount,'FM999999999999990.000')) from private.aqari_commercial_collection_reversals r where r.workspace_id=w and r.collection_id=c.id))
 from private.aqari_commercial_collections c where c.workspace_id=w and c.id=ident
$$;
revoke all on function private.aqari_commercial_collection_json(uuid,uuid) from public,anon,authenticated;

-- Deferred constraints reject a partial header, changed source or over-allocation
-- even if a future trusted writer forgets the explicit RPC verification.
create or replace function private.aqari_commercial_collection_integrity_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare lid uuid;begin
 if tg_table_name='aqari_commercial_collections' then lid:=new.lease_id;
 else select c.lease_id into strict lid from private.aqari_commercial_collections c where c.workspace_id=new.workspace_id and c.id=new.collection_id;end if;
 perform private.aqari_assert_commercial_collections(new.workspace_id,lid);return new;
end $$;
revoke all on function private.aqari_commercial_collection_integrity_guard() from public,anon,authenticated;
do $$declare n text;begin
 foreach n in array array['aqari_commercial_collections','aqari_commercial_collection_allocations','aqari_commercial_collection_reversals'] loop
  execute format('drop trigger if exists %I on private.%I',n||'_integrity',n);
  execute format('create constraint trigger %I after insert on private.%I deferrable initially deferred for each row execute function private.aqari_commercial_collection_integrity_guard()',n||'_integrity',n);
 end loop;
end $$;

create or replace function private.aqari_commercial_collection_write_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare lid uuid;begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if tg_table_name='aqari_commercial_collections' then lid:=new.lease_id;
 else select c.lease_id into strict lid from private.aqari_commercial_collections c where c.workspace_id=new.workspace_id and c.id=new.collection_id;end if;
 perform private.aqari_financial_open(new.workspace_id,new.occurred_on);
 if private.aqari_commercial_legacy_history(new.workspace_id,lid) then raise check_violation using message='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED';end if;
 if exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=lid and l.vacated_on is not null)
  or exists(select 1 from private.aqari_vacating_settlements s where s.workspace_id=new.workspace_id and s.lease_id=lid and s.status in('cleared','released')) then raise check_violation using message='COMMERCIAL_COLLECTION_AFTER_CLEARANCE';end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_collection_write_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_collection_write_guard on private.aqari_commercial_collections;
create trigger aqari_commercial_collection_write_guard before insert on private.aqari_commercial_collections for each row execute function private.aqari_commercial_collection_write_guard();
drop trigger if exists aqari_commercial_collection_reversal_write_guard on private.aqari_commercial_collection_reversals;
create trigger aqari_commercial_collection_reversal_write_guard before insert on private.aqari_commercial_collection_reversals for each row execute function private.aqari_commercial_collection_write_guard();

create or replace function private.aqari_commercial_sale_collection_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_commercial_collection_allocations a
  join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id
  left join private.aqari_commercial_collection_reversals r on r.workspace_id=c.workspace_id and r.collection_id=c.id
  where a.workspace_id=new.workspace_id and a.sale_id=new.sale_id and (r.id is null or r.occurred_on>new.occurred_on)) then
  raise check_violation using message='COMMERCIAL_SALE_HAS_COLLECTION';end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_sale_collection_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_sale_collection_guard on private.aqari_commercial_sales_reversals;
create trigger aqari_commercial_sale_collection_guard before insert on private.aqari_commercial_sales_reversals for each row execute function private.aqari_commercial_sale_collection_guard();

create or replace function private.aqari_commercial_collections_register(w uuid,action text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();lid uuid;ident uuid;account_ident uuid;posted date;as_of date;today date:=(now() at time zone 'Asia/Kuwait')::date;
 l public.aqari_leases;p public.aqari_properties;account private.aqari_collection_accounts;doc public.aqari_documents;
 c private.aqari_commercial_collections;r private.aqari_commercial_collection_reversals;s private.aqari_commercial_sales;
 item jsonb;request jsonb;allocations jsonb;amount_value numeric(15,3);allocated numeric(15,3);paid numeric;total numeric:=0;result jsonb;
begin
 if actor is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>24000 or action is null or action not in('list','get','record','reverse') then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_ACTION';end if;
 if action='list' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('lease_id','as_of')) then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REQUEST';end if;
  perform 1 from public.aqari_app_state where workspace_id=w for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  as_of:=coalesce(nullif(d->>'as_of','')::date,today);lid:=nullif(d->>'lease_id','')::uuid;
  if as_of>today then raise invalid_parameter_value using message='INVALID_COMMERCIAL_AS_OF';end if;
  if lid is not null then
   if not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   select q.* into strict l from public.aqari_leases q where q.workspace_id=w and q.id=lid;
   select z.* into strict p from public.aqari_properties z join public.aqari_units u on u.workspace_id=z.workspace_id and u.property_id=z.id where u.workspace_id=w and u.id=l.unit_id;
  end if;
  if lid is not null and private.aqari_commercial_legacy_history(w,lid) then
   return jsonb_build_object('as_of',as_of,'mode','legacy_payment_allocation','unavailable_reason','COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED','can_manage',false,
    'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'contract_no',q.contract_no,'external_ref',q.external_ref,'property_id',z.id,'property_ref',z.external_ref,'property_name',z.name,'collection_mode',case when private.aqari_commercial_legacy_history(w,q.id) then 'legacy_payment_allocation' else 'independent_collection' end) order by q.contract_no,q.id),'[]')
     from public.aqari_leases q join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id join public.aqari_properties z on z.workspace_id=u.workspace_id and z.id=u.property_id
     where q.workspace_id=w and private.aqari_can_lease(w,q.id,'finance','read') and exists(select 1 from private.aqari_commercial_sales ss where ss.workspace_id=w and ss.lease_id=q.id)),
    'accounts','[]'::jsonb,'documents','[]'::jsonb,'statement',null,'sales','[]'::jsonb,'collections','[]'::jsonb);
  end if;
  return jsonb_build_object('as_of',as_of,'mode','independent_collection','unavailable_reason',null,'can_manage',private.aqari_manager(w) and private.aqari_can(w,'finance','write') and (lid is null or private.aqari_can_lease(w,lid,'finance','write')),'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'contract_no',q.contract_no,'external_ref',q.external_ref,'property_id',z.id,'property_ref',z.external_ref,'property_name',z.name,'collection_mode',case when private.aqari_commercial_legacy_history(w,q.id) then 'legacy_payment_allocation' else 'independent_collection' end) order by q.contract_no,q.id),'[]')
   from public.aqari_leases q join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id join public.aqari_properties z on z.workspace_id=u.workspace_id and z.id=u.property_id
   where q.workspace_id=w and private.aqari_can_lease(w,q.id,'finance','read') and exists(select 1 from private.aqari_commercial_sales ss where ss.workspace_id=w and ss.lease_id=q.id)),
   'accounts',(select coalesce(jsonb_agg(to_jsonb(a)-'created_by' order by a.name,a.id),'[]') from private.aqari_collection_accounts a where a.workspace_id=w and a.property_id=p.id and a.status='active'),
   'documents',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from (
    select dd.id,dd.title,dd.entity_type,dd.entity_ref,dd.created_at from public.aqari_documents dd join storage.objects o on o.bucket_id=dd.storage_bucket and o.name=dd.storage_path
    where dd.workspace_id=w and dd.status='uploaded' and ((dd.entity_type='lease' and dd.entity_ref=l.external_ref) or(dd.entity_type='property' and dd.entity_ref=p.external_ref))
     and dd.size_bytes>0 and dd.checksum_sha256~'^[a-f0-9]{64}$' and (o.metadata->>'size')::bigint=dd.size_bytes and o.metadata->>'mimetype'=dd.mime_type
     and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,dd.entity_type,dd.entity_ref,'read') limit 200)x),
   'statement',case when lid is null then null else private.aqari_commercial_balance(w,lid,as_of) end,
   'sales',(select coalesce(jsonb_agg(jsonb_build_object('id',ss.id,'month',ss.month,'amount',to_char(ss.amount,'FM999999999999990.000'),'period_end',ss.period_end,'reference',ss.source_reference,'reversed',exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=ss.id and sr.occurred_on<=as_of),
     'outstanding',to_char(case when exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=ss.id and sr.occurred_on<=as_of) then 0 else ss.amount-(select coalesce(sum(a.amount),0) from private.aqari_commercial_collection_allocations a join private.aqari_commercial_collections cc on cc.workspace_id=a.workspace_id and cc.id=a.collection_id where a.workspace_id=w and a.sale_id=ss.id and cc.occurred_on<=as_of and not exists(select 1 from private.aqari_commercial_collection_reversals rr where rr.workspace_id=w and rr.collection_id=a.collection_id and rr.occurred_on<=as_of)) end,'FM999999999999990.000')) order by ss.month,ss.id),'[]') from private.aqari_commercial_sales ss where ss.workspace_id=w and ss.lease_id=lid and ss.period_end<=as_of),
   'collections',(select coalesce(jsonb_agg(case when (proof#>>'{reversal,occurred_on}')::date>as_of then proof||'{"reversal":null}'::jsonb else proof end order by cc.occurred_on desc,cc.id),'[]') from private.aqari_commercial_collections cc cross join lateral(select private.aqari_commercial_collection_json(w,cc.id) proof)x where cc.workspace_id=w and cc.lease_id=lid and cc.occurred_on<=as_of));
 end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='COMMERCIAL_COLLECTION_ID_REQUIRED';end if;
 if action='get' then
  if exists(select 1 from jsonb_object_keys(d)k where k<>'id') then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REQUEST';end if;
  select * into c from private.aqari_commercial_collections x where x.workspace_id=w and x.id=ident;
  if not found then return jsonb_build_object('collection',null,'allocations','[]'::jsonb,'reversal',null);end if;
  if not private.aqari_can_lease(w,c.lease_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return private.aqari_commercial_collection_json(w,ident);
 end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if coalesce(d->>'occurred_on','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_DATE';end if;
 posted:=(d->>'occurred_on')::date;if posted>today then raise check_violation using message='INVALID_COMMERCIAL_COLLECTION_DATE';end if;
 if action='record' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('id','lease_id','account_id','account_revision','method','occurred_on','reference','source_document_id','amount','allocations'))
   or coalesce(d->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' or (d->>'amount')::numeric<=0
   or d->>'method' not in('cash','bank_transfer') or nullif(d->>'method','') is null
   or coalesce(d->>'account_revision','') !~ '^[1-9][0-9]{0,8}$'
   or length(btrim(coalesce(d->>'reference',''))) not between 3 and 160
   or jsonb_typeof(d->'allocations') is distinct from 'array' then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REQUEST';end if;
  if jsonb_array_length(d->'allocations') not between 1 and 60 then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATIONS';end if;
  amount_value:=(d->>'amount')::numeric;allocations:='[]';
  for item in select value from jsonb_array_elements(d->'allocations') loop
   if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item)k where k not in('sale_id','amount')) or coalesce(item->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' or (item->>'amount')::numeric<=0 or nullif(item->>'sale_id','') is null then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATIONS';end if;
   allocations:=allocations||jsonb_build_array(jsonb_build_object('sale_id',(item->>'sale_id')::uuid,'amount',to_char((item->>'amount')::numeric,'FM999999999999990.000')));total:=total+(item->>'amount')::numeric;
  end loop;
  if total<>amount_value or (select count(distinct x->>'sale_id') from jsonb_array_elements(allocations)x)<>jsonb_array_length(allocations) then raise check_violation using message='COMMERCIAL_ALLOCATION_TOTAL_MISMATCH';end if;
  select jsonb_agg(x order by x->>'sale_id') into allocations from jsonb_array_elements(allocations)x;
  request:=d||jsonb_build_object('amount',to_char(amount_value,'FM999999999999990.000'),'reference',btrim(d->>'reference'),'allocations',allocations);
  select * into c from private.aqari_commercial_collections x where x.id=ident;
  if found then
   if c.workspace_id<>w or c.request_data is distinct from request or c.recorded_by<>actor then raise unique_violation using message='COMMERCIAL_COLLECTION_RETRY_CONFLICT';end if;
   if not private.aqari_can_lease(w,c.lease_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   return private.aqari_commercial_collection_json(w,ident);
  end if;
  lid:=nullif(d->>'lease_id','')::uuid;account_ident:=nullif(d->>'account_id','')::uuid;
 else
  if exists(select 1 from jsonb_object_keys(d)k where k not in('id','collection_id','occurred_on','reason')) or length(btrim(coalesce(d->>'reason',''))) not between 5 and 500 then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REVERSAL';end if;
  request:=d||jsonb_build_object('reason',btrim(d->>'reason'));
  select * into r from private.aqari_commercial_collection_reversals x where x.id=ident;
  if found then
   if r.workspace_id<>w or r.request_data is distinct from request or r.recorded_by<>actor then raise unique_violation using message='COMMERCIAL_COLLECTION_RETRY_CONFLICT';end if;
   select * into c from private.aqari_commercial_collections x where x.workspace_id=w and x.id=r.collection_id;
   if not private.aqari_can_lease(w,c.lease_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   return private.aqari_commercial_collection_json(w,c.id);
  end if;
  select * into c from private.aqari_commercial_collections x where x.workspace_id=w and x.id=nullif(d->>'collection_id','')::uuid;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  lid:=c.lease_id;account_ident:=c.account_id;
 end if;
 if not private.aqari_can_lease(w,lid,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases q where q.workspace_id=w and q.id=lid for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if private.aqari_commercial_legacy_history(w,lid) then raise check_violation using message='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED';end if;
 select z.* into strict p from public.aqari_properties z join public.aqari_units u on u.workspace_id=z.workspace_id and u.property_id=z.id where u.workspace_id=w and u.id=l.unit_id;
 perform private.aqari_financial_open(w,posted);
 if action='record' then
  if l.status not in('signed','expired') then raise check_violation using message='COMMERCIAL_COLLECTION_CONTRACT_REQUIRED';end if;
  select * into account from private.aqari_collection_accounts a where a.workspace_id=w and a.id=account_ident for update;
  if not found or account.property_id<>p.id or account.status<>'active' or account.currency<>'KWD' or account.kind<>(case d->>'method' when 'cash' then 'cashbox' else 'bank' end) then raise check_violation using message='COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH';end if;
  if account.revision<>(d->>'account_revision')::integer then raise serialization_failure using message='COMMERCIAL_COLLECTION_ACCOUNT_CHANGED';end if;
  select dd.* into doc from public.aqari_documents dd join storage.objects o on o.bucket_id=dd.storage_bucket and o.name=dd.storage_path
   where dd.workspace_id=w and dd.id=nullif(d->>'source_document_id','')::uuid and dd.status='uploaded'
    and ((dd.entity_type='lease' and dd.entity_ref=l.external_ref) or(dd.entity_type='property' and dd.entity_ref=p.external_ref))
    and dd.size_bytes>0 and dd.checksum_sha256~'^[a-f0-9]{64}$' and (o.metadata->>'size')::bigint=dd.size_bytes and o.metadata->>'mimetype'=dd.mime_type
    and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,dd.entity_type,dd.entity_ref,'read');
  if not found then raise check_violation using message='COMMERCIAL_COLLECTION_DOCUMENT_UNVERIFIED';end if;
  perform private.aqari_assert_commercial_collections(w,lid);
  for item in select value from jsonb_array_elements(allocations) loop
   select * into s from private.aqari_commercial_sales x where x.workspace_id=w and x.lease_id=lid and x.id=(item->>'sale_id')::uuid for share;
   if not found or s.amount<=0 or exists(select 1 from private.aqari_commercial_sales_reversals rr where rr.workspace_id=w and rr.sale_id=s.id) then raise check_violation using message='COMMERCIAL_ALLOCATION_SOURCE_INVALID';end if;
   if posted<s.period_end then raise check_violation using message='COMMERCIAL_COLLECTION_BEFORE_CHARGE';end if;
   select coalesce(sum(a.amount),0) into paid from private.aqari_commercial_collection_allocations a where a.workspace_id=w and a.sale_id=s.id and not exists(select 1 from private.aqari_commercial_collection_reversals rr where rr.workspace_id=w and rr.collection_id=a.collection_id);
   if paid+(item->>'amount')::numeric>s.amount then raise check_violation using message='COMMERCIAL_ALLOCATION_EXCEEDS_BALANCE';end if;
  end loop;
  insert into private.aqari_commercial_collections(id,workspace_id,lease_id,account_id,account_snapshot,method,occurred_on,amount,reference,source_document_id,source_checksum,request_data,recorded_by)
   values(ident,w,lid,account.id,jsonb_build_object('id',account.id,'property_id',account.property_id,'kind',account.kind,'name',account.name,'masked_reference',account.masked_reference,'currency',account.currency,'revision',account.revision),d->>'method',posted,amount_value,btrim(d->>'reference'),doc.id,doc.checksum_sha256,request,actor);
  insert into private.aqari_commercial_collection_allocations(workspace_id,collection_id,sale_id,amount) select w,ident,(x->>'sale_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(allocations)x;
  result:=private.aqari_commercial_collection_json(w,ident);
 else
  if posted<c.occurred_on then raise check_violation using message='INVALID_COMMERCIAL_COLLECTION_DATE';end if;
  if exists(select 1 from private.aqari_commercial_collection_reversals rr where rr.workspace_id=w and rr.collection_id=c.id) then raise unique_violation using message='COMMERCIAL_COLLECTION_ALREADY_REVERSED';end if;
  insert into private.aqari_commercial_collection_reversals(id,workspace_id,collection_id,amount,occurred_on,reason,request_data,recorded_by) values(ident,w,c.id,c.amount,posted,btrim(d->>'reason'),request,actor);
  result:=private.aqari_commercial_collection_json(w,c.id);
 end if;
 perform private.aqari_assert_commercial_collections(w,lid);
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
  values(w,'commercial_collections',ident,action,actor,coalesce(auth.jwt()->>'email',actor::text),coalesce(request->>'reference',request->>'reason'),result);
 return result;
end $$;
revoke all on function private.aqari_commercial_collections_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_commercial_collections_register(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_commercial_collections(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_commercial_collections_register(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_commercial_collections(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_commercial_collections(uuid,text,jsonb) to authenticated;

-- The independent mode has its own source checks and cutoff boundary.
create or replace function private.aqari_independent_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 -- Reject incomplete or unrelated financial source links instead of allowing a
 -- generic credit or a rent payment to erase a separately evidenced obligation.
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if to_regprocedure('private.aqari_commercial_balance(uuid,uuid,date)') is not null then
  if (private.aqari_commercial_balance(w,lid,(now() at time zone 'Asia/Kuwait')::date)->>'balance')::numeric<>0 then
   raise check_violation using message='توجد مستحقات نسبة مبيعات غير محسومة. راجع تسجيل التحصيل الموثق وتخصيصه قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
  end if;
  if exists(select 1 from private.aqari_vacating_settlements v where v.workspace_id=w and v.lease_id=lid and (private.aqari_commercial_balance(w,lid,v.vacate_date)->>'balance')::numeric<>0) then
   raise check_violation using message='COMMERCIAL_COLLECTION_CUTOFF_REVIEW_REQUIRED';
  end if;
  return;
 end if;
 if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.amount>0
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير محسومة. راجعها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد؛ دفعة الإيجار وحدها لا تسدد هذا الاستحقاق.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_independent_commercial_clearance(uuid,uuid) from public,anon,authenticated;

-- A legacy allocation can never be introduced after this lease starts the
-- independent receipt ledger, even when every independent receipt was reversed.
create or replace function private.aqari_commercial_legacy_mode_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=new.workspace_id and c.lease_id=new.lease_id) then
  raise check_violation using message='COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_legacy_mode_guard() from public,anon,authenticated;

-- Preserve the currently installed allocation rules once, never a prior wrapper.
-- A subsequent unrelated rewrite fails closed instead of silently replacing it.
do $compat$
declare guard_source text;balance_source text;guard_saved boolean;balance_saved boolean;
begin
 if to_regclass('private.aqari_commercial_payment_allocations') is null then
  execute $install$create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
   language plpgsql volatile security definer set search_path='' as $fn$begin perform private.aqari_independent_commercial_clearance(w,lid);end $fn$;$install$;
  revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
  return;
 end if;
 if to_regclass('private.aqari_commercial_active_allocations') is null then raise exception 'COMMERCIAL_COMPAT_SOURCE_INCOMPLETE';end if;
 guard_source:=pg_get_functiondef('private.aqari_require_commercial_clearance(uuid,uuid)'::regprocedure);
 balance_source:=pg_get_functiondef('private.aqari_vacating_balances(uuid,uuid,date)'::regprocedure);
 guard_saved:=to_regprocedure('private.aqari_legacy_allocation_clearance(uuid,uuid)') is not null;
 balance_saved:=to_regprocedure('private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)') is not null;
 if guard_saved<>balance_saved then raise exception 'COMMERCIAL_COMPAT_SOURCE_INCOMPLETE';end if;
 if not guard_saved then
  if position('aqari_commercial_active_allocations' in guard_source)=0 or position('aqari_commercial_active_allocations' in balance_source)=0
   or position('aqari_legacy_allocation_clearance' in guard_source)>0 or position('aqari_legacy_allocation_vacating_balances' in balance_source)>0 then raise exception 'COMMERCIAL_COMPAT_SOURCE_CHANGED';end if;
  execute replace(guard_source,'CREATE OR REPLACE FUNCTION private.aqari_require_commercial_clearance(','CREATE OR REPLACE FUNCTION private.aqari_legacy_allocation_clearance(');
  execute replace(balance_source,'CREATE OR REPLACE FUNCTION private.aqari_vacating_balances(','CREATE OR REPLACE FUNCTION private.aqari_legacy_allocation_vacating_balances(');
 else
  if position('aqari_legacy_allocation_clearance' in guard_source)=0 or position('aqari_legacy_allocation_vacating_balances' in balance_source)=0 then raise exception 'COMMERCIAL_COMPAT_SOURCE_CHANGED';end if;
 end if;
 revoke all on function private.aqari_legacy_allocation_clearance(uuid,uuid),private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date) from public,anon,authenticated;
 execute $install$create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
  language plpgsql volatile security definer set search_path='' as $fn$
  begin
   perform 1 from public.aqari_app_state where workspace_id=w for update;
   if exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid) then
    perform private.aqari_independent_commercial_clearance(w,lid);
   else
    perform private.aqari_legacy_allocation_clearance(w,lid);
   end if;
  end $fn$;$install$;
 execute $install$create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
  language plpgsql volatile security definer set search_path='' as $fn$
  declare original jsonb;commercial jsonb;due_value numeric;paid_value numeric;balance_value numeric;
  begin
   if auth.uid() is null or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   perform 1 from public.aqari_app_state where workspace_id=w for share;
   original:=private.aqari_legacy_allocation_vacating_balances(w,lid,vdate);
   if not exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid) then return original;end if;
   commercial:=private.aqari_commercial_balance(w,lid,vdate);
   due_value:=(commercial->>'charge_total')::numeric-(commercial->>'reversed_charge_total')::numeric;
   paid_value:=(commercial->>'collected_total')::numeric-(commercial->>'collection_reversed_total')::numeric;
   balance_value:=(commercial->>'balance')::numeric;
   return original||jsonb_build_object(
    'commercial_collection_mode','independent_collection',
    'commercial_sales_due_total',due_value::numeric(18,3)::text,
    'commercial_sales_paid_total',paid_value::numeric(18,3)::text,
    'commercial_sales_balance',balance_value::numeric(18,3)::text,
    'unified_due_balance',((original->>'rent_balance')::numeric+balance_value)::numeric(18,3)::text);
  end $fn$;$install$;
 revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
 execute 'drop trigger if exists aqari_commercial_legacy_mode_guard on private.aqari_commercial_payment_allocations';
 execute 'create trigger aqari_commercial_legacy_mode_guard before insert on private.aqari_commercial_payment_allocations for each row execute function private.aqari_commercial_legacy_mode_guard()';
end $compat$;
-- Accept only the known five-field clearance shape when every added source
-- amount is genuinely zero. Existing snapshots and release authorizations stay
-- unchanged; a new obligation or unknown field still requires fresh review.
create or replace function private.aqari_clearance_balances_compatible(w uuid,lid uuid,expected jsonb,actual jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare old_keys text[]:=array['rent_due_total','rent_paid_total','rent_balance','tenant_credit','deposit_balance'];
 allowed_keys text[]:=array['rent_due_total','rent_paid_total','rent_balance','tenant_credit','deposit_balance','rent_payment_total','commercial_allocated_from_payments','commercial_sales_due_total','commercial_sales_paid_total','commercial_sales_balance','unified_due_balance','commercial_collection_mode'];
begin
 if expected is null or actual is null or jsonb_typeof(expected)<>'object' or jsonb_typeof(actual)<>'object' then return false;end if;
 perform private.aqari_require_commercial_clearance(w,lid);
 if expected=actual then return true;end if;
 if (select count(*) from jsonb_object_keys(expected))<>5 or exists(select 1 from jsonb_object_keys(expected)k where not(k=any(old_keys)))
  or exists(select 1 from jsonb_object_keys(actual)k where not(k=any(allowed_keys))) then return false;end if;
 if exists(select 1 from unnest(old_keys)k where expected->k is distinct from actual->k) then return false;end if;
 if actual->>'commercial_collection_mode' is not null and actual->>'commercial_collection_mode'<>'independent_collection' then return false;end if;
 return actual->>'commercial_allocated_from_payments'='0.000'
  and actual->>'commercial_sales_due_total'='0.000' and actual->>'commercial_sales_paid_total'='0.000' and actual->>'commercial_sales_balance'='0.000'
  and actual->'rent_payment_total'=actual->'rent_paid_total'
  and actual->'unified_due_balance'=actual->'rent_balance';
end $$;
revoke all on function private.aqari_clearance_balances_compatible(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
do $release_comparison$
declare source text:=pg_get_functiondef('public.aqari_vacating_release(uuid,uuid,bigint)'::regprocedure);
 anchor text:='if clearance_balances is null or balances is distinct from clearance_balances then';
begin
 if position('private.aqari_clearance_balances_compatible' in source)=0 then
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'COMMERCIAL_RELEASE_COMPARISON_SOURCE_CHANGED';end if;
  execute replace(source,anchor,'if not coalesce(private.aqari_clearance_balances_compatible(w,lid,clearance_balances,balances),false) then');
 end if;
end $release_comparison$;
commit;
