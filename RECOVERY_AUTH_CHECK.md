# Isolated recovery identity check

This preview-only page prepares real provider Auth/TOTP in the existing recovery project. It does not close the full operational recovery gate and must not be merged or promoted as a production launch.

Entry: `/recovery-auth.html` on the exact Vercel preview deployment for this branch. Production hostnames fail closed. The main application configuration is unchanged.

The browser uses only the existing recovery project's public anon key. Passwords, OTPs, enrollment secrets and sessions are not logged or exported. Session persistence is disabled. Enrollment starts only after the owner explicitly presses its button. Existing verified factors are reused, never automatically removed. Cancellation only removes this page's pending enrollment.

Owner identity is checked with provider `getUser()` before and after sensitive steps. A real verified TOTP factor and AAL2 are required before the read-only `aqari_workspace_access` check. Account/role/workspace must match the existing recovery owner. No production database, property records, payments, files or identity mappings are modified.

Validation: `node --test tests/v267-recovery-auth.test.mjs`. These are synthetic client boundary tests, not evidence that real owner login or MFA occurred. The same tests are part of Vercel's pre-build checks. Actual owner interaction through the secure login flow and a subsequent provider check remain required.

Rollback: discard the preview branch/deployment. This does not alter existing accounts. Any owner-created verified recovery factor remains in the recovery provider until the owner explicitly removes it; this page never deletes a verified factor.
