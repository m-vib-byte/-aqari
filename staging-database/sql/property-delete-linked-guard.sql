-- Candidate only: protects DELETE; does not grant deletion or remove any record.
-- Keep all existing foreign keys, immutable history and application permissions.
begin;
create or replace function private.aqari_property_delete_linked_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; linked boolean;
begin
 if auth.uid() is null or not private.aqari_manager(old.workspace_id)
  or not private.aqari_can_property(old.workspace_id,old.id,'properties','write') then
  raise insufficient_privilege using message='PROPERTY_DELETE_MANAGER_ONLY';
 end if;
 perform private.aqari_require_sensitive_aal2(old.workspace_id);
 -- Includes references without a foreign key (financial audit and rental archives).
 -- The catalog is server-owned; relation/column identifiers are always quoted.
 for r in
  select n.nspname,c.relname,c.oid
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid
  where n.nspname in('public','private') and c.relkind in('r','p')
   and a.attname='property_id' and not a.attisdropped
   and a.atttypid='uuid'::regtype
  order by n.nspname,c.relname
 loop
  execute format('lock table %I.%I in share mode',r.nspname,r.relname);
  -- Property IDs are globally unique. Even a corrupt cross-workspace reference blocks deletion.
  execute format('select exists(select 1 from %I.%I where property_id=$1)',r.nspname,r.relname)
   into linked using old.id;
  if linked then raise check_violation using message='PROPERTY_DELETE_LINKED_RECORDS';end if;
 end loop;
 lock table public.aqari_documents in share mode;
 if exists(select 1 from public.aqari_documents d where d.workspace_id=old.workspace_id
  and ((d.entity_type='property' and d.entity_ref in(old.id::text,old.external_ref,old.name))
   or position(old.id::text in coalesce(d.metadata::text,''))>0
   or (nullif(old.external_ref,'') is not null and position(to_jsonb(old.external_ref)::text in coalesce(d.metadata::text,''))>0)
   or (nullif(old.name,'') is not null and position(to_jsonb(old.name)::text in coalesce(d.metadata::text,''))>0))) then
  raise check_violation using message='PROPERTY_DELETE_LINKED_DOCUMENTS';
 end if;
 -- Imported payloads can still carry name-based links; fail closed pending migration.
 lock table public.aqari_app_state in share mode;
 if exists(select 1 from public.aqari_app_state s where s.workspace_id=old.workspace_id
  and (position(old.id::text in s.payload::text)>0
   or (nullif(old.external_ref,'') is not null and position(to_jsonb(old.external_ref)::text in s.payload::text)>0)
   or (nullif(old.name,'') is not null and position(to_jsonb(old.name)::text in s.payload::text)>0))) then
  raise check_violation using message='PROPERTY_DELETE_IMPORTED_REFERENCES';
 end if;
 return old;
end $$;
revoke all on function private.aqari_property_delete_linked_guard() from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_delete_linked_guard on public.aqari_properties;
create trigger aqari_property_delete_linked_guard before delete on public.aqari_properties
 for each row execute function private.aqari_property_delete_linked_guard();
commit;
