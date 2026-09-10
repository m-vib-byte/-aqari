-- V267 isolated Staging only. Authoritative post-clearance lease termination/unit-release path.
-- Reconciles the non-conflicting safety properties from PR #71 without replacing the
-- existing versioned review, settlement, document catalogue or deposit ledger.
begin;

alter table public.aqari_leases add column if not exists vacated_on date;
alter table public.aqari_leases drop constraint if exists aqari_leases_vacated_on_check;
alter table public.aqari_leases add constraint aqari_leases_vacated_on_check
 check(vacated_on is null or (start_date is not null and end_date is not null and vacated_on>=start_date and vacated_on<=end_date));

-- Availability is derived from the effective occupancy range. The contractual end date is never shortened.
alter table public.aqari_leases drop constraint if exists aqari_leases_workspace_id_unit_id_daterange_excl;
alter table public.aqari_leases add constraint aqari_leases_workspace_id_unit_id_daterange_excl
 exclude using gist(workspace_id with =,unit_id with =,daterange(start_date,coalesce(vacated_on,end_date),'[]') with &&)
 where(status<>'cancelled');

alter table private.aqari_vacating_settlements add column if not exists released_by uuid;
alter table private.aqari_vacating_settlements add column if not exists released_by_name text;
alter table private.aqari_vacating_settlements add column if not exists released_at timestamptz;
alter table private.aqari_vacating_settlements add column if not exists release_snapshot jsonb;
alter table private.aqari_vacating_settlements drop constraint if exists aqari_vacating_settlements_status_check;
alter table private.aqari_vacating_settlements add constraint aqari_vacating_settlements_status_check
 check(status in('draft','finalized','cleared','released'));
alter table private.aqari_vacating_settlements drop constraint if exists aqari_vacating_release_snapshot_check;
alter table private.aqari_vacating_settlements add constraint aqari_vacating_release_snapshot_check
 check(jsonb_typeof(release_snapshot)='object' or release_snapshot is null);

-- Once release is issued, contractual identity and financial terms are historical evidence.
create or replace function private.aqari_released_lease_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.aqari_vacating_settlements;
begin
 select * into r from private.aqari_vacating_settlements
  where workspace_id=old.workspace_id and lease_id=old.id and status='released';
 if not found then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op='DELETE' then raise exception 'VACATING_CONTRACT_IMMUTABLE' using errcode='23514';end if;
 if new.workspace_id is distinct from old.workspace_id or new.external_ref is distinct from old.external_ref
  or new.tenant_id is distinct from old.tenant_id or new.unit_id is distinct from old.unit_id
  or new.contract_no is distinct from old.contract_no or new.start_date is distinct from old.start_date
  or new.end_date is distinct from old.end_date or new.monthly_rent is distinct from old.monthly_rent
  or new.deposit is distinct from old.deposit or new.snapshot is distinct from old.snapshot
  or new.import_source is distinct from old.import_source or new.vacated_on is distinct from r.vacate_date then
  raise exception 'VACATING_CONTRACT_IMMUTABLE' using errcode='23514';
 end if;
 new.status:='expired';new.vacated_on:=r.vacate_date;return new;
end $$;
revoke all on function private.aqari_released_lease_guard() from public,anon,authenticated;
drop trigger if exists zz_aqari_released_lease_guard on public.aqari_leases;
create trigger zz_aqari_released_lease_guard before update or delete on public.aqari_leases
 for each row execute function private.aqari_released_lease_guard();

