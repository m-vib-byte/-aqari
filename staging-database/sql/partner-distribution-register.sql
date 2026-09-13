-- Additive partner entitlements. Apply after financial close/cancellation and partner shares guards.
-- No historical backfill, payments, opening balances or browser-calculated money are imported.
begin;
create table if not exists private.aqari_partner_period_sources (
 workspace_id uuid not null,property_id uuid not null,month date not null,
 source jsonb not null,source_hash text not null,period_matches boolean not null,created_at timestamptz not null default now(),
 primary key(workspace_id,property_id,month),
 foreign key(workspace_id,month) references private.aqari_financial_periods(workspace_id,month),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create table if not exists private.aqari_partner_source_approvals (
 id uuid primary key,workspace_id uuid not null,property_id uuid not null,month date not null,
 shares_key text not null,shares_version bigint not null,owners jsonb not null,recipients jsonb not null,
 review_revision bigint not null,source_hash text not null,review_hash text not null,document_id uuid not null references public.aqari_documents(id),document_snapshot jsonb not null,
 income_fils bigint not null,expense_fils bigint not null,reserve_fils bigint not null,net_fils bigint not null,
 reason text not null,approved_by uuid not null,approved_at timestamptz not null default now(),request_hash text not null,
 unique(workspace_id,property_id,month,review_revision),unique(workspace_id,id),
 foreign key(workspace_id,property_id,month) references private.aqari_partner_period_sources(workspace_id,property_id,month),
 check(net_fils=income_fils-expense_fils-reserve_fils)
);
create table if not exists private.aqari_partner_distributions (
 id uuid primary key,workspace_id uuid not null,source_id uuid not null,property_id uuid not null,month date not null,
 kind text not null check(kind in('distribution','reversal')),reverses_id uuid references private.aqari_partner_distributions(id),
 occurred_on date not null,net_fils bigint not null,allocations jsonb not null,review_hash text not null,
 reason text not null,actor_id uuid not null,recorded_at timestamptz not null default now(),request_hash text not null,
 foreign key(workspace_id,source_id) references private.aqari_partner_source_approvals(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check((kind='distribution')=(reverses_id is null))
);
create unique index if not exists aqari_partner_distribution_once on private.aqari_partner_distributions(workspace_id,property_id,month) where kind='distribution';
create unique index if not exists aqari_partner_reversal_once on private.aqari_partner_distributions(reverses_id) where kind='reversal';
create index if not exists aqari_partner_distributions_source_idx on private.aqari_partner_distributions(workspace_id,source_id);
create index if not exists aqari_partner_sources_period_idx on private.aqari_partner_period_sources(workspace_id,month);
create index if not exists aqari_partner_distribution_property_idx on private.aqari_partner_distributions(workspace_id,property_id,month,recorded_at,id);
create index if not exists aqari_partner_approval_document_idx on private.aqari_partner_source_approvals(document_id);
do $$declare n text;begin foreach n in array array['aqari_partner_period_sources','aqari_partner_source_approvals','aqari_partner_distributions'] loop
 execute format('alter table private.%I enable row level security',n);execute format('revoke all on private.%I from public,anon,authenticated',n);
 execute format('drop trigger if exists aqari_partner_append_only on private.%I',n);
 execute format('create trigger aqari_partner_append_only before update or delete on private.%I for each row execute function private.aqari_reject_immutable_change()',n);
end loop;end$$;

create or replace function private.aqari_partner_hash(v jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to(v::text,'UTF8')),'hex')
$$;
-- Largest remainder of absolute fils; binary owner ID is the stable tie-break.
-- A negative period uses the exact sign inverse, so losses are never silently dropped.
create or replace function private.aqari_partner_allocate(fils bigint,owners jsonb,recipients jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;begin
 perform private.aqari_validate_partner_owners(owners);
 if fils is null or abs(fils::numeric)>9007199254740991 then raise exception 'PARTNER_AMOUNT_RANGE' using errcode='23514';end if;
 with base as(select x, floor(abs(fils::numeric)*(x->>'bps')::numeric/10000)::bigint part,
 mod(abs(fils::numeric)*(x->>'bps')::numeric,10000) fraction from jsonb_array_elements(owners)x),
 ranked as(select *,row_number()over(order by fraction desc,(x->>'id') collate "C") rank,
 (abs(fils::numeric)-sum(part)over())::bigint remainder from base)
 select jsonb_agg(jsonb_build_object('owner_id',x->>'id','name',x->>'name','role',x->>'role','bps',(x->>'bps')::integer,
 'recipient_user_id',recipients->(x->>'id'),'amount_fils',((part+case when rank<=remainder then 1 else 0 end)*sign(fils::numeric))::bigint::text) order by (x->>'id') collate "C") into result from ranked;
 if (select sum((x->>'amount_fils')::numeric) from jsonb_array_elements(result)x)<>fils then raise exception 'PARTNER_ALLOCATION_MISMATCH' using errcode='23514';end if;
 return result;
end$$;

-- A rent receipt may also fund a separate commercial obligation. This limited
-- register never guesses the rent/commercial split. Preserve evidence and refuse
-- only the affected property's source. A missing compatibility view also fails closed.
create or replace function private.aqari_partner_commercial_evidence(w uuid,payments jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if to_regclass('private.aqari_commercial_active_allocations') is not null then
  execute 'select coalesce(jsonb_agg(to_jsonb(a) order by a.allocation_id),''[]''::jsonb) from private.aqari_commercial_active_allocations a where a.workspace_id=$1 and a.payment_id in(select (x->>''id'')::uuid from jsonb_array_elements($2)x)' into result using w,payments;
  return result;
 end if;
 if to_regclass('private.aqari_commercial_payment_allocations') is not null then return '[{"review_required":"COMMERCIAL_ACTIVE_VIEW_REQUIRED"}]'::jsonb;end if;
 return '[]'::jsonb;
end$$;
revoke all on function private.aqari_partner_commercial_evidence(uuid,jsonb) from public,anon,authenticated;

-- Snapshot detail only for a newly inserted, supported close. Existing rows stay unchanged.
-- A mismatch with the already approved workspace totals keeps the source in REVIEW_REQUIRED.
create or replace function private.aqari_capture_partner_period() returns trigger language plpgsql security definer set search_path='' as $$
declare p record;income numeric:=0;expenses numeric:=0;icount bigint:=0;ecount bigint:=0;v jsonb;payments jsonb;exclusions jsonb;costs jsonb;reserves jsonb;commercial jsonb;matches boolean;
begin
 if new.snapshot->>'scope' is distinct from 'posted_rent_payments_and_approved_expenses_only' then return new;end if;
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 select coalesce(sum(r.amount),0),count(*) into income,icount from public.aqari_rent_payments r
 where r.workspace_id=new.workspace_id and r.paid_at>=new.month and r.paid_at<(new.month+interval '1 month')::date
 and r.status in('paid','partial','مدفوع','جزئي') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id);
 select coalesce(sum(e.amount),0),count(*) into expenses,ecount from private.aqari_financial_expenses e where e.workspace_id=new.workspace_id and e.expense_date>=new.month and e.expense_date<(new.month+interval '1 month')::date and e.state='approved';
 matches:=coalesce((new.snapshot->>'rent_payments')::numeric=income and (new.snapshot->>'approved_expenses')::numeric=expenses
 and (new.snapshot->>'rent_payment_count')::bigint=icount and (new.snapshot->>'approved_expense_count')::bigint=ecount,false);
 for p in select * from public.aqari_properties where workspace_id=new.workspace_id order by id loop
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id)filter(where r.status in('paid','partial','مدفوع','جزئي') and c.id is null),'[]'),
   coalesce(jsonb_agg(jsonb_build_object('payment',to_jsonb(r),'cancellation',to_jsonb(c))order by r.id)filter(where r.status not in('paid','partial','مدفوع','جزئي') or c.id is not null),'[]') into payments,exclusions
  from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  left join private.aqari_receipt_cancellations c on c.workspace_id=r.workspace_id and c.payment_id=r.id
  where r.workspace_id=new.workspace_id and u.property_id=p.id and r.paid_at>=new.month and r.paid_at<(new.month+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(e)order by e.id),'[]') into costs from private.aqari_financial_expenses e
   where e.workspace_id=new.workspace_id and e.property_id=p.id and e.expense_date>=new.month and e.expense_date<(new.month+interval '1 month')::date and e.state='approved';
  select coalesce(jsonb_agg(to_jsonb(r)order by r.id),'[]') into reserves from private.aqari_reserve_entries r
   where r.workspace_id=new.workspace_id and r.property_id=p.id and (r.created_at at time zone 'Asia/Kuwait')::date>=new.month and (r.created_at at time zone 'Asia/Kuwait')::date<(new.month+interval '1 month')::date;
  commercial:=private.aqari_partner_commercial_evidence(new.workspace_id,payments);
  v:=jsonb_build_object('version',1,'source_scope','posted_confirmed_rent_and_approved_expenses_and_reserve_movements_only','workspace_id',new.workspace_id,'property_id',p.id,'property_name',p.name,'month',new.month,
   'period_hash',private.aqari_partner_hash(new.snapshot),'workspace_period_matches',matches,'period_matches',matches and jsonb_array_length(commercial)=0,'commercial_allocations',commercial,'review_reason',case when jsonb_array_length(commercial)>0 then 'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' when not matches then 'PARTNER_CLOSE_TOTAL_MISMATCH' else null end,'payments',payments,'excluded_payments',exclusions,'expenses',costs,'reserves',reserves,
   'reserve_policy','period_hold_minus_release_once','income_fils',(select (coalesce(sum((x->>'amount')::numeric),0)*1000)::bigint::text from jsonb_array_elements(payments)x),
   'expense_fils',(select (coalesce(sum((x->>'amount')::numeric),0)*1000)::bigint::text from jsonb_array_elements(costs)x),
   'reserve_fils',(select (coalesce(sum((x->>'amount')::numeric*case when x->>'direction'='hold' then 1 else -1 end),0)*1000)::bigint::text from jsonb_array_elements(reserves)x));
  insert into private.aqari_partner_period_sources(workspace_id,property_id,month,source,source_hash,period_matches) values(new.workspace_id,p.id,new.month,v,private.aqari_partner_hash(v),matches and jsonb_array_length(commercial)=0);
 end loop;
 -- Independently check the property partition matches the authoritative totals.
 if (select coalesce(sum((s.source->>'income_fils')::numeric),0) from private.aqari_partner_period_sources s where s.workspace_id=new.workspace_id and s.month=new.month)<>income*1000
 or (select coalesce(sum((s.source->>'expense_fils')::numeric),0) from private.aqari_partner_period_sources s where s.workspace_id=new.workspace_id and s.month=new.month)<>expenses*1000 then
  raise exception 'PARTNER_CLOSE_PROPERTY_TOTAL_MISMATCH' using errcode='23514';
 end if;
 return new;
