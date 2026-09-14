-- AQARI V267 isolated trial: close the contract execution serial/artifact guarantees.
-- This migration is additive and is intended for the isolated myaqari.com trial data source only.
begin;

create table if not exists private.aqari_global_serial_counters(
 kind text not null check(kind in ('contract','rent_receipt')),
 year integer not null check(year between 2000 and 2200),
 last_value bigint not null check(last_value >= 0),
 primary key(kind,year)
);
alter table private.aqari_global_serial_counters enable row level security;
revoke all on private.aqari_global_serial_counters from public,anon,authenticated;

create table if not exists private.aqari_contract_serial_reservations(
 contract_no text primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 contract_ref text not null,
 year integer not null check(year between 2000 and 2200),
 serial bigint not null check(serial > 0),
 reserved_by uuid not null,
 reserved_at timestamptz not null default now(),
 consumed_at timestamptz,
 unique(workspace_id,contract_ref),
 unique(year,serial)
);
alter table private.aqari_contract_serial_reservations enable row level security;
revoke all on private.aqari_contract_serial_reservations from public,anon,authenticated;

create table if not exists private.aqari_rent_receipt_serial_reservations(
 receipt_no text primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 contract_ref text not null,
 operation_ref uuid not null unique,
 year integer not null check(year between 2000 and 2200),
 global_serial bigint not null check(global_serial > 0),
 contract_sequence integer not null check(contract_sequence > 0),
 reserved_by uuid not null,
 reserved_at timestamptz not null default now(),
 consumed_at timestamptz,
 unique(year,global_serial),
 unique(workspace_id,contract_ref,contract_sequence)
);
alter table private.aqari_rent_receipt_serial_reservations enable row level security;
revoke all on private.aqari_rent_receipt_serial_reservations from public,anon,authenticated;

-- Existing trial rows are checked before this migration is applied. These indexes
-- make both identifiers unique across the database, not merely per workspace.
create unique index if not exists aqari_leases_contract_no_platform_unique
 on public.aqari_leases(lower(contract_no));
create unique index if not exists aqari_rent_payments_reference_platform_unique
 on public.aqari_rent_payments(lower(reference));

-- Seed server counters above any already issued AQARI serials so a newly reserved
-- number can never collide with an existing persisted contract or receipt.
insert into private.aqari_global_serial_counters(kind,year,last_value)
select 'contract', (m)[1]::integer, max((m)[2]::bigint)
from public.aqari_leases l
cross join lateral regexp_match(l.contract_no,'^AQ-C-([0-9]{4})-([0-9]+)$','i') m
group by (m)[1]::integer
on conflict(kind,year) do update set last_value=greatest(private.aqari_global_serial_counters.last_value,excluded.last_value);

insert into private.aqari_global_serial_counters(kind,year,last_value)
select 'rent_receipt', (m)[1]::integer, max((m)[2]::bigint)
from public.aqari_rent_payments p
cross join lateral regexp_match(p.reference,'^AQ-R-([0-9]{4})-([0-9]+)$','i') m
group by (m)[1]::integer
on conflict(kind,year) do update set last_value=greatest(private.aqari_global_serial_counters.last_value,excluded.last_value);

create or replace function public.aqari_reserve_contract_serial(
 p_workspace_id uuid,
 p_contract_ref text,
 p_year integer
) returns text
language plpgsql security definer set search_path='' as $$
declare existing_no text; seq bigint; result_no text;
begin
 if auth.uid() is null
  or not private.aqari_can(p_workspace_id,'contracts','write')
  or btrim(coalesce(p_contract_ref,''))=''
  or length(p_contract_ref)>200
  or p_contract_ref ~ '[[:cntrl:]]'
  or p_year <> extract(year from (now() at time zone 'Asia/Kuwait'))::integer
 then raise exception 'CONTRACT_SERIAL_ACCESS_DENIED' using errcode='42501';end if;

 select r.contract_no into existing_no
 from private.aqari_contract_serial_reservations r
 where r.workspace_id=p_workspace_id and r.contract_ref=p_contract_ref;
 if existing_no is not null then return existing_no;end if;

 insert into private.aqari_global_serial_counters(kind,year,last_value)
 values('contract',p_year,0) on conflict(kind,year) do nothing;
 update private.aqari_global_serial_counters
 set last_value=last_value+1
 where kind='contract' and year=p_year
 returning last_value into seq;
 if seq is null then raise exception 'CONTRACT_SERIAL_UNAVAILABLE';end if;
 result_no:='AQ-C-'||p_year::text||'-'||lpad(seq::text,6,'0');
 insert into private.aqari_contract_serial_reservations(contract_no,workspace_id,contract_ref,year,serial,reserved_by)
 values(result_no,p_workspace_id,p_contract_ref,p_year,seq,auth.uid());
 return result_no;
