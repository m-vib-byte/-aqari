-- AQARI V267: covering indexes for hot operational foreign-key paths.
-- Additive only; no data rewrite or constraint relaxation.
begin;

create index if not exists aqari_cheque_events_workspace_cheque_idx on private.aqari_cheque_events(workspace_id,cheque_id);
create index if not exists aqari_cheques_workspace_lease_idx on private.aqari_cheques(workspace_id,lease_id);
create index if not exists aqari_financial_expenses_workspace_property_idx on private.aqari_financial_expenses(workspace_id,property_id);
create index if not exists aqari_legal_cases_workspace_lease_idx on private.aqari_legal_cases(workspace_id,lease_id);
create index if not exists aqari_maintenance_attachments_request_fk_idx on private.aqari_maintenance_attachments(request_id);
create index if not exists aqari_maintenance_plans_workspace_property_idx on private.aqari_maintenance_plans(workspace_id,property_id);
create index if not exists aqari_maintenance_tasks_workspace_property_idx on private.aqari_property_maintenance_tasks(workspace_id,property_id);
create index if not exists aqari_tenant_adjustments_workspace_lease_idx on private.aqari_tenant_adjustments(workspace_id,lease_id);
create index if not exists aqari_unit_inspections_workspace_lease_idx on private.aqari_unit_inspections(workspace_id,lease_id);
create index if not exists aqari_unit_inspections_workspace_unit_idx on private.aqari_unit_inspections(workspace_id,unit_id);
create index if not exists aqari_vendor_contracts_workspace_vendor_idx on private.aqari_vendor_contracts(workspace_id,vendor_id);
create index if not exists aqari_vendor_contracts_workspace_property_idx on private.aqari_vendor_contracts(workspace_id,property_id);
create index if not exists aqari_work_orders_workspace_property_idx on private.aqari_work_orders(workspace_id,property_id);
create index if not exists aqari_work_orders_workspace_vendor_idx on private.aqari_work_orders(workspace_id,vendor_id);
create index if not exists aqari_work_orders_workspace_vendor_contract_idx on private.aqari_work_orders(workspace_id,vendor_contract_id);

commit;
