# AQARI V267 — Sensitive-operation reauthentication policy

Status: support-branch implementation only. This document does **not** close G09-03 or G12-09 and is not evidence of Production acceptance.

## Policy

For sensitive operations executed by owner, general manager, or accountant identities, the database guard requires both:

1. a Supabase JWT at `aal2`; and
2. a supported second-factor AMR event (`totp` or `otp`) whose timestamp is no more than 15 minutes old.

The check fails closed when the second-factor AMR event is missing, stale, malformed, or more than one minute in the future. Token refresh and first-factor methods do not refresh the sensitive-operation window.

The enforcement remains inside `private.aqari_require_sensitive_aal2`, so existing sensitive RPCs that already call the helper inherit the freshness requirement without changing their public signatures.

## Evidence required before requirement acceptance

Static/source tests only prove that the guard is present. G09-03/G12-09 remain open until the hosted Staging candidate is exercised with real accounts and proves all of the following on the exact candidate SHA:

- fresh MFA permits an authorized sensitive operation;
- stale MFA is rejected with `MFA_RECENT_REAUTH_REQUIRED`;
- an AAL1 session is rejected with `MFA_REQUIRED`;
- a non-authorized actor cannot bypass the operation;
- session refresh alone does not extend the sensitive-operation window;
- the behavior is confirmed through the required Desktop, physical iPhone, and physical iPad acceptance path where applicable.

No Production merge or deployment is authorized by this implementation or document.
