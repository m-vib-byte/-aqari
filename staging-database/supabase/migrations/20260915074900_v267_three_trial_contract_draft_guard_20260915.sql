-- AQARI V267: keep commercial/investment rental draft history readable but prevent new edits/creation.
-- Other non-rental document drafts (vacating undertaking / unit handover) remain supported.
create or replace function private.aqari_restrict_legacy_rental_draft_kind()
returns trigger
language plpgsql
set search_path=''
as $$
begin
 if new.template_key='commercial_investment' or (tg_op='UPDATE' and old.template_key='commercial_investment') then
  raise check_violation using message='COMMERCIAL_INVESTMENT_RENTAL_DRAFT_HISTORICAL_READ_ONLY';
 end if;
 return new;
end $$;
revoke all on function private.aqari_restrict_legacy_rental_draft_kind() from public,anon,authenticated,service_role;

drop trigger if exists aqari_restrict_legacy_rental_draft_kind on public.aqari_contract_template_drafts;
create trigger aqari_restrict_legacy_rental_draft_kind
 before insert or update on public.aqari_contract_template_drafts
 for each row execute function private.aqari_restrict_legacy_rental_draft_kind();
