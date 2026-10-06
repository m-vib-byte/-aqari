# Contract execution backend continuation — 2026-10-06

Read-only comparison of Production djkpkkgoibruaezdrchb and Preview ofgmcsmxmdswlovsckqs found:

- Production lacks private.aqari_contract_execution_settlements and private.aqari_contract_execution_artifacts, their app-state projection triggers, and the public artifact read RPC.
- Preview has both tables and projection triggers. Existing contract and receipt allocator definitions differ between the two environments; copying the old finalization SQL would replace them.
- The two legacy service scripts install successfully against the captured 2026-10-05 Production schema in local PGlite. Installation alone does not establish runtime readiness.
- Executing the old title expression fails with `invalid input syntax for type json` because concatenation and JSON extraction are not parenthesized. Preview's settlement function already contains the parenthesized expression; the source was stale.

Fixed the JSON extraction grouping in settlement title, body and official document number, and in the prepared-package title/body. No monetary formula or document text is changed. Added a PostgreSQL test that executes the expressions extracted directly from both source files: 12 fixtures, with exact title/body/number assertions, including Arabic and quoted identifiers. Added this test to Runtime contracts CI.

Local validation: 12/12 expression cases passed; both legacy scripts installed in memory on the captured Production schema; release freeze passed. No hosted migrations, receipt reservations, contract signing, or business-data changes occurred. The existing PR423 protection remains in Production.

## Downstream projection reconciliation

The first runtime projection on the captured Production schema failed with
`DOCUMENT_RESERVED_NUMBER_REQUIRED`. The legacy scripts did not reserve official
numbers, and the Production source guard did not accept rental-contract packages.
Read-only Preview inspection confirmed an actor-bound package validator and the
missing reservations; these were present in the database but absent from source.

Reconciled the settlement and both package artifact projectors with explicit
official number reservations. Added `contract-execution-official-source.sql` from
the Preview implementation: it retains the reservation check and validates exact
title/body/payload/hash/version against the immutable PDF package, signed lease,
actor, and transaction manifest. The existing guard body for other document kinds
is preserved. Installation refuses an unknown guard definition instead of
overwriting newer changes (Production guard MD5 `66f94d6201d715919ec416ce83f1d29d`,
Preview guard MD5 `473f54fe0309dc3e4182f66837911174`). This is source reconciliation,
not a hosted migration.

`node staging-database/local-test/run-contract-execution-projection.mjs` restores
the captured Production schema in memory and runs three synthetic downstream
cases: zero rent, rent 100 + deposit 25, and gross rent 100 less credit 25. It checks:

- One canonical contract plus two distinct, linked copies and three reservations.
- Two exact archived PDF byte/hash pairs and a receipt archive only when rent is due.
- Package consumption, receipt reservation consumption, and artifact RPC readback.
- Retry idempotency; immutable settlement, artifact, and package-consumption records.
- Exact rejection of invalid totals, missing reservations, altered document content,
  and a missing manager identity.
- A late package failure rolls back settlement, canonical document reservation,
  and deposit effects before retry.
- Existing contract/receipt allocator definitions are preserved byte-for-byte.

The runner extracts only the artifact section of the legacy finalization script;
it does not replace the captured allocator functions. It extracts the real due-date
function from the entitlement source without installing unrelated migrations.
The CI workflow runs this test in addition to the 12 expression cases.

Limits: operational leases, dues, payment rows, app-state snapshots, and package
rows are explicitly seeded in the local fixture to isolate the downstream path.
No trigger or guard is disabled. PDF sentinel bytes test archive linkage, not PDF
rendering. This is not proof of the complete app-state projector, trusted renderer,
or hosted Auth/Storage behavior. Production still lacks the execution backend;
the current UI does not yet submit `executionPackageId`.

Still required before activation: reconcile all rent-entitlement/schedule
dependencies into a current-schema migration, connect the UI and trusted PDF
package preparation API, exercise a complete signed-contract transaction in an
isolated hosted environment, verify exact deployed SHA and migrations separately,
and complete owner-device acceptance. No hosted database writes occurred here.
