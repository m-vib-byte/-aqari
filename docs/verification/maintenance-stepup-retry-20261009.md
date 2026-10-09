# Maintenance retry after explicit MFA rejection — 9 October 2026

The hosted execution register v139 records a day-25 scheduling attempt rejected for MFA on older Preview `5a705642`. Production `82f07e7f` also treats this definite rejection as an uncertain write: both the schedule toggle and the maintenance-detail save stay disabled until a separate readback action. Six failing regression cases reproduce the blocked retry before this repair.

The two forms now distinguish an explicit write rejection (`403`, SQLSTATE `42501`, and exactly `MFA_REQUIRED` or `MFA_RECENT_REAUTH_REQUIRED`) from an uncertain outcome. They recheck the original session, retain the input and original revision, and allow a deliberate retry after the user completes MFA. They never retry automatically, refresh away a concurrent revision, or claim that MFA succeeded.

A successful write followed by an MFA readback error stays locked for reconciliation. Timeouts, network failures, mismatched codes/statuses and unrelated access denials also retain the existing reconciliation path. Tests verify lost-response recovery without a second write and rejection of concurrent edits using the original revision. The shared dialog still closes on a real session/access boundary.

Verification: 60 focused prepared runtime tests pass, including 22 new retry cases. The full prepared suite and exact-head CI/deployment result are recorded in the pull request and execution register. No schema, backend guard, MFA enrollment, role, payment, scheduling setting or business-record changes are included. This UI repair does not activate a property's schedule or establish real-device/hosted MFA acceptance.

References checked: [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa) and [current changelog](https://supabase.com/changelog). No provider API or dependency change is needed. Existing server-side MFA enforcement remains unchanged.
