# PR 200: SQL and live continuation, 18 September 2026

Continues exactly `02086440686e46f7475146d26071cc8369ebe26e`. The owner explicitly authorized ongoing internal PR preview testing. myaqari.com remains the sole owner trial URL. No production promotion, migration, hosted permission change or business-data write was performed in this checkpoint.

## Closed in this continuation

- The full existing in-memory SQL completion command passes: **202 executed SQL steps, 164 distinct files, 70 test-file executions**. Forty-three positive test fixtures and five local setup fixtures now provide a current supported TOTP AMR timestamp. These are synthetic claims inside the isolated test process, never browser tokens or hosted session changes. Existing AAL1 denial cases are untouched. The existing missing/expired/current MFA probe is also run after its staff-schema prerequisite. Production MFA, RLS, permissions, triggers and constraints are unchanged.
- Full generated-output Node suite: **1,633 passed, zero failed or skipped**. This includes the new startup translation case with no credential inputs present and the existing tests that reject credential reads/writes and protect authenticated language preferences.
- Direct English UI review found five untranslated account-menu captions, two tenant status labels, and two startup messages. All nine are now catalogued in the five supported languages. Tenant status translation is restricted to the fourth column of the tenant table; names and other record cells are preserved. The account menu displays the existing protected account name without copying the legacy mixed-language save-status suffix.
- The login locale renderer now also translates the restoring-session gate before credential fields exist. It does not change authentication or read credential values.
- Reviewed inventory: **3,418 unique visible sources, zero missing catalog values**. This is source coverage, not complete live coverage.

## Live session evidence on 02086440

At 17:56:29 UTC, the connected Chrome app showed the locked login gate; the distinct Safari session created at 16:06:08 remained in the QA auth-session metadata. Secure entry authenticated Chrome at 17:58:02. Reload reopened the dashboard, and the repaired account button exposed the original functional account menu.

At 17:59:46 UTC both Chrome and Safari sessions existed. Clicking the actual account-menu Sign out control returned Chrome to the login gate. At 18:00:21 UTC, the Chrome session was absent while the same Safari session remained. This is live evidence of ordinary current-device-only logout. No global logout was executed. A second secure sign-in restored the dashboard; switching to English restored the signed-in app with English selected.

## Direct UI review on 02086440

The actual authenticated Desktop Chrome review covered the reference dashboard, account menu, properties, tenant table, unit readiness including loaded property/unit/history controls, saved rental contracts, collections entry, maintenance, documents, expenses and period closing, staff/payroll, reports with saved-data read, partner-access editor, general-manager controls and settings. Forms and permission editors were viewed only. Report read returned the two existing payments totaling KWD 200. Stored names and descriptive record values remained unchanged.

The screenshot `aqari-dashboard-02086440-20260918.jpg` documents the real dashboard at this SHA. It is neither a generated mockup nor evidence for a later SHA. It shows the right brown rail, skyline hero, six metrics, property/collection/assistant panels, and quick-action/alert/report panels. Full reference acceptance across every page is not asserted.

## Still open

New text repairs require hosted verification at their committed SHA. Full deep-dialog/document coverage in every language and every role, saved-write/readback on the final SHA, physical iPhone/iPad verification, full owner requirement acceptance, and exact-candidate GitHub/release gates remain open. The connected cloud browser advertises no resize/device-emulation capability; device-width unit fixtures must not be called physical-device tests.

The existing GitHub evidence is a failed job without runner or steps plus the saved owner budget annotation. Current billing settings require authenticated owner access; repeating the unsupported password sign-in or rerunning workflows is not a resolution. No release gate was disabled or relabelled as passed. No change was made to myaqari.com.
