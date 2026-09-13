create or replace function private.aqari_maintenance_audit_status(p_action text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare j jsonb;
begin
  if p_action is null or left(ltrim(p_action),1)<>'{' then return null; end if;
  begin j:=p_action::jsonb; exception when others then return null; end;
  if lower(coalesce(j->>'operation','')) not in ('maintenance_insert','maintenance_update') then return null; end if;
  return j->>'status';
end $$;