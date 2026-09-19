# V267 MFA enrollment recovery — 15 Sep 2026

Scope: Draft PR #192 / Preview only. No Production or myaqari.com change.

Observed Hosted Preview failure:
- Manager session remained AAL1.
- `auth.mfa_factors` contained one stale `unverified` TOTP factor for the manager with friendly name `AQARI V267`.
- Supabase has a unique index on `(friendly_name, user_id)` for non-empty friendly names.
- The Security Center reused fixed friendly name `AQARI V267`, so a fresh `enroll()` could fail before returning QR data while the stale hidden/unverified row remained.

Recovery performed:
- Removed only the stale, unverified manager TOTP factor with no verified challenge.
- Confirmed manager factor counts are now zero verified / zero unverified before the next enrollment attempt.
- Changed fresh enrollment to use a collision-proof internal friendly name (`AQARI V267 <unique suffix>`), while the UI continues to display `AQARI V267`.
- Existing verified factors still require AAL2 before removal; this safety rule was not weakened.
- Existing best-effort cleanup of client-visible pending factors remains.
- Added regression coverage asserting fixed friendly-name reuse is forbidden.

Current candidate at time of this note: `4f93a8902665ecc602d5d230820042039bd5cb15`.

B remains OPEN until real Hosted Preview enrollment + AAL2 and authenticated role runner succeed. No final acceptance is implied.
