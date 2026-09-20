-- Correct the over-escaped civil ID pattern. Preserve nullable source imports.
-- Applied migration version is recorded by Supabase; no tenant data is embedded.
alter table public.aqari_tenants drop constraint aqari_tenants_civil_id_check;
alter table public.aqari_tenants add constraint aqari_tenants_civil_id_check check (civil_id ~ '^[0-9]{12}$');