create or replace function public.aqari_vacating_release(p_workspace_id uuid,p_lease_id uuid,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;lid uuid:=p_lease_id;expected bigint:=p_revision;
 s private.aqari_vacating_settlements;l public.aqari_leases;app public.aqari_app_state;
 actor text;balances jsonb;clearance_balances jsonb;data jsonb;contract jsonb;updated_contract jsonb;ref text;release_payload jsonb;
 deposit_json jsonb;handover_docs jsonb;open_maintenance bigint;open_utilities bigint;future_payments bigint;uncertain_payments bigint;
begin
 if auth.uid() is null or not private.aqari_manager(w)
  or not private.aqari_can_lease(w,lid,'contracts','write')
  or not private.aqari_can_lease(w,lid,'collections','read')
  or not private.aqari_can(w,'documents','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if expected is null or expected<1 then raise exception 'VACATING_INVALID_RELEASE' using errcode='22023';end if;

 -- Same lock order as financial/vacating writes.
 select * into app from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'VACATING_WORKSPACE_UNAVAILABLE' using errcode='22023';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid for update;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 select * into s from private.aqari_vacating_settlements where workspace_id=w and lease_id=lid for update;
 if not found then raise exception 'VACATING_DRAFT_REQUIRED' using errcode='22023';end if;

 -- Lost-response recovery: completed release is returned only when canonical lease still matches it.
 if s.status='released' then
  if l.status<>'expired' or l.vacated_on is distinct from s.vacate_date then
   raise exception 'VACATING_RELEASE_INCONSISTENT' using errcode='40001';
  end if;
  return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid),
   'lease',jsonb_build_object('id',l.id,'status',l.status,'vacated_on',l.vacated_on,'contract_end_date',l.end_date));
 end if;
 if s.status<>'cleared' or s.clearance_no is null or s.clearance_snapshot is null then
  raise exception 'VACATING_CLEARANCE_REQUIRED' using errcode='22023';
 end if;
 if s.revision<>expected then raise exception 'VACATING_REVISION_CONFLICT' using errcode='40001';end if;
 if l.status not in('signed','expired') then raise exception 'VACATING_ACTIVE_CONTRACT_REQUIRED' using errcode='22023';end if;
 if l.vacated_on is not null and l.vacated_on<>s.vacate_date then raise exception 'VACATING_RELEASE_INCONSISTENT' using errcode='40001';end if;

 -- Clearance is not enough if financial facts changed afterwards.
 balances:=private.aqari_vacating_balances(w,lid,s.vacate_date);
 clearance_balances:=s.clearance_snapshot->'clearance_balances';
 if clearance_balances is null or balances is distinct from clearance_balances then
  raise exception 'VACATING_RELEASE_BALANCE_CHANGED' using errcode='40001';
 end if;
 perform private.aqari_financial_open(w,s.vacate_date);

 -- PR #71 reconciliation: real handover evidence must be an uploaded immutable file with checksum.
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'document_no',d.document_no,'sha256',d.checksum_sha256,'category',d.metadata->>'document_category','purpose',d.metadata->>'purpose') order by d.created_at),'[]'::jsonb)
 into handover_docs from public.aqari_documents d
 where d.workspace_id=w and d.entity_type='lease' and d.entity_ref in(l.external_ref,l.id::text)
  and d.status='uploaded' and d.checksum_sha256 is not null and coalesce(d.size_bytes,0)>0
  and ((d.metadata->>'document_category')='vacating_inspection' or (d.metadata->>'purpose')='vacating_handover');
 if jsonb_array_length(handover_docs)=0 then raise exception 'VACATING_HANDOVER_REQUIRED' using errcode='22023';end if;

 select count(*) into open_maintenance from public.aqari_maintenance_requests m
  where m.workspace_id=w and m.lease_id=lid and m.status not in('completed','cancelled','canceled');
 if open_maintenance>0 then raise exception 'VACATING_OPEN_MAINTENANCE' using errcode='22023';end if;

 -- Conservative utility rule from PR #71: unresolved property bills are not silently assigned away.
 select count(*) into open_utilities from public.aqari_utility_entries e
  join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
  where e.workspace_id=w and e.property_id=u.property_id and e.entry_type='bill'
   and (e.amount_due is null or e.amount_paid is null or e.amount_due>e.amount_paid or e.payment_status<>'paid');
 if open_utilities>0 then raise exception 'VACATING_OPEN_UTILITIES' using errcode='22023';end if;

 select count(*) into future_payments from public.aqari_rent_payments p
  where p.workspace_id=w and p.lease_id=lid and p.period>date_trunc('month',s.vacate_date)::date
   and p.status in('مدفوع','جزئي','paid','partial');
 if future_payments>0 then raise exception 'VACATING_FUTURE_PAYMENT_REVIEW_REQUIRED' using errcode='22023';end if;
 select count(*) into uncertain_payments from public.aqari_rent_payments p
  where p.workspace_id=w and p.lease_id=lid
   and p.status not in('مدفوع','جزئي','paid','partial','cancelled','canceled','voided','ملغي','ملغى');
 if uncertain_payments>0 then raise exception 'VACATING_UNCERTAIN_PAYMENT' using errcode='22023';end if;

 deposit_json:=private.aqari_deposit_lease_json(w,lid);
 if nullif(l.snapshot->>'depositReceivedOn','') is not null and coalesce((deposit_json->>'received')::numeric,0)=0 then
  raise exception 'VACATING_DEPOSIT_HISTORY_REQUIRED' using errcode='22023';
 end if;
 if l.import_source is not null and not exists(
  select 1 from public.aqari_source_lease_reviews r where r.workspace_id=w and r.lease_id=lid and r.action='sign') then
  raise exception 'VACATING_SOURCE_REVIEW_REQUIRED' using errcode='22023';
 end if;

 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 release_payload:=jsonb_build_object(
  'lease_id',l.id,'contract_no',l.contract_no,'unit_id',l.unit_id,'original_contract_end_date',l.end_date,
  'effective_occupancy_end',s.vacate_date,'clearance_no',s.clearance_no,'clearance_snapshot',s.clearance_snapshot,
  'handover_documents',handover_docs,'open_maintenance',open_maintenance,'open_utilities',open_utilities,
  'future_confirmed_payments',future_payments,'uncertain_payments',uncertain_payments,
  'released_by',coalesce(actor,auth.uid()::text),'released_at',now());

 -- Canonical lease projection: preserve end_date, terminate occupancy and release the unit for the following day.
 update public.aqari_leases set status='expired',vacated_on=s.vacate_date where workspace_id=w and id=lid;

 -- Keep the legacy app-state projection consistent when the original contract is present there.
 data:=private.aqari_unwrap(app.payload);ref:=l.external_ref;
 select x into contract from jsonb_array_elements(coalesce(data->'contractsV202','[]'::jsonb)) x where x->>'id'=ref limit 1;
 if contract is not null then
  updated_contract:=contract||jsonb_build_object('status','expired','vacatedOn',s.vacate_date,'changeReason','vacating-clearance-release');
  data:=jsonb_set(data,'{contractsV202}',coalesce((select jsonb_agg(case when x->>'id'=ref then updated_contract else x end order by n)
   from jsonb_array_elements(coalesce(data->'contractsV202','[]'::jsonb)) with ordinality a(x,n)),'[]'::jsonb));
  update public.aqari_app_state set payload=case
   when app.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(app.payload,'{snapshot,values,aqari_v30}',data)
   when app.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(app.payload,'{values,aqari_v30}',data)
   else data end,
   revision=app.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w;
 end if;

 update private.aqari_vacating_settlements set status='released',revision=revision+1,
  released_by=auth.uid(),released_by_name=coalesce(actor,auth.uid()::text),released_at=now(),release_snapshot=release_payload,
  updated_by=auth.uid(),updated_at=now() where workspace_id=w and lease_id=lid;
 update public.aqari_notification_outbox set status='cancelled'
  where workspace_id=w and lease_id=lid and status in('awaiting_configuration','queued') and kind='rent_reminder';

 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid),
  'lease',jsonb_build_object('id',l.id,'status',l.status,'vacated_on',l.vacated_on,'contract_end_date',l.end_date),
  'handover_documents',handover_docs);
end $$;
revoke all on function public.aqari_vacating_release(uuid,uuid,bigint) from public,anon;
grant execute on function public.aqari_vacating_release(uuid,uuid,bigint) to authenticated;

commit;
