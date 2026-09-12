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

## Acceptance boundary

This materially strengthens G04-02 and the period-state foundation used by G04-03. It does not yet add a non-monthly payment-cycle model or automatically split one unallocated advance payment across several future periods. Those remain separate implementation/acceptance work, as do real-account/device tests.
