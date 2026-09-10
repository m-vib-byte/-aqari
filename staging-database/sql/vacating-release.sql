-- V267 isolated Staging only. This is the authoritative post-clearance lease termination/unit-release path.
-- It preserves the contractual end date and records a separate effective occupancy end.
begin;

alter table public.aqari_leases add column if not exists vacated_on date;
alter table public.aqari_leases drop constraint if exists aqari_leases_vacated_on_check;
alter table public.aqari_leases add constraint aqari_leases_vacated_on_check
 check(vacated_on is null or (start_date is not null and end_date is not null and vacated_on>=start_date and vacated_on<=end_date));

-- Availability is derived from the effective occupancy range. The original end_date is never shortened.
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

create or replace function public.aqari_vacating_release(p_workspace_id uuid,p_lease_id uuid,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;lid uuid:=p_lease_id;expected bigint:=p_revision;
 s private.aqari_vacating_settlements;l public.aqari_leases;app public.aqari_app_state;
 actor text;balances jsonb;clearance_balances jsonb;data jsonb;contract jsonb;updated_contract jsonb;ref text;release_snapshot jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w)
  or not private.aqari_can_lease(w,lid,'contracts','write')
  or not private.aqari_can_lease(w,lid,'collections','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if expected is null or expected<1 then raise exception 'VACATING_INVALID_RELEASE' using errcode='22023';end if;

 -- Keep the same lock order used by financial/vacating writes.
 select * into app from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'VACATING_WORKSPACE_UNAVAILABLE' using errcode='22023';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid for update;
 if not found then raise exception 'VACATING_LEASE_NOT_FOUND' using errcode='22023';end if;
 select * into s from private.aqari_vacating_settlements where workspace_id=w and lease_id=lid for update;
 if not found then raise exception 'VACATING_DRAFT_REQUIRED' using errcode='22023';end if;

 -- Lost-response recovery: an already completed release is returned only if the canonical lease matches it.
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

 -- Refuse release if financial facts changed after clearance. An explicit clearance exception remains visible,
 -- but the recorded balances themselves must still match the immutable clearance snapshot.
 balances:=private.aqari_vacating_balances(w,lid,s.vacate_date);
 clearance_balances:=s.clearance_snapshot->'clearance_balances';
 if clearance_balances is null or balances is distinct from clearance_balances then
  raise exception 'VACATING_RELEASE_BALANCE_CHANGED' using errcode='40001';
 end if;

 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 release_snapshot:=jsonb_build_object(
  'lease_id',l.id,'contract_no',l.contract_no,'unit_id',l.unit_id,'original_contract_end_date',l.end_date,
  'effective_occupancy_end',s.vacate_date,'clearance_no',s.clearance_no,'clearance_snapshot',s.clearance_snapshot,
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
  released_by=auth.uid(),released_by_name=coalesce(actor,auth.uid()::text),released_at=now(),release_snapshot=release_snapshot,
  updated_by=auth.uid(),updated_at=now() where workspace_id=w and lease_id=lid;
 update public.aqari_notification_outbox set status='cancelled'
  where workspace_id=w and lease_id=lid and status in('awaiting_configuration','queued') and kind='rent_reminder';

 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 return jsonb_build_object('settlement',private.aqari_vacating_json(w,lid),
  'lease',jsonb_build_object('id',l.id,'status',l.status,'vacated_on',l.vacated_on,'contract_end_date',l.end_date));
end $$;
revoke all on function public.aqari_vacating_release(uuid,uuid,bigint) from public,anon;
grant execute on function public.aqari_vacating_release(uuid,uuid,bigint) to authenticated;

commit;