end$$;
drop trigger if exists aqari_partner_capture_period on private.aqari_financial_periods;
create trigger aqari_partner_capture_period after insert on private.aqari_financial_periods for each row execute function private.aqari_capture_partner_period();
drop trigger if exists aqari_partner_period_immutable on private.aqari_financial_periods;
create trigger aqari_partner_period_immutable before update or delete on private.aqari_financial_periods for each row execute function private.aqari_reject_immutable_change();

-- Reserve timing joins the same close lock. An after-close backdated hold/release
-- cannot change the saved net. Receipt cancellations also check the receipt's date.
create or replace function private.aqari_partner_source_date_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d date;begin
 if tg_table_name='aqari_reserve_entries' then d:=(new.created_at at time zone 'Asia/Kuwait')::date;
 else select paid_at into strict d from public.aqari_rent_payments where workspace_id=new.workspace_id and id=new.payment_id;end if;
 perform private.aqari_financial_open(new.workspace_id,d);return new;
end$$;
drop trigger if exists aqari_partner_reserve_period_guard on private.aqari_reserve_entries;
create trigger aqari_partner_reserve_period_guard before insert on private.aqari_reserve_entries for each row execute function private.aqari_partner_source_date_guard();
drop trigger if exists aqari_partner_cancel_period_guard on private.aqari_receipt_cancellations;
create trigger aqari_partner_cancel_period_guard before insert on private.aqari_receipt_cancellations for each row execute function private.aqari_partner_source_date_guard();

