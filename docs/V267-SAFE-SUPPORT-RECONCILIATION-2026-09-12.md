# AQARI V267 — safe support reconciliation on fd479926

Date: 12 September 2026.

This branch is based on candidate `fd47992659dfe75cbb461dff191807187b0d4061` and is Preview/Staging-only. It does not modify `main`, Production, or V266 and is not a release approval.

Safely ported from the consolidated support stack where the files do not overwrite the candidate's newer document-handover implementation:

- maintenance status/cost/time report RPC, page module, isolated SQL test, runtime test, and feature-discovery definition;
- a migration copy of the feature-discovery definition so a migrated Staging target can advertise `maintenance_report` only when the RPC and permissions are present;
- petty-cash invoice guard migration and its source-order/privilege regression test;
- maintenance abandoned-upload cancellation runtime regression test.

Intentionally not ported in this reconciliation:

- the support stack's older inline document-handoff register/UI because candidate `fd479926` already contains the newer audited `aqari_document_handover_register` implementation with evidence binding, idempotent verification, cancellation audit and actor snapshots;
- `src/v267/workspace.js` and the dedicated contract-scanner shortcut because that file is covered by the current Staging source inventory hash. Replacing it without refreshing the inventory would create a deterministic release-verification failure. UI wiring for the maintenance report and contract scanner must be reconciled together with the inventory in a separately verified change;
- no merge, production deployment, V266 change, hosted migration application, backup/restore claim, device acceptance claim or 155/155 claim.

Current release gate remains HOLD until all owner conditions are evidenced: 155/155 accepted, real-account Desktop plus physical iPhone and iPad acceptance, full Database/Auth/Storage backup, independent restore, tested rollback preserving transactions, and correct Production configuration.