end $$;
revoke all on function public.aqari_reserve_contract_serial(uuid,text,integer) from public,anon;
grant execute on function public.aqari_reserve_contract_serial(uuid,text,integer) to authenticated;

create or replace function public.aqari_reserve_rent_receipt_serial(
 p_workspace_id uuid,
 p_contract_ref text,
 p_operation_ref uuid,
 p_year integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row_data private.aqari_rent_receipt_serial_reservations%rowtype; seq bigint; within_contract integer; result_no text;
begin
 if auth.uid() is null
  or not private.aqari_manager(p_workspace_id)
  or not private.aqari_can(p_workspace_id,'collections','write')
  or btrim(coalesce(p_contract_ref,''))=''
  or length(p_contract_ref)>200
  or p_contract_ref ~ '[[:cntrl:]]'
  or p_operation_ref is null
  or p_year <> extract(year from (now() at time zone 'Asia/Kuwait'))::integer
 then raise exception 'RECEIPT_SERIAL_ACCESS_DENIED' using errcode='42501';end if;

 select * into row_data from private.aqari_rent_receipt_serial_reservations where operation_ref=p_operation_ref;
 if found then
  if row_data.workspace_id<>p_workspace_id or row_data.contract_ref<>p_contract_ref then raise exception 'RECEIPT_SERIAL_SCOPE_MISMATCH' using errcode='23514';end if;
  return jsonb_build_object('receipt_no',row_data.receipt_no,'contract_sequence',row_data.contract_sequence,'operation_ref',row_data.operation_ref);
 end if;
 if not exists(select 1 from public.aqari_leases l where l.workspace_id=p_workspace_id and l.external_ref=p_contract_ref and l.status in ('signing','signed')) then
  raise exception 'RECEIPT_SERIAL_ACTIVE_CONTRACT_REQUIRED' using errcode='23514';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':rent-receipt:'||p_contract_ref,0));
 select coalesce(max(r.contract_sequence),0)+1 into within_contract
 from private.aqari_rent_receipt_serial_reservations r
 where r.workspace_id=p_workspace_id and r.contract_ref=p_contract_ref;
 insert into private.aqari_global_serial_counters(kind,year,last_value)
 values('rent_receipt',p_year,0) on conflict(kind,year) do nothing;
 update private.aqari_global_serial_counters
 set last_value=last_value+1
 where kind='rent_receipt' and year=p_year
 returning last_value into seq;
 if seq is null then raise exception 'RECEIPT_SERIAL_UNAVAILABLE';end if;
 result_no:='AQ-R-'||p_year::text||'-'||lpad(seq::text,8,'0');
 insert into private.aqari_rent_receipt_serial_reservations(receipt_no,workspace_id,contract_ref,operation_ref,year,global_serial,contract_sequence,reserved_by)
 values(result_no,p_workspace_id,p_contract_ref,p_operation_ref,p_year,seq,within_contract,auth.uid())
 returning * into row_data;
 return jsonb_build_object('receipt_no',row_data.receipt_no,'contract_sequence',row_data.contract_sequence,'operation_ref',row_data.operation_ref);
end $$;
revoke all on function public.aqari_reserve_rent_receipt_serial(uuid,text,uuid,integer) from public,anon;
grant execute on function public.aqari_reserve_rent_receipt_serial(uuid,text,uuid,integer) to authenticated;

