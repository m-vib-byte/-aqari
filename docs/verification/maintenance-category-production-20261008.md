# Production maintenance category repair — 8 October 2026

Production schema inspection reproduced a missing `category_code` column in
`public.aqari_maintenance_requests`. The published manager request form, tenant
request form and tenant timeline all use this column. The desk alone had a
read-only legacy fallback, which did not repair creation or timeline reads.

Applied `v267_maintenance_category_compat_20261008` through the authorized
Production migration path on `djkpkkgoibruaezdrchb`, recorded version
`20261008002521`. The exact SQL is under
`staging-database/reconciliation/maintenance-category/capability-candidate.sql`.
It adds the category, validates seven supported values, rejects unclassified new
requests, preserves historical requests as explicitly unclassified, and requests
PostgREST schema reload. Four existing function definitions must match the
captured baseline; unknown drift aborts. Lock wait is bounded to five seconds.

No existing business row, policy, grant or audit function was rewritten. The
existing-row snapshot assertion runs inside the DDL transaction. Production
request count remains 0 and operation-audit count remains 14. Table grants and
the policy fingerprint `c2669dca26ff0199fa201ea5268f54df` are unchanged. RLS remains
enabled; the new trigger helper is inaccessible to authenticated and anonymous
clients. The previous zero request count is not a claim that no real-world
maintenance occurred.

Verification restored the captured Production schema (175 tables, 395 functions)
into local PostgreSQL memory, including all original policies, grants and
triggers. The before fixture first reproduces the absent-column failure and
creates synthetic historical data. The exact production SQL then passes tests
for seven categories, invalid/blank/null/omitted values, historical-row
preservation, CAS status/cost updates, the real tenant snapshot, foreign-tenant
and viewer denial, and anonymous access denial. No authorization function was
stubbed or relaxed. 41 existing maintenance JavaScript tests also pass.

To reproduce, capture the schema with the repository's read-only
`staging-database/local-test/application-schema-catalog.sql` before the change,
then pass its absolute path through `AQARI_SCHEMA_CATALOG` to `run-isolated.mjs`
with `fixture-before.sql`, `capability-candidate.sql`, and `acceptance.sql` in
that order. These fixture files are local-memory-only and must not be applied to
Production. The schema capture contains definitions only, never business rows,
secrets, sequence values, Auth data or Storage bytes.

Rollback does not require removing this additive field. Retain it and any future
classified requests during a UI rollback. Removing it would break the already
published forms and lose classification data. Full signed-in browser creation,
attachments, work-order linkage and tenant follow-up remain separate acceptance
items; the new schema capability does not close the full maintenance workflow.
