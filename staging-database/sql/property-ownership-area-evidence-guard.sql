-- AQARI V267 owner/heir ownership evidence hardening.
begin;
create or replace function private.aqari_property_ownership_owners_valid(w uuid,p uuid,rows jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare core jsonb;
begin
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)<1 or octet_length(rows::text)>500000 then return false;end if;
 if exists(
  select 1 from jsonb_array_elements(rows) r
  where jsonb_typeof(r)<>'object'
   or exists(select 1 from jsonb_object_keys(r) k where k not in('id','name','bps','role','email','phone','whatsapp','supportingDocumentId'))
   or coalesce(r->>'supportingDocumentId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
 ) then return false;end if;
 select coalesce(jsonb_agg(r.value-'supportingDocumentId' order by r.ord),'[]'::jsonb) into core
 from jsonb_array_elements(rows) with ordinality r(value,ord);
 if not private.aqari_property_owners_valid(core) then return false;end if;
 if exists(
  select 1 from jsonb_array_elements(rows) r
  where not exists(
    select 1 from public.aqari_documents d
    join public.aqari_properties pr on pr.workspace_id=d.workspace_id and pr.external_ref=d.entity_ref
    where d.workspace_id=w and d.id=(r->>'supportingDocumentId')::uuid and d.entity_type='property' and d.status='uploaded' and pr.id=p
  )
 ) then return false;end if;
 return true;
end $$;
revoke all on function private.aqari_property_ownership_owners_valid(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
commit;
