-- AQARI V267 isolated Staging: covering indexes for SLA audit actor FKs.
begin;
create index if not exists aqari_property_maintenance_sla_created_by_idx on private.aqari_property_maintenance_sla(created_by);
create index if not exists aqari_property_maintenance_sla_updated_by_idx on private.aqari_property_maintenance_sla(updated_by);
create index if not exists aqari_maintenance_sla_escalations_recipient_idx on private.aqari_maintenance_sla_escalations(recipient_id);
commit;
