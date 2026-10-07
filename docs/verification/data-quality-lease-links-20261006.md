# Read-only contract relationship quality checks — 2026-10-06

Requirement R04.07 includes unlinked contracts and documents, duplicates, and
transactions without references. The existing quality center only checked unit and
tenant duplication, blank names, draft contracts, missing dates and properties
without units. Its contract query omitted relationship columns entirely.

The manager-only quality scan now reads `unit_id` and `tenant_id` and distinguishes
four observations: contracts without unit links, unit references absent from the
scanned units, contracts without tenant links, and tenant references absent from
the scanned tenants. Absent references are review candidates, not proof of deleted
records. Several contracts may share one tenant without being flagged as invalid.
Older callers that omit the relationship fields receive no relationship verdict.

The existing workspace filter, stable ordering, 250-row pagination and 10,000-row
failure cap are retained. Findings render only after every table has been read and
the bound session is checked. A failed refresh clears old observations. This is
read-only: no correction, merging, relinking or deletion is offered or performed.

## Evidence

- Four added pure inspection cases and six new runtime page cases. The runtime
  tests execute the actual page with transport/DOM substitutes.
- Before: 11 pass, 3 fail. After: all 14 tests pass.
- Coverage includes null/missing links, references absent from the scanned scope,
  valid links on the second page, multi-contract tenants, historical/draft records,
  immutable inputs, incomplete scans, failed refresh, role gate and session changes.
- CI explicitly runs both quality suites. Runtime inventory and diff checks pass.
- `aqari_leases.unit_id` and `tenant_id` are existing columns used by the document
  cycle and tenant timeline; no new schema, grants or hosted writes are required.

R04.07 can move from unverified to partial based on code, runtime tests and Preview
parity. Hosted browser/RLS acceptance and the document/financial-reference parts
remain unverified. No user source discrepancy is resolved by these observations.
No production release occurs. This branch stacks on PR441.
