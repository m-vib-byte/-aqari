-- V267 additive guard on the existing app-state source; no new financial ledger.
-- Existing incomplete ownership is left untouched. Only changed records validate.
-- Apply after workspace controls and staff-property-scope.sql.
begin;
create or replace function private.aqari_validate_partner_owners(rows jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;total numeric:=0;ids text[]:='{}';ident text;
begin
 if jsonb_typeof(rows) is distinct from 'array' then raise exception 'PARTNER_OWNERS_REQUIRED' using errcode='23514';end if;
 if jsonb_array_length(rows) not between 1 and 100 then raise exception 'PARTNER_OWNERS_REQUIRED' using errcode='23514';end if;
 for r in select value from jsonb_array_elements(rows) loop
  ident:=btrim(r->>'id');
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string'
   or ident is null or length(ident) not between 1 and 150 or ident=any(ids)
   or jsonb_typeof(r->'name') is distinct from 'string' or length(btrim(coalesce(r->>'name',''))) not between 1 and 150
   or jsonb_typeof(r->'role') is distinct from 'string' or length(btrim(coalesce(r->>'role',''))) not between 1 and 80
   or jsonb_typeof(r->'bps') is distinct from 'number' then
   raise exception 'PARTNER_OWNER_INVALID' using errcode='23514';
  end if;
  if (r->>'bps')::numeric not between 1 and 10000 or (r->>'bps')::numeric<>trunc((r->>'bps')::numeric) then
   raise exception 'PARTNER_SHARE_INVALID' using errcode='23514';
  end if;
  ids:=array_append(ids,ident);total:=total+(r->>'bps')::numeric;
 end loop;
 if total<>10000 then raise exception 'PARTNER_SHARES_MUST_TOTAL_100' using errcode='23514';end if;
end $$;
revoke all on function private.aqari_validate_partner_owners(jsonb) from public,anon,authenticated;

create or replace function private.aqari_guard_partner_shares()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb;new_data jsonb;old_map jsonb;new_map jsonb;k text;s jsonb;before_state jsonb;
 old_events jsonb;new_events jsonb;e jsonb;old_owners jsonb;old_version numeric;n integer;i integer;
begin
 new_data:=private.aqari_unwrap(new.payload);
 old_data:=case when tg_op='INSERT' then '{}'::jsonb else private.aqari_unwrap(old.payload) end;
 old_map:=old_data->'propertySharesV267';new_map:=new_data->'propertySharesV267';
 if old_map is not distinct from new_map then return new;end if;
 if auth.uid() is null or not private.aqari_manager(new.workspace_id)
  or not private.aqari_can(new.workspace_id,'partners','write') then
  raise insufficient_privilege using message='PARTNER_MANAGER_REQUIRED';
 end if;
 if jsonb_typeof(new_map) is distinct from 'object' then raise exception 'PARTNER_HISTORY_REQUIRED' using errcode='23514';end if;
 if old_map is null then old_map:='{}';end if;
 if jsonb_typeof(old_map) is distinct from 'object' then raise exception 'PARTNER_LEGACY_REVIEW_REQUIRED' using errcode='23514';end if;
 for k in select jsonb_object_keys(old_map||new_map) loop
  before_state:=old_map->k;s:=new_map->k;
  if before_state is not distinct from s then continue;end if;
  if s is null then raise exception 'PARTNER_HISTORY_IMMUTABLE' using errcode='23514';end if;
  if jsonb_typeof(s) is distinct from 'object' or length(btrim(k)) not between 1 and 300
   or jsonb_typeof(s->'version') is distinct from 'number' or jsonb_typeof(s->'enabled') is distinct from 'boolean'
   or jsonb_typeof(s->'owners') is distinct from 'array' or jsonb_typeof(s->'events') is distinct from 'array' then
   raise exception 'PARTNER_STATE_INVALID' using errcode='23514';
  end if;
  old_version:=case when jsonb_typeof(before_state->'version')='number' then (before_state->>'version')::numeric else 0 end;
  if old_version<0 or old_version<>trunc(old_version) or (s->>'version')::numeric<>old_version+1
   or (s->>'version')::numeric>9007199254740991 then
   raise serialization_failure using message='PARTNER_REVISION_CONFLICT';
  end if;
  old_events:=coalesce(before_state->'events','[]'::jsonb);new_events:=s->'events';
  old_owners:=coalesce(before_state->'owners','[]'::jsonb);
  if jsonb_typeof(old_events) is distinct from 'array' or jsonb_typeof(old_owners) is distinct from 'array' then
   raise exception 'PARTNER_LEGACY_REVIEW_REQUIRED' using errcode='23514';
  end if;
  n:=jsonb_array_length(old_events);
  if jsonb_array_length(new_events)<>n+1 then raise exception 'PARTNER_HISTORY_IMMUTABLE' using errcode='23514';end if;
  for i in 0..n-1 loop
   if new_events->i is distinct from old_events->i then raise exception 'PARTNER_HISTORY_IMMUTABLE' using errcode='23514';end if;
  end loop;
  e:=new_events->n;
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string'
   or length(btrim(coalesce(e->>'id',''))) not between 1 and 150 or e->>'actor' is distinct from auth.uid()::text
   or jsonb_typeof(e->'at') is distinct from 'string' or length(btrim(coalesce(e->>'at',''))) not between 1 and 80
   or coalesce(e->>'type','') not in('owners','disable','distribution','payment')
   or exists(select 1 from jsonb_array_elements(old_events)x where x->>'id'=e->>'id') then
   raise exception 'PARTNER_EVENT_INVALID' using errcode='23514';
  end if;
  if e->>'type'='owners' then
   perform private.aqari_validate_partner_owners(s->'owners');
   if s->>'enabled'<>'true' or e->'before' is distinct from old_owners or e->'after' is distinct from s->'owners' then
    raise exception 'PARTNER_OWNER_SNAPSHOT_MISMATCH' using errcode='23514';
   end if;
  elsif e->>'type'='disable' then
   -- An old incomplete register can be stopped without altering its source shares.
   if s->>'enabled'<>'false' or s->'owners' is distinct from old_owners then
    raise exception 'PARTNER_DISABLE_CHANGED_OWNERS' using errcode='23514';
   end if;
  else
   perform private.aqari_validate_partner_owners(s->'owners');
   if s->'owners' is distinct from old_owners or s->'enabled' is distinct from before_state->'enabled' then
    raise exception 'PARTNER_OWNERS_CHANGED_WITHOUT_EVENT' using errcode='23514';
   end if;
   if e->>'type'='distribution' and s->>'enabled'<>'true' then
    raise exception 'PARTNER_DISTRIBUTION_DISABLED' using errcode='23514';
   end if;
   if e->>'type'='distribution' then
    perform private.aqari_validate_partner_owners(e->'rows');
    if jsonb_array_length(e->'rows')<>jsonb_array_length(s->'owners') then
     raise exception 'PARTNER_DISTRIBUTION_SHARES_MISMATCH' using errcode='23514';
    end if;
    for i in 0..jsonb_array_length(s->'owners')-1 loop
     if (e->'rows'->i)-array['income','expenses','net','receivable'] is distinct from s->'owners'->i then
      raise exception 'PARTNER_DISTRIBUTION_SHARES_MISMATCH' using errcode='23514';
     end if;
    end loop;
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_guard_partner_shares() from public,anon,authenticated;
-- Reinstalling this named guard is transactional; all original guards remain.
drop trigger if exists aqari_zy_partner_shares_guard on public.aqari_app_state;
create trigger aqari_zy_partner_shares_guard before insert or update of payload on public.aqari_app_state
 for each row execute function private.aqari_guard_partner_shares();
commit;
