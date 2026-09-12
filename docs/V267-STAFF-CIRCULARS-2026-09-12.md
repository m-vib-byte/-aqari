# Staff circulars and explicit acknowledgement — 2026-09-12

Requirement 153 now includes an internal staff audience as well as the existing tenant notices. This change adds actual UI, database authorization, immutable published revisions and explicit recipient acknowledgement. It does not claim all 155 requirements are accepted. Production release remains HOLD.

## Implemented behavior

- A manager selects active staff in the same workspace, saves a draft and publishes it in a separate action. A saved draft is not delivered to employees.
- The published text and recipient snapshot cannot be edited. A new text requires a new draft; archiving preserves the published version and acknowledgements.
- Employees see only their own assigned, published circulars. Opening the screen never records acknowledgement. The employee must explicitly acknowledge the current revision; the server records the authenticated identity and time.
- Manager writes require the existing notifications permissions and AAL2. Cross-workspace requests, unassigned recipients, stale revisions, revoked membership and anonymous execution are refused. Staff cannot read the directory or other recipients' acknowledgements.
- Save, publish, archive and acknowledge retries are idempotent. The UI retains an uncertain request unchanged and shows success only after independent matching readback. Plain text rendering prevents circular text from becoming executable HTML.

## Applied migration and actual verification

Provider migration `20260912130724_v267_staff_circulars_acknowledgements` was successfully applied to the isolated hosted project `ofgmcsmxmdswlovsckqs`. Its exact applied SQL is stored in the matching migration file. The existing workspace-access function was checked before replacement, preserving all other capabilities and adding the `staff_circulars` discovery flag.

The self-contained `staging-database/tests/staff_circulars.sql` passed both locally in PGlite against the saved schema catalogue and on the hosted database. It creates two temporary workspaces and four password-free test identities inside a transaction, then rolls everything back. It exercises actual PostgreSQL roles and RPC authorization, draft/publish/readback, stale conflicts, audience isolation, AAL2 enforcement, explicit acknowledgement, immutable history, archiving and retries. Synthetic JWT settings in this SQL suite are database authorization evidence; they are not a real HTTP sign-in journey.

The complete local completion command also passed all 26 SQL test suites, preserving the existing 25 suites and adding staff circulars. All seven `tests/v267-staff-circulars-runtime.test.mjs` cases passed. They exercise the actual UI module with a synthetic DOM and RPC transport, including uncertain writes, independent readback, explicit acknowledgement, invalid audiences, permission revocation and feature discovery. They are not physical device acceptance.

After hosted rollback, all **79** existing application tables still matched the prior staging checkpoint exactly. Auth users remained **1**, Storage object metadata rows remained **1**, and the four new circular tables contained **0** records. No fixture users or workspaces remained. No real circular was published. The public wrapper is SECURITY INVOKER, anonymous execution is denied, and direct private-table access remains denied. The private guarded implementation uses an empty search path.

The security advisor still reports existing private tables with RLS and no client policies, authenticated SECURITY DEFINER exposure, and the existing leaked-password-protection warning. These results are not a zero-advisory claim. Direct access is intentionally denied; authorization is enforced and tested through the guarded RPC. See the [Supabase RLS advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Remaining acceptance

The first source commit, `3f1a4a71e06507e6090f4ba3e87ba8f842be5137`, produced a READY Preview. CI then identified the production-preparation script still matching the previous tools menu exactly. The preparation source now includes the staff-circular entry while retaining the exact-source guard; a regression also verifies that removal of this entry is rejected. All 15 deployment-target and production-preparation tests passed after the correction. The corrected source must still pass CI and be checked against its own deployed SHA. Manager and staff real-account writes, acknowledgement across independent sessions, and physical iPhone/iPad/desktop acceptance remain open. External email/SMS/push delivery is not implemented by this feature; an internal acknowledgement is not an electronic signature or proof of delivery through an external provider.

The 79-table checksum comparison is an integrity check, not an external backup. Complete Database/Auth/attachment-byte backup, isolated restoration and transaction-preserving V266 rollback are still required before production release. Existing production, the DigitalOcean server and its files were not changed by this feature.