create table if not exists private.aqari_contract_execution_artifacts(
 settlement_id uuid primary key references private.aqari_contract_execution_settlements(id),
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 contract_ref text not null,
 contract_no text not null,
 tenant_document_id uuid not null,
 owner_document_id uuid not null,
 rent_receipt_no text not null default '',
 contract_receipt_sequence integer,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,tenant_document_id),
 unique(workspace_id,owner_document_id),
 check((rent_receipt_no='' and contract_receipt_sequence is null) or (rent_receipt_no<>'' and contract_receipt_sequence>0))
);
alter table private.aqari_contract_execution_artifacts enable row level security;
revoke all on private.aqari_contract_execution_artifacts from public,anon,authenticated;
create trigger aqari_contract_execution_artifacts_immutable
 before update or delete on private.aqari_contract_execution_artifacts
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_project_contract_execution_artifacts() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 old_d jsonb:=private.aqari_unwrap(old.payload); new_d jsonb:=private.aqari_unwrap(new.payload);
 old_rows jsonb; new_rows jsonb; e jsonb; c jsonb;
 settlement private.aqari_contract_execution_settlements%rowtype;
 lease public.aqari_leases%rowtype;
 reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 canonical_title text; canonical_body text; canonical_payload jsonb; canonical_template integer;
 tenant_id uuid; tenant_version uuid; tenant_event uuid; owner_id uuid; owner_version uuid; owner_event uuid;
 tenant_title text; tenant_body text; tenant_payload jsonb; tenant_hash text;
 owner_title text; owner_body text; owner_payload jsonb; owner_hash text;
 receipt_sequence integer; property_id uuid;
begin
 old_rows:=coalesce(old_d->'contractExecutionSettlementsV267','[]'::jsonb);
 new_rows:=coalesce(new_d->'contractExecutionSettlementsV267','[]'::jsonb);
 if jsonb_typeof(old_rows)<>'array' or jsonb_typeof(new_rows)<>'array' then return null;end if;

 for e in select value from jsonb_array_elements(new_rows) n where not exists(select 1 from jsonb_array_elements(old_rows) o where o=n) loop
  select * into strict settlement from private.aqari_contract_execution_settlements s
   where s.workspace_id=new.workspace_id and s.id=(e->>'id')::uuid;
  select * into strict lease from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=settlement.lease_id;
  select value into strict c from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) x where x->>'id'=settlement.contract_ref;

  -- The lease table now enforces platform-wide uniqueness. New contracts also
  -- use the server reservation RPC; older trial drafts are accepted only if
  -- their already-persisted number is still globally unique.
  if settlement.contract_no is distinct from lease.contract_no or c->>'contract_no' is distinct from settlement.contract_no then
   raise exception 'CONTRACT_SERIAL_MISMATCH' using errcode='23514';
  end if;
  update private.aqari_contract_serial_reservations r set consumed_at=coalesce(r.consumed_at,now())
   where r.workspace_id=new.workspace_id and r.contract_ref=settlement.contract_ref and r.contract_no=settlement.contract_no;

  if settlement.rent_amount>0 then
   receipt_sequence:=nullif(e->>'contractReceiptSequence','')::integer;
   select * into strict reservation from private.aqari_rent_receipt_serial_reservations r
    where r.receipt_no=settlement.rent_receipt_no and r.operation_ref=settlement.id;
   if reservation.workspace_id<>new.workspace_id or reservation.contract_ref<>settlement.contract_ref
      or reservation.contract_sequence<>receipt_sequence or reservation.consumed_at is not null then
    raise exception 'RECEIPT_SERIAL_RESERVATION_MISMATCH' using errcode='23514';
   end if;
   update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=reservation.receipt_no;
  else
   if coalesce(e->>'contractReceiptSequence','')<>'' then raise exception 'ZERO_RENT_RECEIPT_SEQUENCE_FORBIDDEN' using errcode='23514';end if;
   receipt_sequence:=null;
  end if;

  select v.title,v.body,v.payload,v.template_version
   into strict canonical_title,canonical_body,canonical_payload,canonical_template
  from private.aqari_official_document_series s
  join private.aqari_official_document_versions v on v.workspace_id=s.workspace_id and v.series_id=s.id and v.version=1
  where s.workspace_id=new.workspace_id and s.id=settlement.contract_document_id and s.status='issued';

  tenant_id:=extensions.gen_random_uuid();tenant_version:=extensions.gen_random_uuid();tenant_event:=extensions.gen_random_uuid();
  owner_id:=extensions.gen_random_uuid();owner_version:=extensions.gen_random_uuid();owner_event:=extensions.gen_random_uuid();
  tenant_title:=canonical_title||' — نسخة المستأجر';tenant_body:='نسخة المستأجر'||E'\n'||canonical_body;
  tenant_payload:=canonical_payload||jsonb_build_object('copyRole','tenant','copyLabelAr','نسخة المستأجر','canonicalSeriesId',settlement.contract_document_id,'contractNo',settlement.contract_no);
  tenant_hash:=pg_catalog.encode(extensions.digest(tenant_title||E'\n'||tenant_body||E'\n'||tenant_payload::text,'sha256'),'hex');
  owner_title:=canonical_title||' — نسخة المالك / الإدارة';owner_body:='نسخة المالك / الإدارة'||E'\n'||canonical_body;
  owner_payload:=canonical_payload||jsonb_build_object('copyRole','owner','copyLabelAr','نسخة المالك / الإدارة','canonicalSeriesId',settlement.contract_document_id,'contractNo',settlement.contract_no);
  owner_hash:=pg_catalog.encode(extensions.digest(owner_title||E'\n'||owner_body||E'\n'||owner_payload::text,'sha256'),'hex');

  insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
   values
    (tenant_id,new.workspace_id,'rental_contract','CT-'||settlement.contract_no||'-TENANT','lease',lease.id,'issued',1,auth.uid()),
    (owner_id,new.workspace_id,'rental_contract','CT-'||settlement.contract_no||'-OWNER','lease',lease.id,'issued',1,auth.uid());
  insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
   values
    (tenant_version,new.workspace_id,tenant_id,1,canonical_template,tenant_title,tenant_body,tenant_payload,tenant_hash,auth.uid(),settlement.created_by_name),
    (owner_version,new.workspace_id,owner_id,1,canonical_template,owner_title,owner_body,owner_payload,owner_hash,auth.uid(),settlement.created_by_name);
  insert into private.aqari_official_document_events(id,workspace_id,series_id,action,reason,actor_id,details)
   values
    (tenant_event,new.workspace_id,tenant_id,'issue','نسخة المستأجر التلقائية بعد اعتماد العقد',auth.uid(),jsonb_build_object('version',1,'hash',tenant_hash,'execution_settlement_id',settlement.id)),
    (owner_event,new.workspace_id,owner_id,'issue','نسخة المالك / الإدارة التلقائية بعد اعتماد العقد',auth.uid(),jsonb_build_object('version',1,'hash',owner_hash,'execution_settlement_id',settlement.id));

  insert into private.aqari_contract_execution_artifacts(settlement_id,workspace_id,lease_id,contract_ref,contract_no,tenant_document_id,owner_document_id,rent_receipt_no,contract_receipt_sequence,created_by)
   values(settlement.id,new.workspace_id,lease.id,settlement.contract_ref,settlement.contract_no,tenant_id,owner_id,settlement.rent_receipt_no,receipt_sequence,auth.uid());

  select u.property_id into property_id from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=lease.unit_id;
  insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,after_value)
   values(new.workspace_id,property_id,settlement.id::text,'contract_execution_artifacts_issued',auth.uid(),settlement.created_by_name,'إصدار نسختي العقد وربط تسلسل الوصل',jsonb_build_object('contract_no',settlement.contract_no,'tenant_document_id',tenant_id,'owner_document_id',owner_id,'rent_receipt_no',settlement.rent_receipt_no,'contract_receipt_sequence',receipt_sequence));
 end loop;
 return null;
