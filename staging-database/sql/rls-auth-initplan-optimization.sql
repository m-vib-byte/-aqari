-- AQARI V267: avoid per-row auth.uid() re-evaluation in insert RLS policies.
-- Semantics are unchanged; auth.uid() is evaluated once through an initplan.
begin;

drop policy if exists maintenance_insert on public.aqari_maintenance_requests;
create policy maintenance_insert on public.aqari_maintenance_requests
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and status='received'
  and cost=0
  and private.aqari_staff_maintenance_insert(workspace_id,lease_id,tenant_id)
);

drop policy if exists utility_entry_insert on public.aqari_utility_entries;
create policy utility_entry_insert on public.aqari_utility_entries
for insert to authenticated
with check (
  private.aqari_can_property(workspace_id,property_id,'finance','write')
  and recorded_by=(select auth.uid())
  and entry_type in ('reading','bill')
);

commit;
