-- AQARI V267: indexes required by the Supabase performance advisor.
-- Safe to apply repeatedly. These indexes cover foreign-key lookups introduced
-- by the official-document and final-gap registers.

create index if not exists aqari_collection_accounts_property_fk_idx
  on private.aqari_collection_accounts (workspace_id, property_id);

create index if not exists aqari_collection_postings_payment_fk_idx
  on private.aqari_collection_postings (payment_id);

create index if not exists aqari_collection_postings_account_fk_idx
  on private.aqari_collection_postings (workspace_id, account_id);

create index if not exists aqari_credit_allocations_lease_fk_idx
  on private.aqari_credit_allocations (workspace_id, lease_id);

create index if not exists aqari_official_document_events_series_fk_idx
  on private.aqari_official_document_events (workspace_id, series_id);

create index if not exists aqari_receipt_cancellations_payment_fk_idx
  on private.aqari_receipt_cancellations (payment_id);

create index if not exists aqari_reserve_entries_property_fk_idx
  on private.aqari_reserve_entries (workspace_id, property_id);

create index if not exists aqari_tenant_ledger_entries_tenant_fk_idx
  on private.aqari_tenant_ledger_entries (workspace_id, tenant_id);
