-- Must run after property-cost-allocation.sql.
begin;
create or replace function private.aqari_cost_allocation_period_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.aqari_financial_open(new.workspace_id,new.source_date);
 return new;
end $$;
revoke all on function private.aqari_cost_allocation_period_guard() from public,anon,authenticated,service_role;
drop trigger if exists aqari_cost_allocation_period_guard on private.aqari_property_cost_allocation_heads;
create trigger aqari_cost_allocation_period_guard
 before insert or update on private.aqari_property_cost_allocation_heads
 for each row execute function private.aqari_cost_allocation_period_guard();
commit;
