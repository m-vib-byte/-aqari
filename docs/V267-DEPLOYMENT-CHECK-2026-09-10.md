# V267 deployment check — 10 September 2026

Production publication remains blocked by the owner's existing conditions. No production deployment, domain change, database write, account mutation or rollback modification was performed in this check.

## Reproduced defect and repair

The unmodified candidate `6bd72500b7bb9fc644520d02425835c4de971e64` passed `VERCEL_ENV=production node scripts/check.mjs` despite containing a preview release stage, preview Auth callback and isolated test database. The package check now rejects those production settings, checks browser/server agreement, and is explicitly invoked as the Vercel build command. It preserves the currently observed domain database and session namespace as the production target contract.

The complete release checksum check also reproduced a stale inventory entry for `staging-database/tests/vacating_release.sql`. The SQL bytes match the immutable GitHub source and were not changed; only that entry's checksum/size was corrected. The complete release checksum check then passed. All 33 selected runtime integrity/syntax checks also passed.

This checks build configuration only. It does not authorize promotion of an existing preview artifact, perform a database migration, create a backup, prove schema compatibility or establish acceptance. Existing preview isolation and runtime code are unchanged. A genuine production configuration still needs a compatible runtime and full acceptance; editing the release marker alone is insufficient. See [Vercel build configuration](https://vercel.com/docs/project-configuration#buildcommand).

## Evidence

- Reconstructed and verified all 388 source blobs against the immutable GitHub candidate before edits.
- Baseline: 752 Node tests passed. After repair: 758 passed, zero failures, cancellations or skips. The six added tests reproduce production rejection, verify Vercel wiring, preserve preview builds and cover data-source/session/redirect/configuration disagreement.
- Preview `dpl_Dcm7SCAvvms8dYmT2ZeAaexVdCvj` at the baseline SHA was READY. Its actual login page loaded in the connected Chrome browser; Arabic/English selection and persistence after reload worked. No authenticated business journey or physical iPhone/iPad test is claimed.
- All eight baseline GitHub workflows were failed. Retried Runtime contracts run `34421877471` at 10:56 UTC: attempt 10, job `102843020616`, failed in two seconds with `steps:[]` and `runner_id:0`. The service did not allocate a hosted runner. Its underlying cause is not established; no workflow was disabled, weakened or replaced.
- Read-only database inspection: isolated candidate database has 0 Auth users and 0 Storage objects. The current domain database has 1 Auth user, 1 Storage object, 42 leases and 0 rent payments. These are counts, not backups.
- Current production: `https://myaqari.com/`, READY deployment `dpl_E5vsxegBBLuHk6xGL7PnFXn3z9Vo`, SHA `4d5e21073e1696b2f151a56e4af38242c3122693`. Login page loaded and `/api/health` and `/api/release` returned HTTP 200. Both endpoints still describe `releaseStage: preview` inside `environment: production`; this is an existing configuration defect, not successful V267 release acceptance. The last-hour runtime error query found no clusters; that does not prove business functionality.

## Unclosed conditions

1. Restore GitHub hosted-runner execution and pass required checks on the final source. Further blind retries were stopped after reproducing the same pre-step failure.
2. Prepare and verify a production-compatible V267 runtime against the current data source. The current candidate points to an empty isolated test database; promoting it as-is would lose access to the existing account/data. Several runtime modules also pin the isolated project, so changing only public configuration is unsafe.
3. Obtain and independently restore a complete current DB/Auth/Storage-byte backup. Connected SQL read capability and source archives do not establish that condition. No backup export/download capability or dedicated backup credentials were available in this session.
4. Perform actual account login/session/save/reload/permissions/contracts/print acceptance after the target is correct. No current account exists in the isolated candidate, and production business records must remain unchanged.

The user already authorized deployment after successful checks. The remaining blocker is executable readiness and backup/restore access, not a request for renewed deployment approval. The production SHA above and historical rollback references remain intact.
