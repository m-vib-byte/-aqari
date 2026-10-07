# Monthly maintenance report completion — Preview candidate

Base: PR #433, `baeccfe38634288f59e9c0e1f193b07883f9ce73`. Follow-up Draft; no merge or Production promotion.

## Implemented

- `src/v267/pages/maintenance-monthly-details.js`: save technician, inspection date, invoice number/document, result details, responsible person and planned closure; explicit inspection category and urgency; manager result approval; readback, conflict and uncertain-write recovery.
- `staging-database/sql/maintenance-monthly-details.sql`: append-only revisions, scoped RPCs, active property responsibility, verified document references, recent MFA for writes and manager-only approval requiring completed task and evidence. Original task status/cost are unchanged.
- `src/v267/pages/maintenance-monthly-report.js`: completeness includes the saved fields and approval, contracts/invoices and urgent summary; five inspection categories; prior-month open backlog count separately; linked original evidence; archived view cannot edit.
- `staging-database/sql/maintenance-monthly-schedule.sql` and `src/v267/pages/maintenance-monthly-schedule.js`: per-property opt-in, Kuwait 25th 08:00, immutable monthly snapshot, one snapshot per property/month, retry deduplication, failure log, frozen archive UI. No provider messages or external report delivery.
- `.github/workflows/runtime-contracts.yml`: monthly JS and isolated SQL acceptance now actually run; `scripts/verify-staging-runtime.mjs` verifies exact monthly module hashes in inventory.

## Evidence

- 54 JS tests passed: monthly report (28), details/schedule (6), photo proof (9), workflow (7), plans (4).
- `staging-database/tests/maintenance_monthly_details.sql` passed in PGlite using the repository schema catalogue plus the task lifecycle guard and both monthly SQL files.
- The same SQL acceptance suite passed on isolated Preview Supabase `ofgmcsmxmdswlovsckqs`. All synthetic fixtures were inside BEGIN/ROLLBACK. Post-test counts: tasks=0, details=0, schedules=0, snapshots=0, synthetic users=0.
- The hosted test initially rejected a fixture inserted directly as completed. The corrected fixture supplies proof and follows assigned → in_progress → completed; no production guard was disabled.
- SQL covers scope, MFA, field readback, concurrency, immutable history, anonymous/staff restrictions, invoice/property mismatches, day24/day25-before8/day25-at8/day26, duplicate suppression, separate property reports, frozen content, and disabled next-month schedules.
- Preview only: applied `maintenance_monthly_details_and_snapshot_schedule`, then `maintenance_monthly_snapshot_live_contract_parity`. Production `djkpkkgoibruaezdrchb` was not modified.
- Installed Preview-only cron job `aqari-maintenance-monthly-25` at `0 5 25 * *` (08:00 Asia/Kuwait). Readback: scheduler_ready=true; out-of-window runner created=0/failed=0. No property schedule is enabled.
- RLS is enabled and direct client table access revoked. Private tables intentionally have no client policies; access is through permission-checked RPCs with invoker public wrappers.

## Still required before owner acceptance

1. Exact new-head CI and Vercel Preview success; authenticated hosted-browser acceptance with a real saved maintenance case, verified original invoice and before/after file bytes, save/reopen, archive and access rejection.
2. Identify which existing property is the Salmiya building; Preview contains برج شيخة but no exact السالمية property. Do not infer another property or create invented records.
3. Configure both properties using the authorized manager's session. Scheduler installation does not enable any property.
4. Confirm complete five-category coverage, urgent items, previous backlog, missing invoices/contracts and real company/technician/results. Empty Preview tasks do not constitute a passed business report.
5. Owner acceptance on actual iPhone/iPad, including original attachment opening. Local DOM tests are not device acceptance.

The synthetic schedule clock test proves the issuance logic, not a real 25th production run. No automatic outbound delivery is implemented or claimed. Preview only until owner acceptance and a separate Production decision.
