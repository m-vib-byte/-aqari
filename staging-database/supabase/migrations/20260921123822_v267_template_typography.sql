-- Optional writing settings only. Existing template rows, revisions, legal text,
-- snapshots, approvals and archive records are not rewritten by this migration.
begin;

-- Keep the complete A4/field/signature validator as the compatibility delegate.
-- Re-running the migration replaces only this wrapper, without renaming it again.
do $$begin
 if to_regprocedure('private.aqari_template_presentation_valid_before_typography(jsonb,jsonb)') is null then
  alter function private.aqari_template_presentation_valid(jsonb,jsonb) rename to aqari_template_presentation_valid_before_typography;
 end if;
end $$;

create or replace function private.aqari_template_presentation_valid(p jsonb,f jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare t jsonb;k text;
begin
 if p is null or p='null'::jsonb or not(p ? 'typography') then
  return private.aqari_template_presentation_valid_before_typography(p,f);
 end if;
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>65536 then return false;end if;
 t:=p->'typography';
 if jsonb_typeof(t) is distinct from 'object' then return false;end if;
 if not(t ?& array['font_pt','line_height','alignment','margin_mm'])
  or exists(select 1 from jsonb_object_keys(t)x where x not in('font_pt','line_height','alignment','margin_mm')) then return false;end if;
 foreach k in array array['font_pt','line_height','margin_mm'] loop
  if jsonb_typeof(t->k) is distinct from 'number' then return false;end if;
 end loop;
 if (t->>'font_pt')::numeric not between 10 and 18
  or (t->>'line_height')::numeric not between 1.2 and 2.2
  or (t->>'margin_mm')::numeric not between 12 and 25
  or coalesce(t->>'alignment','') not in('start','center','end','justify') then return false;end if;
 return private.aqari_template_presentation_valid_before_typography(p-'typography',f);
end $$;

-- Both functions remain internal to the existing authorized template RPC.
revoke all on function private.aqari_template_presentation_valid(jsonb,jsonb),private.aqari_template_presentation_valid_before_typography(jsonb,jsonb) from public,anon,authenticated,service_role;
commit;
