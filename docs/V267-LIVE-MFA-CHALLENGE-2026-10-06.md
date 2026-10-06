# Live preview MFA challenge — 2026-10-06

Candidate before fix: 1fb499f7d87f1c09e4355c8e6c5402682822a0f7 (PR #428).

Authenticated browser testing confirmed that selecting the custom contract category exposes the approved experimental template and renders its ten clauses. The preview public config targets ofgmcsmxmdswlovsckqs.

A synthetic unit creation attempt for TEST-EXEC-20261006 closed the dialog without creating the unit. The preview PostgreSQL log at 2026-10-06T06:09:04.730000 reports MFA_REQUIRED. A read-only units query confirmed zero matching rows. No contract or unit was created by this attempt.

The dialog now treats only exact PostgreSQL 42501 MFA_REQUIRED / MFA_RECENT_REAUTH_REQUIRED challenges as recoverable while the original authenticated user/workspace/role still match. It retains input and shows an explicit translated error message; no automatic write retry occurs. Expired sessions, changed scope, and every other authorization denial still dispose the private view.

Verification: runtime tests cover both MFA cases, retained input, explicit retry, suppressed queued navigation, expired sessions, workspace/role changes, and generic access denial.

Outstanding: real authenticated new-contract save and server PDF archival remain unverified because the session needs a valid recent second factor. This fix does not remove, bypass, or alter the database MFA guard. No production changes, merge, or deployment authorization is implied.
