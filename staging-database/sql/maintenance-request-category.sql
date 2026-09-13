-- AQARI V267 Preview/Staging only. G08-01 taxonomy groundwork.
-- Existing and not-yet-upgraded clients receive legacy_unclassified; explicit
-- enforcement is enabled only after every creation UI sends category_code.
begin;
alter table public.aqari_maintenance_requests add column if not exists category_code text;
update public.aqari_maintenance_requests set category_code='legacy_unclassified' where category_code is null;
alter table public.aqari_maintenance_requests alter column category_code set default 'legacy_unclassified';
alter table public.aqari_maintenance_requests alter column category_code set not null;
alter table public.aqari_maintenance_requests drop constraint if exists aqari_maintenance_request_category_check;
alter table public.aqari_maintenance_requests add constraint aqari_maintenance_request_category_check
 check(category_code in ('legacy_unclassified','electrical','plumbing','air_conditioning','elevator','doors_windows','cleaning','other'));
drop trigger if exists aqari_maintenance_category_required on public.aqari_maintenance_requests;
commit;
