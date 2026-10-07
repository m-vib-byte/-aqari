# Contract execution integration — 7 October 2026

This candidate integrates PR #428 (`ca20832cd1195bb09bc9cc01586ee5dd72c41dc3`)
with the published #457 (`186d1de3073547add2d3ba981a765091b6530399`).
It also preserves newly published #459 (`c045b7a2827ed29f955791a799f1280567b65a3c`)
pending-draft page-exit protection. It retains monthly maintenance and operational recovery changes. The dialog
merge keeps exact HTTP 403 MFA challenges recoverable, clears queued navigation,
and still disposes private input for an expired identity, workspace or role.

The execution flow prepares both immutable PDF copies and the receipt before
the signing transaction. Archive reopening never repeats a settlement. A new
configuration probe stops the actual finalization path before receipt-number
reservation when the trusted PDF renderer is unavailable. This probe is only
configuration readiness, not evidence of database or authenticated acceptance.

## Current-schema capability candidate

`staging-database/reconciliation/contract-execution/capability-candidate.sql`
installs execution settlement, package, consumption and official PDF archive
services together. Production was read only during preparation. Its captured
schema contains 175 application tables and 395 functions; no business rows,
credentials, sequence values or stored object bytes are in the capture.
Capture SHA256: `b6b4d5005424d4bebd4691e17c653c28530320c294fc745d7f3e133329a429bf`.

Production lacked explicit first-period entitlement calculations and the
official PDF archive table as well as the execution services. The candidate
therefore includes the reviewed entitlement validators and calculations.
It preserves current consumer definitions, changing only due-date handling
in the schedule, existing vacating balance and reminder functions. It does
not install absent statement or tenant-rating services. Seven definition
preconditions and five absence checks abort on concurrent schema drift.
Existing contract/receipt allocators, the due schedule projector and recent-MFA
guard remain byte-for-byte unchanged. No historical records are backfilled.

## Verification

The complete prepared release regression suite passed after merging #459: **2,754 tests**, zero
failures or skips. Release inventory/freeze verification also passed.

- 72 focused JavaScript tests: package integrity, exact scope, archive reopening,
  MFA recovery, denied/revoked sessions, uncertain-write locking, renderer
  preflight and no reservation/business write when unavailable.
- 20 Python tests: real renderers, receipt/source integrity, trusted commit,
  identity/project checks, exact MFA boundaries and secret-free configuration
  status.
- `node staging-database/local-test/run-contract-execution-current-production.mjs`
  restores the complete 7 October schema into local PostgreSQL memory and applies
  the exact candidate. Actual app-state trigger chains pass for 0, 100 and
  17.125 KWD: signing, two archived copies, paid receipt only when due, settled
  first-period balance, idempotency, wrong-package rollback, private grants and
  rejection of viewer/expired/consumed packages. All fixtures roll back.
- The same runner checks calendar-day proration, leap years, manual net values,
  free periods, invalid terms, legacy arithmetic and preserved allocator/MFA
  definitions. It does not disable triggers or replace authorization functions.
- The old entitlement suite's template workflow is incompatible with current
  Production (`INVALID_TEMPLATE_CONTENT`). Only its standalone arithmetic
  vectors are reused; its obsolete workflow is not reported as passing.

SQL PDF sentinels test atomic archive linkage. Python tests verify real PDF
rendering separately. These tests are not a signed-in hosted HTTP acceptance
or physical-device acceptance.

## Activation dependencies

Vercel project environment metadata currently contains neither
`AQARI_PDF_ARCHIVE_SERVICE_KEY` nor `AQARI_PDF_ARCHIVE_SUPABASE_URL`.
The connected Supabase API exposes publishable keys only; these cannot replace
a server secret. Production and Preview need separate matching server-side
credentials, followed by redeployment. No secret was copied to a browser,
committed, guessed or minted through SQL.

The capability SQL remains a reviewed candidate, not an applied Production
migration. Before activation: configure the matching renderer environment,
repeat the guarded schema preflight, apply the coordinated capability and
verify authenticated package preparation → atomic settlement → reopen both
original PDFs and receipt on the deployment SHA. Preserve existing records.
Owner phone/tablet acceptance remains separately identifiable.
