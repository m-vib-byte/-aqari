# Unit readiness and preservation of existing collections

Requirement 34 / G03-11 requires preventing rental of an unready unit and retaining the existing overlap protection. The 155-item release gate remains **HOLD**. This document records isolated implementation evidence; it does not claim hosted acceptance or completion of that requirement.

Based on development commit `eb01da2bbea8b6520523bf2be739c26b312a1fec`, preserving the concurrent official PDF archive, financial cancellation and session/PDF revocation changes.

## Implemented

- An Arabic readiness form selects only permitted properties and units and records inspection date, reference and reason. Property writers can introduce a unit; maintenance staff can record readiness for existing assigned units. Viewers cannot record it.
- An append-only private history distinguishes ready, not ready and review required. Missing evidence defaults to review required. The RPC enforces current membership, section/property access, AAL2, value/date validation, revision checks and exact idempotent retries. Browser roles have no direct table grants.
- New active/draft lease inserts, reactivation, draft progression, tenant/unit changes and date extensions require the latest readiness to be ready. The existing database overlap constraint still applies. Existing lease snapshots are not rewritten by this migration.
- An AFTER INSERT guard validates only actual new rows. It avoids a BEFORE INSERT regression in which routine state UPSERTs would block collection for existing unreviewed leases. Existing unchanged or shortened leases and cancellation remain usable.
- Lease acceptance and readiness recording lock the same unit row. A readiness change cannot silently race the acceptance check. Multi-session concurrency still requires hosted PostgreSQL acceptance.
- The form confirms success only after an independent list read contains matching saved history. An uncertain retry retains the original request and values; a definite database rejection permits correction. Existing server capabilities gate the menu and form, so older backends do not expose an unavailable RPC.

## Executed locally

The existing schema was restored into an in-memory PGlite instance without service credentials or any hosted database connection. Synthetic existing leases were created before adding the guard; no trigger or check was disabled.

1. Before the migration, the new regression failed with `UNREVIEWED_UNIT_WAS_LEASED`.
2. After the migration, the readiness SQL suite passed: atomic rejection, existing UPSERT, extension, activation, overlap, scoped roles, immutable history, replay, revision and AAL2 checks.
3. The separate projection suite passed against `aqari_save_state_v267`: a real synthetic receipt saved once for an existing unreviewed signed lease; an unreviewed new contract was rejected without changing state/revision; explicit readiness then allowed that contract, preserving the earlier contract and receipt.
4. 51 targeted JavaScript tests passed with zero failures or skips, including seven actual readiness form tests and existing workspace/session/private-file regressions. These use a synthetic DOM and RPC fixture, not physical devices or an authenticated hosted browser.

Both SQL suites and the readiness form tests are added to the existing Runtime contracts CI gate. Its result must be checked on the exact commit separately from the local results above.

## Application and acceptance still required

The migration is code only and has **not** been applied to a hosted database. Before application, verify the independent test target and a tested backup; dependencies are `mfa-enforcement.sql` and `staff-property-scope.sql`. Apply `unit-readiness.sql`, then the updated `workspace-feature-discovery.sql`. Never apply local synthetic fixtures to hosted data.

Review real units explicitly; do not bulk-mark them ready to bypass acceptance. Validate actual contract and receipt saving, role denial, revision races and cancellation against the hosted target, followed by iPhone/iPad/desktop usage. This change does not substitute for the complete Database/Auth/Storage-byte backup, isolated restore, V266 rollback rehearsal or the remaining 155 requirements.

No production SQL, data, attachments, domain, protection setting or production deployment was changed. The local review fixture is not the remote server workspace; Web Console access to `/root/workspace/aqari` remains unverified.
