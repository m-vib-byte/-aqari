# AQARI V267 — Recent MFA hosted acceptance evidence

Date: 14 September 2026 (Kuwait time).

Scope: isolated Preview/Staging Supabase only. Production, `myaqari.com`, `main`, and historical V266 were not touched.

## Gap addressed

The V267 sensitive-operation guard already required AAL2 plus a supported second-factor AMR event no older than 15 minutes. The 155-item acceptance record still treated recent re-authentication as lacking hosted evidence. This slice adds a reproducible hosted probe and makes its source contract part of the exact Vercel Preview build.

## Hosted execution

Target: isolated Preview Supabase project `ofgmcsmxmdswlovsckqs`.

A transaction-scoped synthetic general-manager fixture exercised `private.aqari_require_sensitive_aal2` directly:

1. `aal2` with no AMR second-factor event was rejected with `MFA_RECENT_REAUTH_REQUIRED`.
2. `aal2` with a TOTP AMR timestamp 16 minutes old was rejected with `MFA_RECENT_REAUTH_REQUIRED`.
3. `aal2` with a current TOTP AMR event passed the same guard.
4. The entire transaction was rolled back; the follow-up fixture-workspace count was `0`.

The first exploratory hosted invocation also reached the same `MFA_RECENT_REAUTH_REQUIRED` guard when AAL2 lacked a recent AMR event, independently confirming that the hardened function is active on isolated Staging.

Reproducible SQL: `staging-database/tests/recent_mfa_hosted_acceptance.sql`.

Preview-build source contract: `tests/v267-recent-mfa-hosted-evidence.test.mjs`.

## What this proves

This is hosted database evidence that the current isolated Staging guard fails closed for missing/stale recent second-factor evidence and accepts a current TOTP factor. It strengthens G09-03 and G12-09 evidence only.

## What this does not prove

This does not prove that owner/general-manager/accountant real accounts are enrolled correctly, that recovery factors work, or that the application UI prompts for re-authentication correctly on Desktop/iPhone/iPad. It does not satisfy hosted real-account login/session/save/reopen/contracts/printing acceptance, all 155 requirements, same-SHA green GitHub Actions, complete Database/Auth/Storage-byte backup, independent restore, transaction-preserving rollback, Production configuration, final owner practical testing, or Production approval.

Release Gate remains HOLD. READY/build success is not hosted application acceptance and is not Production approval.
