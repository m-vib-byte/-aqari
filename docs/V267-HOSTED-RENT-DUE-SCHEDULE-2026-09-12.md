# AQARI V267 — Hosted rent due schedule acceptance — 12 Sep 2026

Environment: isolated V267 Staging only (`ofgmcsmxmdswlovsckqs`). No Production mutation.

## G04-02 — monthly due ledger

`staging-database/sql/rent-due-schedule.sql` adds an authoritative private due ledger keyed by workspace, lease and month. Signed leases generate one unique monthly period from the lease start month through the end month. Each row stores the authoritative due amount from the approved contract-term calculation, non-cancelled allocated payments, remaining balance, status and a source hash.

The ledger is refreshed automatically after relevant lease changes, payment insert/update/delete, and documented receipt cancellation. Direct table access is revoked from browser roles; the public read RPC enforces collection/lease scope.

Hosted acceptance on the existing signed Staging lease verified a 12-month schedule. September and October 2026 re-read as paid from persisted payments; November 2026 re-read as a 100.000 KWD due period.

A second rollback-only acceptance transaction verified automatic state changes on November:

1. synthetic 40.000 KWD payment → `partial`, paid 40.000, balance 60.000;
2. second 60.000 KWD payment → `paid`, paid 100.000, balance 0.000;
3. documented cancellation of the second payment → automatically returned to `partial`, paid 40.000, balance 60.000.

All synthetic payment/cancellation rows were rolled back. The derived schedule remained consistent with the authoritative lease/payment data.

## G04-03 / G05-08 — forward allocation of an advance credit

`staging-database/sql/rent-due-credit-allocation.sql` integrates the existing tenant-credit ledger with the due schedule. The schedule now reports actual paid amount and allocated credit separately, while status/balance use their combined authoritative application. A manager-only AAL2 RPC allocates a saved tenant credit forward across unpaid periods in chronological order, never exceeding either the remaining credit or a period's outstanding balance. Closed financial periods remain protected by the existing period guard.

Hosted rollback acceptance created a synthetic 150.000 KWD tenant credit on the existing test lease and allocated it from November 2026 forward:

- November: 100.000 credit allocated → balance 0.000, status `paid`;
- December: remaining 50.000 credit allocated → balance 50.000, status `partial`;
- allocation ledger public readback totaled exactly 150.000 KWD;
- no credit remained unallocated.

The transaction rolled back completely after verification.

## Acceptance boundary

This materially strengthens G04-02, G04-03 and G05-08 for monthly leases, partial/full payments, documented cancellation and forward tenant-credit allocation. A general non-monthly payment-cycle model is still separate work, as are real-account/device tests and external payment-provider acceptance.
