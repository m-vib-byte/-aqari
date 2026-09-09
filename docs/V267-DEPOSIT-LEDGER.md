# V267 deposit ledger — release acceptance remains open

9 September 2026. This change implements the deposit receipt/refund part of requirements G04-07 and G04-13. It does not implement a final evacuation settlement, damages assessment or clearance certificate.

## Implemented behavior

- A separate deposit ledger reads signed contracts from the current workspace/property scope. The contractual deposit is an agreed amount, never inferred received cash or rental income.
- Authorized collection staff can record a receipt; only the general manager with collection write access can record a refund. Each entry stores the server-derived contract, tenant, property and unit snapshot, actor, date, amount and voucher number.
- Amounts use exact three-decimal KWD. Receipts cannot exceed the contractual balance; partial and full refunds cannot exceed received money. Backdated movements also respect the historical balance. Closed financial periods reject new movements.
- A workspace lock followed by a lease lock serializes balance changes. A fixed request UUID and normalized request prevent an interrupted reply from creating a duplicate. Non-cash references are unique per workspace, movement kind and payment method.
- An immutable saved entry is reread before its receipt is prepared for printing. Changes to current tenant names do not replace the original receipt snapshot. Printing is HTML through the browser's print/PDF facility; this is not a digital signature, external bank transfer or clearance.
- The interface supports Arabic, English, Hindi, Urdu and Malayalam. Its pending recovery marker stores only scope-bound operation identifiers and a hash, without the financial form fields. Permission/session loss clears private displayed records and document URLs.

## Verification and limits

The local PostgreSQL suites cover deposit save/readback, exact amounts, partial/full refund limits, historical balance, property and workspace scope, revoked access, manager-only refund, immutable snapshots, duplicate IDs/references and period-close recovery. All synthetic account and financial rows are rolled back and counts compared with the initial state.

The combined local suite passed 709 Node tests with zero failures or skips. Tests exercise validation, lost-response recovery, request persistence, print escaping and UI access boundaries. The GitHub browser job includes five languages across Chromium/WebKit and desktop/phone/tablet viewport sizes, including save/reload, rejection followed by correction, interrupted refund reply, saved receipt rendering and revoked-access clearing. Consult the latest exact-commit CI result in PR #70; the existence of these tests is not evidence that they passed.

These automated scenarios use synthetic browser backends. They do not prove real-account login, hosted browser round trips or physical iPhone/iPad printing. The hosted deposit SQL regression also passed in the isolated project. Subsequent reads returned zero Auth users, memberships, properties, tenants, leases, rental payments and deposit entries. Anonymous RPC execution and authenticated direct table access were both denied. The five combined local SQL suites also passed. The security advisor also flags the intentionally exposed authenticated SECURITY DEFINER RPC; its anonymous grant is revoked and it checks workspace/property/role access. See [RPC advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). It reports the intentional private ledger RLS-without-policy finding: direct privileges are revoked and access is through the checked RPC; see [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Backup and publication gate

The independent test project is `ofgmcsmxmdswlovsckqs`. Its preflight returned zero Auth users, memberships, leases and rental payments. No active production account is copied or impersonated in it.

Read-only deployment audit identified current production `dpl_HcqaX1zBBrhmMD2qnMakENyH1Djb` at `2cd2804d496b82c0ce9cf5e09fd3d9368a62510a` using `djkpkkgoibruaezdrchb`. The saved V266 candidate `dpl_57d2SrefrVhkhwfdyqi5HtAwZrci` at `af9515e624afe9a524f1b16ed8b37e47583da786` uses `qtavnufzbkdfeauyukot`.

Returning a deployment alias to V266 would select a different database and cannot by itself preserve transactions entered in the current database. The older application JSON checkpoint is not a proven current backup of PostgreSQL, Auth and stored file bytes. No full restore rehearsal or current backup identifier has been verified. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups) excludes the bytes of Storage objects.

The user has authorized publishing after successful practical checks and a recoverable backup. Those conditions remain unmet: the test project has no activated account, the cloud browser connection failed before opening a page, physical devices have not been tested, and the backup/restore evidence is incomplete. Production, V266 and `myaqari.com` must therefore remain on their current configuration. There is no reliable production ETA until these access and recovery prerequisites are resolved and the remaining functional gaps are accepted or completed.
