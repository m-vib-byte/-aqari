-- AQARI V267: make final-settlement source fields explicit without inventing obligations.
-- Zero utility/legal balances are recorded only when the recognized supplemental ledgers
-- contain no entries for the lease and there is no open legal case.
begin;

create or replace function private.aqari_vacating_supplemental_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='finalized' and new.settlement_snapshot is not null then
    if not exists(
         select 1 from private.aqari_tenant_adjustments a
          where a.workspace_id=new.workspace_id and a.lease_id=new.lease_id
       )
       and not exists(
         select 1 from private.aqari_tenant_ledger_entries e
          where e.workspace_id=new.workspace_id and e.lease_id=new.lease_id
       )
       and not exists(
         select 1 from private.aqari_legal_cases c
          where c.workspace_id=new.workspace_id and c.lease_id=new.lease_id and c.status<>'closed'
       ) then
      new.settlement_snapshot:=new.settlement_snapshot||jsonb_build_object(
        'utility_balance','0.000',
        'legal_balance','0.000',
        'supplemental_review','no recognized supplemental ledger entries or open legal case at finalization'
      );
    end if;
  end if;
  return new;
end $$;

revoke all on function private.aqari_vacating_supplemental_snapshot_guard() from public,anon,authenticated;

drop trigger if exists aqari_vacating_supplemental_snapshot on private.aqari_vacating_settlements;
create trigger aqari_vacating_supplemental_snapshot
before update on private.aqari_vacating_settlements
for each row execute function private.aqari_vacating_supplemental_snapshot_guard();

commit;
