begin;

create or replace function private.aqari_vacating_settlement_aal2_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.aqari_require_sensitive_aal2(new.workspace_id);
  return new;
end $$;

revoke all on function private.aqari_vacating_settlement_aal2_guard() from public,anon,authenticated;

drop trigger if exists aqari_vacating_settlement_aal2 on private.aqari_vacating_settlements;
create trigger aqari_vacating_settlement_aal2
before insert or update on private.aqari_vacating_settlements
for each row execute function private.aqari_vacating_settlement_aal2_guard();

commit;