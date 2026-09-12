# AQARI V267 — Hosted vacating / clearance / MFA acceptance — 12 Sep 2026

Environment: isolated V267 Staging only (`ofgmcsmxmdswlovsckqs`). No Production mutation. Synthetic acceptance records were executed inside transactions and rolled back.

## Vacating / final settlement / clearance

A hosted synthetic acceptance cycle first proved the existing unit-readiness guard: a signed lease was rejected while the test unit was not ready. The test then recorded an explicit `ready` state through the authoritative readiness RPC, created a signed lease, recorded a fully paid rent period, and executed `aqari_vacating_settlement` through:

1. `save` with keys returned, inspection complete, meter readings recorded, zero damage and charges reviewed;
2. `finalize`, producing a settlement number and normalized final snapshot;
3. `clearance`, producing a clearance number only after the authoritative balances were zero.

The final readback had `status=cleared`, zero rent balance, zero tenant credit and zero deposit balance. All synthetic rows were rolled back after verification.

This is hosted evidence for the server-side settlement and clearance guards relevant to G06-07, G11-02 and G11-03. It does not by itself prove an official signed clearance PDF, physical-device printing, or a real tenant move-out.

## Sensitive-operation MFA hardening

Review of the hosted function showed that the vacating RPC enforced manager/permission checks but the settlement table did not independently require AAL2 for writes. A database trigger guard was added in `staging-database/sql/vacating-settlement-mfa-guard.sql` so every INSERT/UPDATE of `private.aqari_vacating_settlements` calls `private.aqari_require_sensitive_aal2(workspace_id)` regardless of the UI call path.

The migration was applied to isolated Staging. PostgreSQL catalog readback confirms trigger `aqari_vacating_settlement_aal2` is attached BEFORE INSERT OR UPDATE to the settlement table.

Hosted verification:
- With the manager session at `aal1`, the authoritative sensitive-operation guard returned `MFA_REQUIRED`.
- With the same manager at `aal2`, the guard passed.
- With `aal2`, an actual hosted `aqari_vacating_settlement(..., 'save', ...)` write succeeded and returned the saved draft through the RPC; the transaction was rolled back.

The local vacating acceptance fixture was also updated to model an explicit synthetic AAL2 manager session, so the test does not weaken or bypass the production guard.

## Release boundary

This work strengthens G09-03 and the vacating/clearance requirements, but it does **not** close the full 155-item release gate. Physical iPhone/iPad/Desktop acceptance, provider-backed integrations, complete Database/Auth/Storage backup, independent restore, transaction-preserving rollback rehearsal, remaining partial requirements and final exact-head CI/Preview evidence remain required before Production.