create or replace function private.aqari_partner_distribution_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare w uuid:=p_workspace_id;d jsonb:=p_data;k text;allowed text[];m date;p uuid;ident uuid;why text;app jsonb;s jsonb;owners jsonb;recipients jsonb;x jsonb;v jsonb;rh text;doc jsonb;
 src private.aqari_partner_period_sources;a private.aqari_partner_source_approvals;e private.aqari_partner_distributions;original private.aqari_partner_distributions;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'partners','read') or not private.aqari_can(w,'finance','read') or not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>64000 then raise exception 'INVALID_PARTNER_REQUEST' using errcode='22023';end if;
 allowed:=case p_action when 'list' then array['month'] when 'preview' then array['property_id','month','shares_key']
 when 'approve_source' then array['id','property_id','month','source_hash','shares_key','shares_version','expected_review_revision','expected_income_fils','expected_expense_fils','expected_reserve_fils','document_id','recipients','reason']
 when 'post' then array['id','source_id','review_hash','reason'] when 'reverse' then array['id','distribution_id','reason'] else null end;
 if allowed is null then raise exception 'INVALID_PARTNER_ACTION' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not k=any(allowed) then raise exception 'INVALID_PARTNER_FIELD' using errcode='22023';end if;end loop;
 if p_action in('list','preview','approve_source') then
  if coalesce(d->>'month','')!~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' then raise exception 'INVALID_PARTNER_MONTH' using errcode='22023';end if;m:=((d->>'month')||'-01')::date;
 end if;
 if p_action='list' then
  select private.aqari_unwrap(payload) into app from public.aqari_app_state where workspace_id=w;
  return jsonb_build_object('workspace_id',w,'month',d->>'month',
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') from public.aqari_properties p where p.workspace_id=w),
   'shares',coalesce(app->'propertySharesV267','{}'),
   'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.property_id),'[]') from private.aqari_partner_period_sources s where s.workspace_id=w and s.month=m),
   'approvals',(select coalesce(jsonb_agg(to_jsonb(a) order by a.property_id),'[]') from private.aqari_partner_source_approvals a where a.workspace_id=w and a.month=m),
   'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at,e.id),'[]') from private.aqari_partner_distributions e where e.workspace_id=w and e.month=m),
   'partners',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'property_id',a.property_id,'name',a.display_name,'email',a.email) order by a.property_id,a.email),'[]') from private.aqari_partner_access a join auth.users u on u.id=a.user_id and lower(u.email)=a.email where a.workspace_id=w and a.is_active and u.email_confirmed_at is not null),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'property_id',p.id,'title',doc.title) order by doc.created_at desc,doc.id),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded'),
   'rule','largest_remainder_absolute_fils_then_owner_id_C','currency','KWD','external_payments',false);
 end if;
 if p_action<>'preview' then
  if not private.aqari_can(w,'partners','write') or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_require_sensitive_aal2(w);
 end if;
 select private.aqari_unwrap(payload) into app from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action<>'preview' then
  ident:=(d->>'id')::uuid;why:=btrim(d->>'reason');rh:=private.aqari_partner_hash(d);
  if ident is null or why is null or length(why) not between 5 and 500 then raise exception 'PARTNER_REASON_REQUIRED' using errcode='22023';end if;
  if p_action='approve_source' then
   select * into a from private.aqari_partner_source_approvals where id=ident;
   if found then if a.workspace_id<>w then raise insufficient_privilege using message='ACCESS_DENIED';end if;if a.approved_by<>auth.uid() then raise insufficient_privilege using message='ACCESS_DENIED';end if;if a.request_hash<>rh then raise exception 'PARTNER_RETRY_CONFLICT' using errcode='23514';end if;return to_jsonb(a);end if;
  else
   select * into e from private.aqari_partner_distributions where id=ident;
   if found then if e.workspace_id<>w then raise insufficient_privilege using message='ACCESS_DENIED';end if;if e.actor_id<>auth.uid() then raise insufficient_privilege using message='ACCESS_DENIED';end if;if e.request_hash<>rh or e.kind<>(case when p_action='post' then 'distribution' else 'reversal' end) then raise exception 'PARTNER_RETRY_CONFLICT' using errcode='23514';end if;return to_jsonb(e);end if;
  end if;
 end if;
 if p_action in('preview','approve_source') then
  p:=(d->>'property_id')::uuid;
  if p is null or not exists(select 1 from public.aqari_properties where workspace_id=w and id=p) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select * into src from private.aqari_partner_period_sources where workspace_id=w and property_id=p and month=m;
  if found and jsonb_array_length(private.aqari_partner_commercial_evidence(w,src.source->'payments'))>0 then raise exception 'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' using errcode='23514';end if;
  if not found or not src.period_matches then raise exception 'PARTNER_SOURCE_REVIEW_REQUIRED' using errcode='23514';end if;
  if src.source_hash<>private.aqari_partner_hash(src.source) then raise exception 'PARTNER_SOURCE_HASH_MISMATCH' using errcode='23514';end if;
  s:=app->'propertySharesV267'->(d->>'shares_key');owners:=s->'owners';
  if s->>'enabled' is distinct from 'true' or jsonb_typeof(s->'version') is distinct from 'number' or jsonb_typeof(s->'events') is distinct from 'array' then raise exception 'PARTNER_SHARES_REVIEW_REQUIRED' using errcode='23514';end if;
  perform private.aqari_validate_partner_owners(owners);
  if exists(select 1 from jsonb_array_elements(s->'events')x where x->>'type' in('distribution','payment')) then raise exception 'PARTNER_LEGACY_FINANCE_REVIEW_REQUIRED' using errcode='23514';end if;
  v:=jsonb_build_object('workspace_id',w,'property_id',p,'month',d->>'month','source_hash',src.source_hash,'shares_key',d->>'shares_key','shares_version',s->'version','owners',owners,
   'income_fils',src.source->>'income_fils','expense_fils',src.source->>'expense_fils','reserve_fils',src.source->>'reserve_fils',
   'review_revision',(select coalesce(max(a.review_revision),0) from private.aqari_partner_source_approvals a where a.workspace_id=w and a.property_id=p and a.month=m),'net_fils',((src.source->>'income_fils')::bigint-(src.source->>'expense_fils')::bigint-(src.source->>'reserve_fils')::bigint)::text);
  if p_action='preview' then return v||jsonb_build_object('allocations',private.aqari_partner_allocate((v->>'net_fils')::bigint,owners,'{}'));end if;
  if d->>'source_hash' is distinct from src.source_hash or d->'shares_version' is distinct from s->'version' or d->'expected_review_revision' is distinct from v->'review_revision' then raise serialization_failure using message='PARTNER_REVIEW_STALE';end if;
  foreach k in array array['income','expense','reserve'] loop
   if jsonb_typeof(d->('expected_'||k||'_fils')) is distinct from 'string' or coalesce(d->>('expected_'||k||'_fils'),'')!~ '^-?(0|[1-9][0-9]{0,15})$'
    or (d->>('expected_'||k||'_fils'))::numeric<>(src.source->>(k||'_fils'))::numeric then raise exception 'PARTNER_EXPLICIT_RECONCILIATION_REQUIRED' using errcode='23514';end if;
  end loop;
  select to_jsonb(doc) into doc from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref
   join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path where doc.id=(d->>'document_id')::uuid and doc.workspace_id=w and doc.entity_type='property' and p.id=src.property_id and doc.status='uploaded'
   and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type for share of doc,o;
  if doc is null then raise exception 'PARTNER_DOCUMENT_UNVERIFIED' using errcode='23514';end if;
  recipients:=d->'recipients';
  if jsonb_typeof(recipients) is distinct from 'object' or (select count(*) from jsonb_object_keys(recipients))<>jsonb_array_length(owners) then raise exception 'PARTNER_RECIPIENT_REVIEW_REQUIRED' using errcode='23514';end if;
  for x in select value from jsonb_array_elements(owners) loop
   if not recipients?(x->>'id') then raise exception 'PARTNER_RECIPIENT_REVIEW_REQUIRED' using errcode='23514';end if;
   -- Explicit null keeps an offline owner private; it grants nobody access.
   if recipients->(x->>'id')<>'null'::jsonb and not exists(select 1 from private.aqari_partner_access a join auth.users u on u.id=a.user_id and lower(u.email)=a.email
    where a.workspace_id=w and a.property_id=p and a.is_active and u.email_confirmed_at is not null and a.user_id=(recipients->>(x->>'id'))::uuid
    and not exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=a.user_id)) then raise exception 'PARTNER_RECIPIENT_ACCESS_REQUIRED' using errcode='23514';end if;
  end loop;
  if exists(select 1 from jsonb_each_text(recipients) where value is not null group by value having count(*)>1) then raise exception 'PARTNER_RECIPIENT_DUPLICATE' using errcode='23514';end if;
  if exists(select 1 from private.aqari_partner_source_approvals a where a.workspace_id=w and ((a.property_id=p and a.shares_key<>d->>'shares_key') or (a.shares_key=d->>'shares_key' and a.property_id<>p))) then raise exception 'PARTNER_PROPERTY_SHARES_BINDING_CONFLICT' using errcode='23514';end if;
  if exists(select 1 from private.aqari_partner_distributions e where e.workspace_id=w and e.property_id=p and e.month=m) then raise exception 'PARTNER_DISTRIBUTED_SOURCE_IMMUTABLE' using errcode='23514';end if;
  insert into private.aqari_partner_source_approvals(id,workspace_id,property_id,month,shares_key,shares_version,owners,recipients,review_revision,source_hash,review_hash,document_id,document_snapshot,income_fils,expense_fils,reserve_fils,net_fils,reason,approved_by,request_hash)
   values(ident,w,p,m,d->>'shares_key',(s->>'version')::bigint,owners,recipients,(v->>'review_revision')::bigint+1,src.source_hash,private.aqari_partner_hash(v||jsonb_build_object('recipients',recipients,'document',doc)),(d->>'document_id')::uuid,doc,(v->>'income_fils')::bigint,(v->>'expense_fils')::bigint,(v->>'reserve_fils')::bigint,(v->>'net_fils')::bigint,why,auth.uid(),rh) returning * into a;
  return to_jsonb(a);
 end if;
 perform private.aqari_financial_open(w,(now() at time zone 'Asia/Kuwait')::date);
 if p_action='post' then
  select * into a from private.aqari_partner_source_approvals where workspace_id=w and id=(d->>'source_id')::uuid;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if a.review_hash is distinct from d->>'review_hash' or exists(select 1 from private.aqari_partner_source_approvals newer where newer.workspace_id=w and newer.property_id=a.property_id and newer.month=a.month and newer.review_revision>a.review_revision) then raise serialization_failure using message='PARTNER_REVIEW_STALE';end if;
  select * into src from private.aqari_partner_period_sources where workspace_id=w and property_id=a.property_id and month=a.month;
  if not found or not src.period_matches or src.source_hash<>a.source_hash then raise exception 'PARTNER_SOURCE_REVIEW_REQUIRED' using errcode='23514';end if;
  if jsonb_array_length(private.aqari_partner_commercial_evidence(w,src.source->'payments'))>0 then raise exception 'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' using errcode='23514';end if;
  s:=app->'propertySharesV267'->a.shares_key;
  if s->'owners' is distinct from a.owners or (s->>'version')::bigint is distinct from a.shares_version or s->>'enabled' is distinct from 'true' then raise serialization_failure using message='PARTNER_SHARES_CHANGED_AFTER_REVIEW';end if;
  for x in select value from jsonb_array_elements(a.owners) loop
   if a.recipients->(x->>'id')<>'null'::jsonb and not exists(select 1 from private.aqari_partner_access pa join auth.users u on u.id=pa.user_id and lower(u.email)=pa.email
    where pa.workspace_id=w and pa.property_id=a.property_id and pa.is_active and u.email_confirmed_at is not null and pa.user_id=(a.recipients->>(x->>'id'))::uuid
    and not exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=pa.user_id)) then raise exception 'PARTNER_RECIPIENT_ACCESS_REQUIRED' using errcode='23514';end if;
  end loop;
  perform 1 from public.aqari_documents doc join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
   where doc.id=a.document_id and to_jsonb(doc)=a.document_snapshot and doc.status='uploaded' and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type for share of doc,o;
  if not found then raise exception 'PARTNER_DOCUMENT_UNVERIFIED' using errcode='23514';end if;
  if exists(select 1 from private.aqari_partner_distributions where workspace_id=w and property_id=a.property_id and month=a.month and kind='distribution') then raise exception 'PARTNER_PERIOD_ALREADY_DISTRIBUTED' using errcode='23514';end if;
  v:=private.aqari_partner_allocate(a.net_fils,a.owners,a.recipients);
  insert into private.aqari_partner_distributions(id,workspace_id,source_id,property_id,month,kind,occurred_on,net_fils,allocations,review_hash,reason,actor_id,request_hash)
  values(ident,w,a.id,a.property_id,a.month,'distribution',(now() at time zone 'Asia/Kuwait')::date,a.net_fils,v,a.review_hash,why,auth.uid(),rh) returning * into e;
 else
  select * into original from private.aqari_partner_distributions where workspace_id=w and id=(d->>'distribution_id')::uuid and kind='distribution';
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if exists(select 1 from private.aqari_partner_distributions where reverses_id=original.id) then raise exception 'PARTNER_ALREADY_REVERSED' using errcode='23514';end if;
  select jsonb_agg(x||jsonb_build_object('amount_fils',(-(x->>'amount_fils')::bigint)::text) order by (x->>'owner_id')collate "C") into v from jsonb_array_elements(original.allocations)x;
  insert into private.aqari_partner_distributions(id,workspace_id,source_id,property_id,month,kind,reverses_id,occurred_on,net_fils,allocations,review_hash,reason,actor_id,request_hash)
   values(ident,w,original.source_id,original.property_id,original.month,'reversal',original.id,(now() at time zone 'Asia/Kuwait')::date,-original.net_fils,v,original.review_hash,why,auth.uid(),rh) returning * into e;
 end if;
 return to_jsonb(e);
