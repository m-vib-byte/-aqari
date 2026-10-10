-- R05.03: a phone is contact information, not a tenant identity.
-- Review/apply as a separate schema change before enabling shared-phone saves.
-- Keeps every row, civil-ID uniqueness, stable tenant IDs, RLS and portal grants.
begin;
set local lock_timeout = '5s';
do $$
declare definition text;
begin
 select pg_get_constraintdef(oid) into definition from pg_constraint
 where conrelid='public.aqari_tenants'::regclass and conname='aqari_tenants_workspace_id_phone_key';
 if definition is not null and definition <> 'UNIQUE (workspace_id, phone)' then
  raise exception 'UNEXPECTED_TENANT_PHONE_CONSTRAINT';
 end if;
end $$;
alter table public.aqari_tenants drop constraint if exists aqari_tenants_workspace_id_phone_key;
create index if not exists aqari_tenants_workspace_phone_idx on public.aqari_tenants(workspace_id,phone);
commit;
