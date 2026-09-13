-- AQARI V267 Preview/Staging only. G08-01 maintenance request category enforcement.
begin;
alter table public.aqari_maintenance_requests add column if not exists category_code text;
update public.aqari_maintenance_requests set category_code='legacy_unclassified' where category_code is null;
alter table public.aqari_maintenance_requests alter column category_code set default 'legacy_unclassified';
alter table public.aqari_maintenance_requests alter column category_code set not null;
alter table public.aqari_maintenance_requests drop constraint if exists aqari_maintenance_request_category_check;
alter table public.aqari_maintenance_requests add constraint aqari_maintenance_request_category_check
 check(category_code in ('legacy_unclassified','electrical','plumbing','air_conditioning','elevator','doors_windows','cleaning','other'));

-- Historical rows may remain unclassified while their status/cost is maintained,
-- but every new row must be classified and a classified request can never be
-- downgraded back to the historical sentinel.
create or replace function private.aqari_require_explicit_maintenance_category()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.category_code='legacy_unclassified'
    and (tg_op='INSERT' or old.category_code is distinct from new.category_code) then
  raise exception 'MAINTENANCE_CATEGORY_REQUIRED' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.aqari_require_explicit_maintenance_category() from public,anon,authenticated,service_role;
drop trigger if exists aqari_maintenance_category_required on public.aqari_maintenance_requests;
create trigger aqari_maintenance_category_required
before insert or update of category_code on public.aqari_maintenance_requests
for each row execute function private.aqari_require_explicit_maintenance_category();
commit;
