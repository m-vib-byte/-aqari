-- AQARI V267: do not issue a final-settlement document while tenant credit remains open.
-- The current final-settlement template has a single net-balance line and must not silently
-- omit a tenant credit. Clearance may still use its separately audited exception path.
begin;

create or replace function private.aqari_official_final_settlement_credit_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare s private.aqari_official_document_series;settlement private.aqari_vacating_settlements;credit numeric;
begin
  select * into strict s from private.aqari_official_document_series
   where workspace_id=new.workspace_id and id=new.series_id;
  if s.kind='final_settlement' then
    select * into settlement from private.aqari_vacating_settlements
     where workspace_id=s.workspace_id and lease_id=s.entity_id;
    if not found or settlement.settlement_snapshot is null then
      raise exception 'DOCUMENT_APPROVED_SETTLEMENT_REQUIRED' using errcode='23514';
    end if;
    credit:=coalesce((settlement.settlement_snapshot#>>'{final_balances,tenant_credit}')::numeric,0);
    if credit<>0 then
      raise exception 'DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.aqari_official_final_settlement_credit_guard() from public,anon,authenticated;

drop trigger if exists aqari_official_final_settlement_credit_guard on private.aqari_official_document_versions;
create trigger aqari_official_final_settlement_credit_guard
before insert or update on private.aqari_official_document_versions
for each row execute function private.aqari_official_final_settlement_credit_guard();

commit;
