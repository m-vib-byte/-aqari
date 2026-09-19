-- AQARI V267 trial contract scope: new contracts/templates are limited to Apartment, House, Shop.
-- Historical fourth-kind records are preserved unchanged and remain readable for compatibility.
create or replace function private.aqari_restrict_new_rental_template_kind()
returns trigger
language plpgsql
set search_path=''
as $$
begin
 if new.kind not in ('apartment','house','shop') then
  raise check_violation using message='NEW_TRIAL_TEMPLATE_KIND_MUST_BE_APARTMENT_HOUSE_OR_SHOP';
 end if;
 return new;
end $$;
revoke all on function private.aqari_restrict_new_rental_template_kind() from public,anon,authenticated,service_role;

drop trigger if exists aqari_restrict_new_rental_template_kind on private.aqari_rental_template_versions;
create trigger aqari_restrict_new_rental_template_kind
 before insert on private.aqari_rental_template_versions
 for each row execute function private.aqari_restrict_new_rental_template_kind();

do $guard$
begin
 if to_regclass('private.aqari_system_rental_template_versions') is not null then
  execute 'drop trigger if exists aqari_restrict_new_system_rental_template_kind on private.aqari_system_rental_template_versions';
  execute 'create trigger aqari_restrict_new_system_rental_template_kind before insert on private.aqari_system_rental_template_versions for each row execute function private.aqari_restrict_new_rental_template_kind()';
 end if;
end
$guard$;

create or replace function private.aqari_restrict_new_contract_kind()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 d jsonb:=private.aqari_unwrap(new.payload);
 old_d jsonb:=private.aqari_unwrap(old.payload);
 c jsonb;
 previous jsonb;
begin
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]'::jsonb)) loop
  previous:=null;
  select value into previous
   from jsonb_array_elements(coalesce(old_d->'contractsV202','[]'::jsonb))
   where value->>'id'=c->>'id'
   limit 1;
  if previous is not null then continue;end if;
  if c->>'source'='v267-cloud' and (
    coalesce(c->>'contractKind','') not in ('apartment','house','shop')
    or coalesce(c#>>'{contractTemplate,kind}','') not in ('apartment','house','shop')
  ) then
   raise check_violation using message='NEW_TRIAL_CONTRACT_KIND_MUST_BE_APARTMENT_HOUSE_OR_SHOP';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_restrict_new_contract_kind() from public,anon,authenticated,service_role;

drop trigger if exists aqari_zz_restrict_new_contract_kind on public.aqari_app_state;
create trigger aqari_zz_restrict_new_contract_kind
 before update of payload on public.aqari_app_state
 for each row execute function private.aqari_restrict_new_contract_kind();
