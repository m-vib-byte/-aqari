# V267 security, integration and accounting hardening — 13 Sep 2026

Preview/support-only continuation from PR #144 exact head `70bfb68aa0d1958063e1ea0403f0d4b65e5ba817`.

## Implemented

- Upgrade the sensitive-operation MFA primitive from AAL2-only to AAL2 plus a TOTP/OTP AMR event no older than 15 minutes, failing closed for missing, stale, malformed or implausibly future timestamps.
- Require that same recent-MFA guard before partner property access is granted, changed or revoked, while preserving manager scope, property validation, staff/partner conflict checks, optimistic revision locking and audit history.
- Reject secret-like values from integration `public_metadata` recursively in the browser and database, including nested access/refresh tokens, authorization fields, API keys, service-role keys and civil IDs. Existing unsafe rows are never silently rewritten or deleted by the upgrade source.
- Add pure, fail-closed provider journal maps for QuickBooks, Zoho Books and Xero. Journals must be balanced, typed, currency-consistent and credential-free. These maps perform no network delivery and do not claim OAuth/Sandbox provider acceptance.
- Execute the new security/integration/accounting suites in the exact Vercel Preview build and in a dedicated read-only GitHub workflow.

## Application order for isolated Preview/Staging

1. Existing membership/staff and partner-property access sources.
2. `staging-database/sql/mfa-enforcement.sql`.
3. `staging-database/sql/partner-access-mfa-guard.sql`.
4. Existing external integration register, or the updated fresh-install source.
5. `staging-database/sql/external-integration-public-metadata-hardening.sql` for an existing isolated Staging database.

The metadata upgrade aborts if an existing row needs manual secret remediation. No business row is automatically deleted or rewritten.

## Acceptance boundary

This is programming/test hardening only. It does not close G09-03, G12-09 or G12-19 by itself and does not prove live provider delivery. It does not satisfy 155/155, hosted real-account acceptance, physical iPhone/iPad testing, full Database/Auth/Storage backup including attachment bytes, independent restore, transaction-preserving rollback, correct Production configuration, final owner practical testing or exact-SHA Production approval.

Owner governance dated 13 Sep 2026 Kuwait time controls. Preview/design/READY is not Production approval. No merge to `main`, Production deployment, `myaqari.com` change or historical V266 mutation is authorized by this change.
