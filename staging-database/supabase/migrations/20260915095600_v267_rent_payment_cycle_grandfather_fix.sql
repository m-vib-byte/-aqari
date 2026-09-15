-- AQARI V267 Preview/Staging: existing contracts without a stored cycle remain monthly.
-- A new contract, or an old draft moving to approval, must explicitly select the cycle.
begin;
create or replace function private.aqari_validate_contract_payment_cycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_d jsonb:=private.aqari_unwrap(old.payload);new_d jsonb:=private.aqari_unwrap(new.payload);c jsonb;previous jsonb;raw text;old_raw text;
begin
 for c in select value from jsonb_array_elements(coalesce(new_d->'contractsV202','[]'::jsonb)) loop
  if c->>'source' is distinct from 'v267-cloud' then continue;end if;
  raw:=coalesce(c->>'paymentCycleMonths','');previous:=null;
  select value into previous from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb)) where value->>'id'=c->>'id' limit 1;
  if previous is null then
   if raw !~ '^(1|3|6|12)$' then raise check_violation using message='PAYMENT_CYCLE_REQUIRED';end if;
   continue;
  end if;
  old_raw:=coalesce(previous->>'paymentCycleMonths','');
  if raw<>'' and raw !~ '^(1|3|6|12)$' then raise check_violation using message='INVALID_PAYMENT_CYCLE';end if;
  if old_raw='' and raw='' then
   if coalesce(previous->>'status','draft') in('draft','ready') and c->>'status' in('approved','signing','signed') then raise check_violation using message='PAYMENT_CYCLE_REQUIRED_BEFORE_APPROVAL';end if;
   continue;
  end if;
  if old_raw='' and coalesce(previous->>'status','draft') not in('draft','ready') and raw<>'' then raise check_violation using message='PAYMENT_CYCLE_LOCKED_AFTER_APPROVAL';end if;
  if old_raw<>'' and previous->>'status' in('approved','signing','signed','expired') and old_raw is distinct from raw then raise check_violation using message='PAYMENT_CYCLE_LOCKED_AFTER_APPROVAL';end if;
 end loop;return new;
end $$;
revoke all on function private.aqari_validate_contract_payment_cycle() from public,anon,authenticated,service_role;
commit;