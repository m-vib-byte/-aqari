-- AQARI V267 Staging: every owner/heir row in an ownership revision must have
-- an uploaded supporting document scoped to the same property. This is a
-- table-level guard so alternate writers cannot bypass the UI/RPC requirement.
begin;

create or replace function private.aqari_property_ownership_revision_evidence_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;
begin
 if jsonb_typeof(new.owner_rows) is distinct from 'array' or jsonb_array_length(new.owner_rows)<1 then
  raise check_violation using message='PROPERTY_OWNERSHIP_EVIDENCE_REQUIRED';
 end if;
 for row_data in select value from jsonb_array_elements(new.owner_rows) loop
  if coalesce(row_data->>'documentId','')='' then
   raise check_violation using message='PROPERTY_OWNERSHIP_EVIDENCE_REQUIRED';
  end if;
  if row_data->>'documentId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
   raise check_violation using message='PROPERTY_OWNERSHIP_DOCUMENT_INVALID';
  end if;
  if not exists(
   select 1
   from public.aqari_documents d
   join public.aqari_properties p
    on p.workspace_id=d.workspace_id and p.external_ref=d.entity_ref
   where d.workspace_id=new.workspace_id
    and p.id=new.property_id
    and d.id=(row_data->>'documentId')::uuid
    and d.entity_type='property'
    and d.status='uploaded'
  ) then
   raise check_violation using message='PROPERTY_OWNERSHIP_DOCUMENT_INVALID';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_property_ownership_revision_evidence_guard() from public,anon,authenticated,service_role;

drop trigger if exists aqari_property_ownership_revision_evidence_guard on private.aqari_property_ownership_revisions;
create trigger aqari_property_ownership_revision_evidence_guard
 before insert on private.aqari_property_ownership_revisions
 for each row execute function private.aqari_property_ownership_revision_evidence_guard();

commit;
