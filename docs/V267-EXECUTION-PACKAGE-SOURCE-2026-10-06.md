# Execution package source acceptance — 6 October 2026

The package preparation integration in draft PR #426 exposed two additional database failures in preview `ofgmcsmxmdswlovsckqs`.

1. `aqari_contract_execution_package_source` required a row in `aqari_rent_due_periods` while the contract was still `signing`. The real schedule projector deletes due rows for every status other than `signed`. A new signing lease therefore failed with `EXECUTION_PACKAGE_DUE_REQUIRED` before PDFs could be prepared.
2. Once that dependency was corrected, unparenthesized `text || signed_c->>'field'` expressions in the canonical title/body failed with PostgreSQL `22P02` (the Arabic title was interpreted as JSON).

The source now uses the same authoritative due calculation as schedule projection, reads existing credit allocations and computes the due date without posting a due. JSON field extraction is parenthesized before text concatenation. The canonical installation SQL and incremental migration contain the same private function. Public entry points, manager authorization, trusted-renderer grants and atomic settlement guards remain unchanged.

## Verification

`staging-database/tests/contract_execution_package_hosted.sql` creates a unique synthetic workspace, manager, viewer, property, ready unit, tenant and signing lease. It exercises the existing authorization functions and real package commit, then rolls back every fixture. It does not disable any triggers or impersonate an existing user.

Run the file twice in preview/isolated SQL, inserting either `SET LOCAL aqari.execution_package_test_rent = '0';` or `SET LOCAL aqari.execution_package_test_rent = '100';` immediately after its `BEGIN`. The default is zero. Both cases were executed successfully with the corrected source in a rollback transaction. Assertions cover:

- A signing contract has no posted due rows, yet produces the correct canonical source and both copy roles.
- A viewer cannot read the source; an authenticated caller cannot invoke trusted package commit.
- Package commit succeeds and an identical retry returns the same package.
- A conflicting package ID, corrupt PDF digest and changed authoritative source are rejected.
- Zero rent rejects a fake receipt; positive rent rejects a mismatched receipt amount and uses a real receipt-number reservation.
- Exactly one package exists; preparation neither consumes the package nor signs the lease.

Post-rollback queries confirmed zero `package-test-*` workspaces and identities. PDF bytes in this SQL fixture are deliberately synthetic; real renderer/receipt verification is covered separately by the 16 Python tests from PR #426. No claim of an authenticated HTTP or browser end-to-end settlement is made.

## Acceptance still required

A logged-in hosted flow must prepare the package through the API, consume it atomically with the settlement and verify archived tenant/owner PDFs, receipt and first-period balance. Production still requires its schema dependency, restore and owner/device acceptance gates. This change does not authorize production deployment or increase completed requirement counts.