end$$;

-- Approval metadata remains immutable. Existing Storage RLS permits upload of
-- draft files only, with no object UPDATE/DELETE policy. Approval and posting
-- read-lock matching object metadata; no managed Storage schema trigger is added.
create or replace function private.aqari_partner_document_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.aqari_partner_source_approvals where document_id=old.id) and (tg_op='DELETE' or to_jsonb(old) is distinct from to_jsonb(new)) then raise exception 'PARTNER_DOCUMENT_IMMUTABLE' using errcode='23514';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
revoke all on function private.aqari_partner_document_guard() from public,anon,authenticated;
drop trigger if exists aqari_partner_document_immutable on public.aqari_documents;
create trigger aqari_partner_document_immutable before update or delete on public.aqari_documents for each row execute function private.aqari_partner_document_guard();

-- Once a property enters the reviewed server register its legacy financial events
-- cannot be extended. Existing events and every ownership event remain unchanged.
create or replace function private.aqari_partner_legacy_distribution_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;before_state jsonb;after_state jsonb;x jsonb;n integer;
begin
 for k in select distinct a.shares_key from private.aqari_partner_source_approvals a where a.workspace_id=new.workspace_id loop
  before_state:=private.aqari_unwrap(old.payload)->'propertySharesV267'->k;
  after_state:=private.aqari_unwrap(new.payload)->'propertySharesV267'->k;
  if before_state is not distinct from after_state then continue;end if;
  n:=coalesce(jsonb_array_length(before_state->'events'),0);
  for x in select value from jsonb_array_elements(after_state->'events') with ordinality r(value,ord) where ord>n loop
   if x->>'type' in('distribution','payment') then raise exception 'PARTNER_SERVER_REGISTER_REQUIRED' using errcode='23514';end if;
  end loop;
 end loop;return new;
