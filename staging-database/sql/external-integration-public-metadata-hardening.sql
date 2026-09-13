-- AQARI V267 — fail closed if integration public metadata contains secrets.
-- Preview/Staging migration source only. Do not apply to Production before the
-- owner's later explicit exact-SHA Production approval.
begin;

create or replace function private.aqari_integration_public_metadata_safe(p_value jsonb)
returns boolean
language plpgsql immutable strict
set search_path=''
as $$
declare
  stack jsonb[] := array[p_value];
  current_value jsonb;
  child_value jsonb;
  key_name text;
  normalized_key text;
  last_index integer;
  visited integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_value) <> 'object' then return false; end if;
  while coalesce(pg_catalog.array_length(stack,1),0) > 0 loop
    last_index := pg_catalog.array_upper(stack,1);
    current_value := stack[last_index];
    if last_index = 1 then stack := '{}'::jsonb[]; else stack := stack[1:last_index-1]; end if;
    visited := visited + 1;
    if visited > 4096 then return false; end if;

    if pg_catalog.jsonb_typeof(current_value) = 'object' then
      for key_name,child_value in select key,value from pg_catalog.jsonb_each(current_value) loop
        normalized_key := pg_catalog.regexp_replace(pg_catalog.lower(key_name),'[_[:space:]-]','','g');
        if normalized_key = any(array['password','secret','token','apikey','civilid','accesstoken','refreshtoken','authorization','servicerolekey']) then
          return false;
        end if;
        if pg_catalog.jsonb_typeof(child_value) in ('object','array') then
          if coalesce(pg_catalog.array_length(stack,1),0) >= 4096 then return false; end if;
          stack := pg_catalog.array_append(stack,child_value);
        end if;
      end loop;
    elsif pg_catalog.jsonb_typeof(current_value) = 'array' then
      for child_value in select value from pg_catalog.jsonb_array_elements(current_value) loop
        if pg_catalog.jsonb_typeof(child_value) in ('object','array') then
          if coalesce(pg_catalog.array_length(stack,1),0) >= 4096 then return false; end if;
          stack := pg_catalog.array_append(stack,child_value);
        end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;

revoke all on function private.aqari_integration_public_metadata_safe(jsonb) from public,anon,authenticated;

-- Never silently rewrite or delete a pre-existing value. If a target database
-- already contains a secret-like nested key, abort so it can be reviewed using
-- the proper server-side secret store before this constraint is validated.
do $$
begin
  if pg_catalog.to_regclass('private.aqari_integration_configs') is null then
    raise exception 'AQARI_INTEGRATION_CONFIGS_REQUIRED' using errcode='42P01';
  end if;
  if exists(
    select 1 from private.aqari_integration_configs
    where not private.aqari_integration_public_metadata_safe(public_metadata)
  ) then
    raise exception 'INTEGRATION_PUBLIC_METADATA_REQUIRES_MANUAL_REMEDIATION' using errcode='23514';
  end if;
end $$;

alter table private.aqari_integration_configs
  drop constraint if exists aqari_integration_public_metadata_safe_check;
alter table private.aqari_integration_configs
  add constraint aqari_integration_public_metadata_safe_check
  check(
    pg_catalog.jsonb_typeof(public_metadata)='object'
    and private.aqari_integration_public_metadata_safe(public_metadata)
  );

commit;
