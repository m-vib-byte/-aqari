# V267 contracts continuation — 2026-09-20, revision 2

Continuation of PR #265, parent `3bf5a0acbefe2785498f224c684f7239e6cf0891`.
Not a production release or complete contract-cycle acceptance.

## Changes

- Historical archive registration requires the original contract date, validates it in the browser and PostgreSQL, reads it back, and includes it in idempotency comparisons. Existing historical rows remain undated rather than inventing a date. No financial or outbound-message operation is added.
- Archive and template screens retain retry controls even if initial connection or reads fail. Contract attachment and history views recover in place with the selected contract and without duplicate output.
- Preserved concurrent inline sandboxed previews, manager approval inbox, and all upstream fixes from the parent above. No reset or new workstream.
- Updated stale test fixtures for the manager-only foundation and DOM dataset support; added a direct negative test for staff access. The authorization checks remain intact.
- Added archive/recovery regression tests to the normal Vercel build gate. Refreshed inventory hashes against the complete authoritative repository snapshot and changed files.

## Verified locally

The normal build was run in an independent copy, including both owner overlays:

```sh
node scripts/build-vercel.mjs
node scripts/install-v267-owner-reference-package.mjs
node scripts/install-v267-owner-feedback.mjs
node --test --test-reporter=tap tests/*.test.*
```

Final built-suite output: **1,833 tests; 1,833 passed; 0 failed; 0 skipped**.
The standard build also ran its Python accounting and PDF/export tests successfully.
`node scripts/release-freeze-selftest.mjs`: PASS on the source tree.

Local in-memory PostgreSQL (PGlite 0.5.8) restored the repository schema catalog with no hosted database connection. The existing `test:completion` command completed **202 SQL script executions**, including intentional repeat applications for upgrade/idempotency verification. The focused manager workflow fixture also passed after applying these prerequisites:

```sh
node run-isolated.mjs \
 ../sql/mfa-enforcement.sql ../sql/staff-property-scope.sql \
 ../supabase/migrations/20260909225520_v267_document_catalog.sql \
 ../sql/unit-readiness.sql ../sql/operations-completion.sql \
 ../sql/external-integration-register.sql \
 ../sql/manager-contract-workflow.sql \
 ../sql/manager-contract-workflow.sql \
 ../tests/manager_contract_workflow.sql
```

The focused fixture verifies date readback, missing/impossible date rejection, changed-date retry rejection, manager/staff boundaries, signatures, change requests, cross-workspace denial, and absence of new leases/payments/notification or integration events from archiving. These are synthetic local tests, not browser sign-in or real storage acceptance tests.

## Live checks and remaining gates

- The authenticated connector identifies `ofgmcsmxmdswlovsckqs` as development branch `v267-isolated-test` of parent project `djkpkkgoibruaezdrchb`; looking it up as a standalone project returns not found. Do not infer that the branch is deleted.
- Read-only inspection of that branch returned `administration_rpc: null` for `public.aqari_contract_administration(uuid,text,jsonb)` and one workspace. This session did not apply hosted migrations, alter tenant data, or send messages.
- The available browser was on a sign-in screen. No successful sign-in or end-to-end manager/staff acceptance is claimed for this session. The existing upstream report's earlier sign-in is not a substitute for testing this candidate.
- Staff still cannot submit the requested restricted new-contract preparation through the manager foundation. Per-employee template assignment and the full employee-fill / manager-review cycle remain unfinished; the existing change-request flow does not replace them.
- Separate apartment-in-building versus apartment-in-house semantics, full editable print-layout preview, and all requested contract/annex flows still require acceptance against the user's specification.
- Automatic receipt delivery over both building WhatsApp and official email remains unfinished as documented by the parent PR.
- Hosted schema activation, actual file upload/readback, final collection/KNET verification, Desktop plus physical iPhone/iPad acceptance, and a current complete Database/Auth/Storage backup with independent restore and rollback evidence remain release gates.

No merge to main or production deployment was performed by this continuation. Passing local suites does not establish those missing gates.
