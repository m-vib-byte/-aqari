-- Add the missing category consumed by the already-published maintenance UI.
-- No existing request values, policies, grants or audit functions are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.aqari_maintenance_requests in access exclusive mode;
do $$begin
 if exists(select 1 from pg_attribute where attrelid='public.aqari_maintenance_requests'::regclass and attname='category_code' and not attisdropped) then raise exception 'MAINTENANCE_CATEGORY_ALREADY_PRESENT';end if;
 if not (select relrowsecurity from pg_class where oid='public.aqari_maintenance_requests'::regclass) then raise exception 'MAINTENANCE_RLS_REQUIRED';end if;
 if md5(pg_get_functiondef('private.aqari_staff_maintenance_identity()'::regprocedure))<>'3d54ed3d7f6ab2ce0cc373fc7097e625' then raise exception 'MAINTENANCE_CATEGORY_BASELINE_CHANGED';end if;
 if md5(pg_get_functiondef('private.aqari_v267_maintenance_audit()'::regprocedure))<>'237b2ba1599572c464b2be4d7edb359d' then raise exception 'MAINTENANCE_CATEGORY_BASELINE_CHANGED';end if;
 if md5(pg_get_functiondef('private.aqari_staff_maintenance_insert(uuid,uuid,uuid)'::regprocedure))<>'5b9779dcab91c479c350cae2823a2af5' then raise exception 'MAINTENANCE_CATEGORY_BASELINE_CHANGED';end if;
 if md5(pg_get_functiondef('public.aqari_tenant_portal_snapshot()'::regprocedure))<>'9e7cc318908b516d8855465f350d4a10' then raise exception 'MAINTENANCE_CATEGORY_BASELINE_CHANGED';end if;
 if to_regprocedure('private.aqari_require_explicit_maintenance_category()') is not null then raise exception 'MAINTENANCE_CATEGORY_GUARD_ALREADY_PRESENT';end if;
end $$;
create temporary table aqari_category_before on commit drop as
 select id,to_jsonb(r) as payload from public.aqari_maintenance_requests r;
alter table public.aqari_maintenance_requests add column category_code text not null default 'legacy_unclassified';
alter table public.aqari_maintenance_requests add constraint aqari_maintenance_request_category_check
 check(category_code in ('legacy_unclassified','electrical','plumbing','air_conditioning','elevator','doors_windows','cleaning','other'));
create function private.aqari_require_explicit_maintenance_category()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.category_code='legacy_unclassified' and (tg_op='INSERT' or old.category_code is distinct from new.category_code) then
  raise exception 'MAINTENANCE_CATEGORY_REQUIRED' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.aqari_require_explicit_maintenance_category() from public,anon,authenticated,service_role;
create trigger aqari_maintenance_category_required before insert or update of category_code on public.aqari_maintenance_requests
 for each row execute function private.aqari_require_explicit_maintenance_category();
do $$begin
 if exists(select 1 from aqari_category_before b full join public.aqari_maintenance_requests r on r.id=b.id where b.id is null or r.id is null or b.payload is distinct from (to_jsonb(r)-'category_code')) then raise exception 'MAINTENANCE_EXISTING_RECORD_CHANGED';end if;
end $$;
notify pgrst,'reload schema';
commit;