end$$;
revoke all on function private.aqari_partner_legacy_distribution_guard() from public,anon,authenticated;
drop trigger if exists aqari_zz_partner_distribution_guard on public.aqari_app_state;
create trigger aqari_zz_partner_distribution_guard before update of payload on public.aqari_app_state for each row execute function private.aqari_partner_legacy_distribution_guard();

create or replace function private.aqari_partner_distribution_statement(p_property_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w uuid;email_address text;result jsonb;begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select lower(email) into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select a.workspace_id into w from private.aqari_partner_access a where a.property_id=p_property_id and a.user_id=auth.uid() and a.email=email_address and a.is_active
 and not exists(select 1 from public.aqari_memberships m where m.workspace_id=a.workspace_id and m.user_id=auth.uid());
 if w is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month not between date '2000-01-01' and date '2100-12-01' then raise exception 'INVALID_PARTNER_MONTH' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'reverses_id',e.reverses_id,'occurred_on',e.occurred_on,'recorded_at',e.recorded_at,'owner_id',x->>'owner_id','name',x->>'name','bps',x->'bps','amount_fils',x->>'amount_fils') order by e.recorded_at,e.id),'[]') into result
 from private.aqari_partner_distributions e cross join lateral jsonb_array_elements(e.allocations)x
 where e.workspace_id=w and e.property_id=p_property_id and e.month=p_month and x->>'recipient_user_id'=auth.uid()::text;
 return jsonb_build_object('user_id',auth.uid(),'workspace_id',w,'property_id',p_property_id,'month',p_month,'currency','KWD','entries',result,
 'balance_fils',(select coalesce(sum((x->>'amount_fils')::numeric),0)::text from jsonb_array_elements(result)x));
end$$;
revoke all on function private.aqari_partner_hash(jsonb),private.aqari_partner_allocate(bigint,jsonb,jsonb),private.aqari_capture_partner_period(),private.aqari_partner_source_date_guard() from public,anon,authenticated;
create or replace function public.aqari_partner_distribution_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.aqari_partner_distribution_register(p_workspace_id,p_action,p_data)$$;
create or replace function public.aqari_partner_distribution_statement(p_property_id uuid,p_month date)
returns jsonb language sql stable security invoker set search_path='' as $$select private.aqari_partner_distribution_statement(p_property_id,p_month)$$;
revoke all on function private.aqari_partner_distribution_register(uuid,text,jsonb),private.aqari_partner_distribution_statement(uuid,date) from public,anon,authenticated;
grant execute on function private.aqari_partner_distribution_register(uuid,text,jsonb),private.aqari_partner_distribution_statement(uuid,date) to authenticated;
revoke all on function public.aqari_partner_distribution_register(uuid,text,jsonb),public.aqari_partner_distribution_statement(uuid,date) from public,anon,authenticated;
grant execute on function public.aqari_partner_distribution_register(uuid,text,jsonb),public.aqari_partner_distribution_statement(uuid,date) to authenticated;
commit;
