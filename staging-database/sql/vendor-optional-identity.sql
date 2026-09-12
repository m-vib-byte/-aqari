-- Repeatable upgrade after operations-completion.sql.
-- Vendor identity is optional in the existing form/RPC (default ''). UUID remains the primary key.
-- Keep uniqueness for supplied numbers without changing any existing number or vendor row.
begin;
create unique index if not exists aqari_vendor_supplied_identity_unique
 on private.aqari_vendors(workspace_id,civil_or_license_no)
 where btrim(civil_or_license_no)<>'';
alter table private.aqari_vendors drop constraint if exists aqari_vendors_workspace_id_civil_or_license_no_key;
commit;
