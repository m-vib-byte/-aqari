-- Runtime role ceiling only. No accounts, assignments, permissions or business rows are changed.
-- Apply after staff-property-scope.sql; preserve the existing function privileges.
begin;
create or replace function private.aqari_can(w uuid,s text,a text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare b text;r text;cfg jsonb;v jsonb;allowed boolean;
begin
 if auth.uid() is null or a not in('read','write') then return false;end if;
 select role::text into b from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active;
 if b is null then return false;end if;
 if s='administration' then return b='general_manager';end if;
 if not(s=any(private.aqari_section_keys())) then return false;end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=w;
 if b='general_manager' and a='read' then return true;end if;
 if coalesce((cfg#>>array['sections',s])::boolean,true)=false then return false;end if;
 if b='general_manager' then return true;end if;
 select operational_role into r from private.aqari_staff_assignments where workspace_id=w and user_id=auth.uid() and is_active and cardinality(property_ids)>0;
 -- Recheck the current membership against the saved assignment on every request.
 -- A role change can make an earlier valid assignment stale; configured allows
 -- cannot restore it. These are the same pairs accepted by aqari_staff_access.
 if not coalesce((b='accountant' and r in('collector','accountant','viewer'))
  or (b='property_manager' and r in('collector','maintenance','property_manager','viewer'))
  or (b='viewer' and r='viewer'),false) then return false;end if;
 if not private.aqari_staff_ceiling(r,s,a) then return false;end if;
 -- Membership and operational ceilings both survive every configured override.
 if a='write' and (b='viewer' or (b='accountant' and s in('properties','tenants','contracts','partners'))) then return false;end if;
 if a='read' and s='contracts' and (not private.aqari_can(w,'tenants','read') or not private.aqari_can(w,'properties','read')) then return false;end if;
 if a='read' and s='collections' and not private.aqari_can(w,'contracts','read') then return false;end if;
 allowed:=true;
 v:=cfg#>array['permissions','role:'||b,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 v:=cfg#>array['permissions','role:'||r,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 v:=cfg#>array['permissions','user:'||auth.uid()::text,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 return allowed and (a='read' or private.aqari_can(w,s,'read'));
end $$;
commit;