end $$;
revoke all on function private.aqari_project_contract_execution_artifacts() from public,anon,authenticated;
drop trigger if exists zzzz_v267_contract_execution_artifacts on public.aqari_app_state;
create trigger zzzz_v267_contract_execution_artifacts
 after update of payload on public.aqari_app_state
 for each row execute function private.aqari_project_contract_execution_artifacts();

create or replace function public.aqari_contract_execution_artifacts(p_workspace_id uuid,p_contract_ref text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.aqari_can(p_workspace_id,'contracts','read') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select jsonb_build_object(
  'settlement_id',a.settlement_id,
  'contract_no',a.contract_no,
  'tenant_document_id',a.tenant_document_id,
  'owner_document_id',a.owner_document_id,
  'rent_receipt_no',a.rent_receipt_no,
  'contract_receipt_sequence',a.contract_receipt_sequence,
  'created_at',a.created_at
 ) into result
 from private.aqari_contract_execution_artifacts a
 where a.workspace_id=p_workspace_id and a.contract_ref=p_contract_ref;
 if result is null then raise exception 'CONTRACT_EXECUTION_ARTIFACTS_NOT_FOUND' using errcode='P0002';end if;
 return result;
end $$;
revoke all on function public.aqari_contract_execution_artifacts(uuid,text) from public,anon;
grant execute on function public.aqari_contract_execution_artifacts(uuid,text) to authenticated;

commit;
