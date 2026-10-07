# Onboarding master-save step-up recovery — 2026-10-06

The dialog preserves drafts when the server explicitly rejects a write with
`403 / 42501 / MFA_REQUIRED` or `MFA_RECENT_REAUTH_REQUIRED`. Onboarding nevertheless
retained a master attempt as if it might have committed, so the user could not
complete it after step-up: retries only checked for a revision that never existed.

The master attempt now distinguishes prepared and sent states. Only those exact
server rejection tuples, received from the master-write RPC itself and followed
by a successful bound-session check, make that same attempt eligible for a later
explicit retry. No automatic resend occurs. Its original payload and expected
revision are retained, so concurrent changes are not silently adopted.

Uncertain responses, generic permission errors, mismatched error tuples, and
step-up errors from later readback retain the existing read-only recovery path.
The server continues to enforce authentication, MFA, authorization and revision
conflicts on every write. No server security rules are changed.

## Verification

- Nine added runtime cases execute the actual nested master-save function.
- The original source passes 34 of the 36 readback cases and fails both step-up
  recovery cases. The corrected source passes all 36.
- Related onboarding, attachment, ownership, master-data, dialog boundary and MFA
  enforcement suites: 169 passed, zero failed.
- Tests confirm identical retry payload and expected revision, no fresh baseline
  adoption, no replay after a readback MFA error, and no replay for a revoked
  session or ambiguous/rejected error tuples.
- Runtime inventory verification and `git diff --check` pass. The existing CI
  onboarding step already runs this test file.

This stacks on PR439. Evidence is local runtime testing plus Preview source parity,
not a hosted MFA interaction or physical-device acceptance. No hosted property,
document or business record is created or changed. No migration or grant changes.
This follow-up does not publish production. Keep the separate PR423 optional
completeness-service behavior when integrating the stack.
