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

The retained downstream projection fixture was also reconciled with the new
authoritative source: it now supplies explicit first-period terms and a real
synthetic credit allocation, instead of relying on a preposted due row. All
three projection cases pass, including rent 100 less allocated credit 25.

SQL PDF sentinels test atomic archive linkage. Python tests verify real PDF
rendering separately. These tests are not a signed-in hosted HTTP acceptance
or physical-device acceptance.

## Preview verification — 8 October 2026

The Preview renderer environment is configured for the isolated test project.
Deployment `aqari-f622r5vuy-m-vib-5421.vercel.app` reports exact commit
`01302dd88e8d75a4cb753897fda135f390e842c9` and environment `preview`.
Both `/api/release` and the renderer configuration probe return HTTP 200;
the latter returns only `{"configured":true}`. This is configuration evidence,
not a completed archive acceptance.

All executed GitHub checks on that commit passed: validate, test, verify,
startup-order, paint, recovery, speed, e2e and home. The inventory job and
Supabase Preview job were skipped and are not counted as passed tests.

Hosted acceptance exposed `PAYMENT_CYCLE_REQUIRED` during foundation promotion.
The foundation now requires explicit monthly, quarterly, half-yearly or yearly
selection and preserves it through autosave and the rental engine. The 26
foundation tests passed. Hosted reopening preserved the monthly selection.

The synthetic `AQ-C-2026-000010` contract uses only the isolated test property,
unit `ARCHIVE-TEST-20261008`, and an existing synthetic tenant. The server also
rejected promotion with `UNIT_NOT_READY`; the unit's synthetic readiness was
then recorded through the normal UI after MFA. The contract was successfully
promoted and progressed through draft, ready, approved and signing.
No Production record was changed by these steps.

Two usability issues were observed during this path: reviewing immediately
while autosave was pending produced a recoverable conflict, and transitioning
after foundation promotion required a page refresh to synchronize the rental
engine's local state. The follow-up source fix serializes explicit actions after
the pending/in-flight autosave and adopts only reread-confirmed, unchanged local
sections into the rental engine. Account changes, local edits, busy writes and
uncertain outcomes prevent adoption. Neither server guard is bypassed.

The 52 focused foundation, autosave and rental-record tests pass, including an
actual next lease transition after cache adoption, rejection of local edits or
identity changes, retention of uncertain-write locks, ordered autosave flushing,
failure propagation and cancellation of unsent work after dialog disposal.
Including dialog and session regressions, the focused run passed 69 tests with
zero failures or skips. The fixes still require a hosted replay on their new
deployment.

### Hosted PDF preparation and remaining archive acceptance

The normal signing UI generated one execution package at
`2026-10-08 00:32:07.950354+00` for synthetic contract `AQ-C-2026-000010`.
The recorded PDF sizes and SHA256 digests were:

| Copy | Bytes | SHA256 |
| --- | ---: | --- |
| Tenant | 28844 | `f5ab241e58aa8aa946c5ac34d979219786906ad1c2aefc9525125de841877d8d` |
| Owner | 28897 | `37e70b1172185df5eb4c2db6fe895626f6e811d1a39e4a61fae7ef069b2f9397` |
| Receipt | 28182 | `f93d3173456404fbfe2a9f5f4673782048e4d4ceef5e5bfeef37255163972968` |

The final transaction was rejected at `00:32:17.828+00` because the signed-copy
upload and signature review were missing. Readback confirmed status `signing`,
zero settlements, one unconsumed package and zero final artifact sets. Its
expiry was `00:47:02.124+00`; these preparation records are not evidence of an
issued receipt, completed settlement or final archive acceptance.

The browser runtime then lost resumable native credential state while opening
the file chooser. A clearly labelled synthetic signature QA fixture was prepared,
but its upload was not confirmed. No actual signature or legally binding
agreement is asserted. The remaining hosted check is to resume a valid session,
verify the unchanged zero-settlement state, complete the synthetic document
upload/review, finalize once, reopen both immutable copies and the receipt,
compare their stored digests, and verify reopening does not create a settlement.
Owner phone/tablet acceptance remains outstanding.

## Production activation dependencies

Preview configuration does not establish Production renderer readiness.
Production requires its own matching server-side configuration and the guarded
database capability activation; do not reuse the Preview credential or project.

The capability SQL remains a reviewed candidate, not an applied Production
migration. Before activation: configure the matching renderer environment,
repeat the guarded schema preflight, apply the coordinated capability and
verify authenticated package preparation → atomic settlement → reopen both
original PDFs and receipt on the deployment SHA. Preserve existing records.
Owner phone/tablet acceptance remains separately identifiable.
