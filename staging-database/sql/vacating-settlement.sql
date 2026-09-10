-- V267 isolated Staging only. Final vacating settlement and clearance are server-authoritative.
-- Clearance is blocked while rent, tenant credit, deposit, keys, inspection, meters, or damages remain unresolved,
-- unless a general manager records an explicit exception reason. Private tables are never exposed directly.
begin;
create table if not exists private.aqari_vacating_settlements(
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 vacate_date date not null,
 keys_returned boolean not null default false,
 inspection_completed boolean not null default false,
 meters_recorded boolean not null default false,
 damage_amount numeric(15,3) not null default 0 check(damage_amount>=0),
 damage_notes text not null default '' check(length(damage_notes)<=1000),
 charges_resolved boolean not null default false,
 charges_reference text not null default '' check(length(charges_reference)<=160),
 status text not null default 'draft' check(status in('draft','finalized','cleared')),
 revision bigint not null default 1,
 created_by uuid not null,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 finalized_by uuid,
 finalized_by_name text,
 finalized_at timestamptz,
 settlement_no text unique,
 settlement_snapshot jsonb,
 clearance_by uuid,
 clearance_by_name text,
 clearance_at timestamptz,
 clearance_no text unique,
 clearance_snapshot jsonb,
 exception_reason text not null default '' check(length(exception_reason)<=1000),
 primary key(workspace_id,lease_id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 check(jsonb_typeof(settlement_snapshot)='object' or settlement_snapshot is null),
 check(jsonb_typeof(clearance_snapshot)='object' or clearance_snapshot is null)
);
alter table private.aqari_vacating_settlements enable row level security;
revoke all on private.aqari_vacating_settlements from public,anon,authenticated;
create sequence if not exists private.aqari_vacating_settlement_seq;
create sequence if not exists private.aqari_clearance_seq;
revoke all on sequence private.aqari_vacating_settlement_seq from public,anon,authenticated;
revoke all on sequence private.aqari_clearance_seq from public,anon,authenticated;

create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases; due_total numeric:=0;paid_total numeric:=0;deposit_balance numeric:=0;period_start date;period_end date;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 if l.start_date is null or l.monthly_rent is null or l.end_date is null or vdate<l.start_date then raise exception 'VACATING_INCOMPLETE_CONTRACT' using errcode='22023';end if;
 period_start:=date_trunc('month',coalesce(l.start_date,vdate))::date;
 period_end:=date_trunc('month',vdate)::date;
 if period_start<=period_end then
  select coalesce(sum(case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end),0)
  into due_total from generate_series(period_start,period_end,interval '1 month') p;
 end if;
 select coalesce(sum(p.amount),0) into paid_total from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=lid and p.status in ('paid','partial','مدفوع','جزئي');
 select coalesce(sum(case e.kind when 'receipt' then e.amount else -e.amount end),0) into deposit_balance from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=lid;
 return jsonb_build_object('rent_due_total',due_total::numeric(18,3)::text,'rent_paid_total',paid_total::numeric(18,3)::text,
  'rent_balance',greatest(due_total-paid_total,0)::numeric(18,3)::text,'tenant_credit',greatest(paid_total-due_total,0)::numeric(18,3)::text,
  'deposit_balance',deposit_balance::numeric(18,3)::text);
end $$;
revoke all on function private.aqari_vacating_balances(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.aqari_vacating_json(w uuid,lid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('lease_id',l.id,'contract_no',l.contract_no,'tenant_id',t.id,'tenant_name',t.full_name,
  'property_id',p.id,'property_name',p.name,'unit_id',u.id,'unit_no',u.unit_no,'lease_status',l.status,
  'start_date',l.start_date,'end_date',l.end_date,'vacate_date',s.vacate_date,'keys_returned',s.keys_returned,
  'inspection_completed',s.inspection_completed,'meters_recorded',s.meters_recorded,'damage_amount',s.damage_amount::text,
  'damage_notes',s.damage_notes,'charges_resolved',s.charges_resolved,'charges_reference',s.charges_reference,
  'status',s.status,'revision',s.revision,'settlement_no',s.settlement_no,'settlement_snapshot',s.settlement_snapshot,
  'clearance_no',s.clearance_no,'clearance_snapshot',s.clearance_snapshot,'exception_reason',s.exception_reason,
  'created_at',s.created_at,'updated_at',s.updated_at,'finalized_at',s.finalized_at,'clearance_at',s.clearance_at,
  'balances',private.aqari_vacating_balances(w,lid,s.vacate_date))
 from public.aqari_leases l join public.aqari_tenants t on t.workspace_id=w and t.id=l.tenant_id
 join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
 join private.aqari_vacating_settlements s on s.workspace_id=w and s.lease_id=l.id
 where l.workspace_id=w and l.id=lid
$$;
revoke all on function private.aqari_vacating_json(uuid,uuid) from public,anon,authenticated;

create or replace function public.aqari_vacating_settlement(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}');action text:=p_action;k text;allowed text[];lid uuid;s private.aqari_vacating_settlements;l public.aqari_leases;
 vdate date;damage numeric;why text;ref text;revision_value bigint;balances jsonb;actor text;snapshot jsonb;rows jsonb;leases jsonb;seq text;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') or not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>12000 then raise exception 'VACATING_INVALID_DATA' using errcode='22023';end if;
 allowed:=case action when 'list' then array[]::text[] when 'get' then array['lease_id']
  when 'save' then array['lease_id','vacate_date','keys_returned','inspection_completed','meters_recorded','damage_amount','damage_notes','charges_resolved','charges_reference','revision']
  when 'finalize' then array['lease_id','revision'] when 'clearance' then array['lease_id','revision','exception_reason'] else null end;
 if allowed is null then raise exception 'VACATING_UNKNOWN_ACTION' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not(k=any(allowed)) then raise exception 'VACATING_UNKNOWN_FIELD' using errcode='22023';end if;end loop;
 if action='list' then
  if (select count(*) from public.aqari_leases where workspace_id=w)>2000 then raise exception 'VACATING_LIST_LIMIT' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'tenant_name',t.full_name,'property_name',p.name,'unit_no',u.unit_no,'status',l.status) order by l.contract_no),'[]') into leases
  from public.aqari_leases l join public.aqari_tenants t on t.workspace_id=w and t.id=l.tenant_id join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
  where l.workspace_id=w and private.aqari_can_lease(w,l.id,'contracts','read') and private.aqari_can_lease(w,l.id,'collections','read');
  select coalesce(jsonb_agg(private.aqari_vacating_json(w,x.lease_id) order by x.updated_at desc),'[]') into rows from private.aqari_vacating_settlements x where x.workspace_id=w and private.aqari_can_lease(w,x.lease_id,'contracts','read') and private.aqari_can_lease(w,x.lease_id,'collections','read');
  return jsonb_build_object('manager',private.aqari_manager(w),'leases',leases,'settlements',rows);
 end if;
 if jsonb_typeof(d->'lease_id') is distinct from 'string' then raise exception 'VACATING_INVALID_LEASE' using errcode='22023';end if;
 lid:=(d->>'lease_id')::uuid;
 if not private.aqari_can_lease(w,lid,'contracts',case when action in('save','finalize','clearance') then 'write' else 'read' end) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='get' then
  if not exists(select 1 from private.aqari_vacating_settlements x where x.workspace_id=w and x.lease_id=lid) then return jsonb_build_object('settlement',null,'balances',null);end if;
  return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid));
 end if;
 -- Serialize evidence changes in the same workspace-before-lease order as deposits.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'VACATING_WORKSPACE_UNAVAILABLE' using errcode='22023';end if;
 perform 1 from public.aqari_leases where workspace_id=w and id=lid for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='save' then
  if not private.aqari_can(w,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if jsonb_typeof(d->'vacate_date') is distinct from 'string' or d->>'vacate_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'VACATING_INVALID_DATE' using errcode='22023';end if;
  vdate:=(d->>'vacate_date')::date;
  select * into l from public.aqari_leases where workspace_id=w and id=lid for update;
  if not found or l.status<>'signed' or l.start_date is null or vdate<l.start_date or vdate>(now() at time zone 'Asia/Kuwait')::date then raise exception 'VACATING_INVALID_DATE' using errcode='22023';end if;
  if jsonb_typeof(d->'keys_returned') is distinct from 'boolean' or jsonb_typeof(d->'inspection_completed') is distinct from 'boolean' or jsonb_typeof(d->'meters_recorded') is distinct from 'boolean' or jsonb_typeof(d->'charges_resolved') is distinct from 'boolean' then raise exception 'VACATING_INVALID_CHECKLIST' using errcode='22023';end if;
  if jsonb_typeof(d->'damage_amount') is distinct from 'string' or d->>'damage_amount' !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise exception 'VACATING_INVALID_DAMAGE' using errcode='22023';end if;
  damage:=(d->>'damage_amount')::numeric;why:=btrim(coalesce(d->>'damage_notes',''));ref:=btrim(coalesce(d->>'charges_reference',''));
  if length(why)>1000 or (damage>0 and length(why)<3) or length(ref)>160 or ((d->>'charges_resolved')::boolean and length(ref)<3) then raise exception 'VACATING_INVALID_DAMAGE' using errcode='22023';end if;
  revision_value:=coalesce((d->>'revision')::bigint,0);
  insert into private.aqari_vacating_settlements(workspace_id,lease_id,vacate_date,keys_returned,inspection_completed,meters_recorded,damage_amount,damage_notes,charges_resolved,charges_reference,created_by,updated_by)
  values(w,lid,vdate,(d->>'keys_returned')::boolean,(d->>'inspection_completed')::boolean,(d->>'meters_recorded')::boolean,damage,why,(d->>'charges_resolved')::boolean,ref,auth.uid(),auth.uid())
  on conflict(workspace_id,lease_id) do update set vacate_date=excluded.vacate_date,keys_returned=excluded.keys_returned,inspection_completed=excluded.inspection_completed,meters_recorded=excluded.meters_recorded,
   damage_amount=excluded.damage_amount,damage_notes=excluded.damage_notes,charges_resolved=excluded.charges_resolved,charges_reference=excluded.charges_reference,updated_by=auth.uid(),updated_at=now(),revision=private.aqari_vacating_settlements.revision+1
   where private.aqari_vacating_settlements.status='draft' and private.aqari_vacating_settlements.revision=revision_value;
  if not found then raise exception 'VACATING_REVISION_CONFLICT' using errcode='22023';end if;
  return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid));
 end if;
 if not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 select * into s from private.aqari_vacating_settlements where workspace_id=w and lease_id=lid for update;
 if not found then raise exception 'VACATING_DRAFT_REQUIRED' using errcode='22023';end if;
 revision_value:=coalesce((d->>'revision')::bigint,0);if s.revision<>revision_value then raise exception 'VACATING_REVISION_CONFLICT' using errcode='22023';end if;
 if action='finalize' then
  if s.status<>'draft' then return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid));end if;
  if not s.keys_returned or not s.inspection_completed or not s.meters_recorded then raise exception 'VACATING_CHECKLIST_OPEN' using errcode='22023';end if;
  if not s.charges_resolved or length(btrim(s.charges_reference))<3 then raise exception 'VACATING_DAMAGE_OPEN' using errcode='22023';end if;
  balances:=private.aqari_vacating_balances(w,lid,s.vacate_date);
  select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
  seq:=nextval('private.aqari_vacating_settlement_seq')::text;
  snapshot:=private.aqari_vacating_json(w,lid)||jsonb_build_object('final_balances',balances,'finalized_by',coalesce(actor,auth.uid()::text));
  update private.aqari_vacating_settlements set status='finalized',revision=revision+1,updated_by=auth.uid(),updated_at=now(),finalized_by=auth.uid(),finalized_by_name=coalesce(actor,auth.uid()::text),finalized_at=now(),
   settlement_no='VS-'||to_char(s.vacate_date,'YYYYMMDD')||'-'||lpad(seq,8,'0'),settlement_snapshot=snapshot where workspace_id=w and lease_id=lid;
  return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid));
 end if;
 if s.status='cleared' then return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid));end if;
 if s.status<>'finalized' then raise exception 'VACATING_FINALIZE_REQUIRED' using errcode='22023';end if;
 why:=btrim(coalesce(d->>'exception_reason',''));if length(why)>1000 then raise exception 'VACATING_INVALID_EXCEPTION' using errcode='22023';end if;
 balances:=private.aqari_vacating_balances(w,lid,s.vacate_date);
 if ((balances->>'rent_balance')::numeric>0 or (balances->>'tenant_credit')::numeric>0 or (balances->>'deposit_balance')::numeric>0 or (s.damage_amount>0 and not s.charges_resolved)) and length(why)<10 then raise exception 'VACATING_OUTSTANDING_BALANCE' using errcode='22023';end if;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 seq:=nextval('private.aqari_clearance_seq')::text;
 snapshot:=coalesce(s.settlement_snapshot,'{}')||jsonb_build_object('clearance_balances',balances,'exception_reason',why,'clearance_by',coalesce(actor,auth.uid()::text),'issued_at',now());
 update private.aqari_vacating_settlements set status='cleared',revision=revision+1,updated_by=auth.uid(),updated_at=now(),clearance_by=auth.uid(),clearance_by_name=coalesce(actor,auth.uid()::text),clearance_at=now(),
  clearance_no='CL-'||to_char((now() at time zone 'Asia/Kuwait')::date,'YYYYMMDD')||'-'||lpad(seq,8,'0'),clearance_snapshot=snapshot,exception_reason=why where workspace_id=w and lease_id=lid;
 return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid));
end $$;
revoke all on function public.aqari_vacating_settlement(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_vacating_settlement(uuid,text,jsonb) to authenticated;
commit;