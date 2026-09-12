-- Controlled compatibility with the hosted issued-history lease guard.
-- Apply after vacating-release.sql. This never authorizes release from a cleared
-- status alone and never exposes an authorization flag in client-settable GUCs.
begin;
create table if not exists private.aqari_vacating_release_authorizations(
 workspace_id uuid not null,lease_id uuid not null,transaction_id text not null,backend_pid integer not null,
 actor_id uuid not null,revision bigint not null,vacated_on date not null,clearance_no text not null,
 contract_row jsonb not null,primary key(workspace_id,lease_id,transaction_id,backend_pid)
);
alter table private.aqari_vacating_release_authorizations enable row level security;
revoke all on private.aqari_vacating_release_authorizations from public,anon,authenticated;

create or replace function private.aqari_vacating_lease_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare v private.aqari_vacating;s private.aqari_vacating_settlements;
 permit private.aqari_vacating_release_authorizations;expected jsonb;original_snapshot jsonb;
begin
 select * into v from private.aqari_vacating where workspace_id=new.workspace_id and lease_id=new.id and state='issued';
 if found then
  if v.snapshot is null or v.issued_by is null or v.issued_at is null or v.certificate_no is null
   or new.snapshot is distinct from v.snapshot->'contract_snapshot' or new.tenant_id::text is distinct from v.snapshot#>>'{lease,tenant_id}'
   or new.unit_id::text is distinct from v.snapshot#>>'{lease,unit_id}' or new.start_date::text is distinct from v.snapshot#>>'{lease,start_date}'
   or new.end_date::text is distinct from v.snapshot#>>'{lease,end_date}' or new.monthly_rent::text is distinct from v.snapshot#>>'{lease,monthly_rent}'
   or (v.snapshot->'lease' ? 'deposit' and to_jsonb(new)->'deposit' is distinct from v.snapshot#>'{lease,deposit}')
   or (v.snapshot->'lease' ? 'contract_no' and new.contract_no is distinct from v.snapshot#>>'{lease,contract_no}') then
   raise check_violation using message='VACATING_CONTRACT_IMMUTABLE';
  end if;
  if new.vacated_on is not null and new.vacated_on<>v.vacated_on then raise check_violation using message='VACATING_CONTRACT_IMMUTABLE';end if;
  new.status:='expired';new.vacated_on:=v.vacated_on;return new;
 end if;
 select * into s from private.aqari_vacating_settlements where workspace_id=new.workspace_id and lease_id=new.id;
 select * into permit from private.aqari_vacating_release_authorizations
  where workspace_id=new.workspace_id and lease_id=new.id and transaction_id=pg_current_xact_id()::text
   and backend_pid=pg_backend_pid() and actor_id=auth.uid();
 if permit.lease_id is not null then
  if s.status is distinct from 'cleared' or s.revision<>permit.revision or s.vacate_date<>permit.vacated_on
   or s.clearance_no is distinct from permit.clearance_no or s.clearance_snapshot is null
   or not private.aqari_manager(new.workspace_id) then raise check_violation using message='VACATING_RELEASE_AUTHORIZATION_INVALID';end if;
  expected:=permit.contract_row;original_snapshot:=expected->'snapshot';
  -- App-state projection may add only the three release markers. Keep the
  -- canonical contract snapshot itself byte-for-byte as its JSONB value.
  if new.snapshot=original_snapshot||jsonb_build_object('status','expired','vacatedOn',permit.vacated_on,'changeReason','vacating-clearance-release') then new.snapshot:=original_snapshot;end if;
  if (to_jsonb(new)-array['status','vacated_on']) is distinct from (expected-array['status','vacated_on'])
   or new.status<>'expired' or (new.vacated_on is not null and new.vacated_on<>permit.vacated_on) then
   raise check_violation using message='VACATING_CONTRACT_IMMUTABLE';end if;
  new.vacated_on:=permit.vacated_on;return new;
 end if;
 if s.status='released' then
  expected:=s.release_snapshot->'contract_row';original_snapshot:=expected->'snapshot';
  if expected is null or s.release_snapshot->>'effective_occupancy_end' is distinct from s.vacate_date::text then
   raise check_violation using message='VACATING_RELEASE_HISTORY_REQUIRED';end if;
  if new.snapshot=original_snapshot||jsonb_build_object('status','expired','vacatedOn',s.vacate_date,'changeReason','vacating-clearance-release') then new.snapshot:=original_snapshot;end if;
  if (to_jsonb(new)-array['status','vacated_on']) is distinct from (expected-array['status','vacated_on'])
   or (tg_op='UPDATE' and new.vacated_on is distinct from s.vacate_date)
   or (new.vacated_on is not null and new.vacated_on<>s.vacate_date) then raise check_violation using message='VACATING_CONTRACT_IMMUTABLE';end if;
  new.status:='expired';new.vacated_on:=s.vacate_date;return new;
 end if;
 if new.vacated_on is not null then raise check_violation using message='VACATING_ISSUE_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.aqari_vacating_lease_guard() from public,anon,authenticated;
-- Preserve an installed trigger name and enforce the same guard when replaying
-- the migration against the local schema representation.
drop trigger if exists zz_vacating_lease_guard on public.aqari_leases;
create trigger zz_vacating_lease_guard before insert or update on public.aqari_leases
 for each row execute function private.aqari_vacating_lease_guard();

-- The existing released-history guard runs first alphabetically. It may restore
-- an exact benign app-state release projection, but rejects every substantive edit.
create or replace function private.aqari_released_lease_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.aqari_vacating_settlements;
begin
 select * into r from private.aqari_vacating_settlements where workspace_id=old.workspace_id and lease_id=old.id and status='released';
 if not found then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op='DELETE' then raise check_violation using message='VACATING_CONTRACT_IMMUTABLE';end if;
 if new.snapshot=old.snapshot||jsonb_build_object('status','expired','vacatedOn',r.vacate_date,'changeReason','vacating-clearance-release') then new.snapshot:=old.snapshot;end if;
 if new.workspace_id is distinct from old.workspace_id or new.external_ref is distinct from old.external_ref
  or new.tenant_id is distinct from old.tenant_id or new.unit_id is distinct from old.unit_id
  or new.contract_no is distinct from old.contract_no or new.start_date is distinct from old.start_date
  or new.end_date is distinct from old.end_date or new.monthly_rent is distinct from old.monthly_rent
  or new.deposit is distinct from old.deposit or new.snapshot is distinct from old.snapshot
  or new.import_source is distinct from old.import_source or new.vacated_on is distinct from r.vacate_date then
  raise check_violation using message='VACATING_CONTRACT_IMMUTABLE';end if;
 new.status:='expired';new.vacated_on:=r.vacate_date;return new;
end $$;
revoke all on function private.aqari_released_lease_guard() from public,anon,authenticated;

-- Guarded exact source patch preserves every installed release precondition,
-- including hosted additions. Unknown versions fail instead of replacing them.
do $patch$
declare source text:=pg_get_functiondef('public.aqari_vacating_release(uuid,uuid,bigint)'::regprocedure);
 anchor text:=$anchor$update public.aqari_leases set status='expired',vacated_on=s.vacate_date where workspace_id=w and id=lid;$anchor$;
 finish text:=$finish$select * into l from public.aqari_leases where workspace_id=w and id=lid;$finish$;
 addition text:=$addition$insert into private.aqari_vacating_release_authorizations(workspace_id,lease_id,transaction_id,backend_pid,actor_id,revision,vacated_on,clearance_no,contract_row)
 values(w,lid,pg_current_xact_id()::text,pg_backend_pid(),auth.uid(),s.revision,s.vacate_date,s.clearance_no,to_jsonb(l));
 release_payload:=release_payload||jsonb_build_object('contract_row',to_jsonb(l));
 $addition$;
begin
 if position('private.aqari_vacating_release_authorizations' in source)=0 then
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 or (length(source)-length(replace(source,finish,'')))/length(finish)<>1 then raise exception 'VACATING_RELEASE_COMPAT_SOURCE_MISMATCH';end if;
  source:=replace(source,anchor,addition||anchor);
  source:=replace(source,finish,'delete from private.aqari_vacating_release_authorizations where workspace_id=w and lease_id=lid and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid();'||chr(10)||' '||finish);
  execute source;
 elsif position('delete from private.aqari_vacating_release_authorizations' in source)=0 or position('contract_row' in source)=0 then raise exception 'VACATING_RELEASE_COMPAT_SOURCE_MISMATCH';end if;
end $patch$;
commit;
