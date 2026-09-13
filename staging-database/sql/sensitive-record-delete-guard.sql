-- AQARI V267 Preview/Staging hardening only.
-- Sensitive business records are append/cancel/reverse only; direct DELETE is forbidden.
-- This source mirrors the migration verified on the isolated V267 Preview database.

begin;

create or replace function private.aqari_reject_sensitive_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'SENSITIVE_RECORD_DELETE_FORBIDDEN:%', tg_table_schema || '.' || tg_table_name
    using errcode='23514';
end
$$;

revoke all on function private.aqari_reject_sensitive_delete() from public, anon, authenticated;

drop trigger if exists aqari_sensitive_no_delete_lease on public.aqari_leases;
create trigger aqari_sensitive_no_delete_lease
before delete on public.aqari_leases
for each row execute function private.aqari_reject_sensitive_delete();

drop trigger if exists aqari_sensitive_no_delete_payment on public.aqari_rent_payments;
create trigger aqari_sensitive_no_delete_payment
before delete on public.aqari_rent_payments
for each row execute function private.aqari_reject_sensitive_delete();

drop trigger if exists aqari_sensitive_no_delete_document on public.aqari_documents;
create trigger aqari_sensitive_no_delete_document
before delete on public.aqari_documents
for each row execute function private.aqari_reject_sensitive_delete();

drop trigger if exists aqari_sensitive_no_delete_expense on private.aqari_financial_expenses;
create trigger aqari_sensitive_no_delete_expense
before delete on private.aqari_financial_expenses
for each row execute function private.aqari_reject_sensitive_delete();

drop trigger if exists aqari_sensitive_no_delete_official_series on private.aqari_official_document_series;
create trigger aqari_sensitive_no_delete_official_series
before delete on private.aqari_official_document_series
for each row execute function private.aqari_reject_sensitive_delete();

commit;
