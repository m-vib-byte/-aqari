# V267 deployment check — 10 September 2026

No production deployment, domain change, database write, account mutation or modification of an existing rollback point has been performed in this check. The owner's latest instruction is to release completed, verified portions without waiting for unfinished features. Deployment authorization is already present; the remaining operational evidence must be stated accurately.

## Reproduced defect and repair

The unmodified candidate `6bd72500b7bb9fc644520d02425835c4de971e64` passed `VERCEL_ENV=production node scripts/check.mjs` despite containing a preview release stage, preview Auth callback and isolated test database. The package check now rejects those production settings, checks browser/server agreement, and is explicitly invoked as the Vercel build command. It preserves the currently observed domain database and session namespace as the production target contract.

The complete release checksum check also reproduced a stale inventory entry for `staging-database/tests/vacating_release.sql`. The SQL bytes match the immutable GitHub source and were not changed; only that entry's checksum/size was corrected. The complete release checksum check then passed. All 31 selected runtime integrity/syntax checks also passed (correcting the initial commit message's count of 33).

The first Preview build of the repair executed the new check successfully, then Vercel required an explicit static output directory. The configuration now explicitly preserves the existing repository-root static layout with `outputDirectory: "."`; the Vercel wiring regression covers this setting. This follow-up changes build packaging only.

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

## Partial production preparation

An additional immutable-source rollback branch, `rollback/production-4d5e210-20260910`, was created at the currently served production SHA. Existing branches and deployments were preserved. This is a code reference, not a database/Auth/Storage backup.

The Vercel build now uses `scripts/build-vercel.mjs`. Preview builds retain the isolated test project. Production builds deliberately prepare browser and server configuration, every pinned runtime project reference, the current Auth storage namespace and exact canonical login callback. The source tree remains isolated; generation occurs in the disposable build checkout. `config/production-target.json` contains the current project reference and a browser-safe publishable key, not an administrative credential. The existing deployment-target check still rejects promoting unprepared preview source as production.

Read-only inspection of the current backend identified compatible core functions and two new features requiring exclusion from a partial release:

- Imported tenant editing remains available, but the new `preferredContact` input and patch key are omitted from the production artifact because the current save function rejects that key. Existing fields, optimistic revision checks and read-after-save confirmation remain active.
- The new original-document tool is hidden/disabled and its entry point fails closed because the current reservation function does not accept `supporting_document`. The existing scanner and signed-contract upload use supported document types and remain unchanged.
- New exit/vacating review and settlement/release features remain hidden by the existing backend feature-discovery response. No database feature flag, permission, function, migration, account or business record was changed. The current response advertises staff access, the financial register and the deposit register only.

The partner portal also validates its Auth callback independently of the shared adapter. Production preparation updates that exact check to the canonical domain as well; leaving the preview callback there would block production invitations.

New regression coverage exercises disposable preview/production builds, immutable scoped file transmission, account/workspace changes before requests, callback rejection, source/target drift, the current imported-tenant save contract, and disabling unavailable uploads. All 767 Node tests passed with zero failures or skips, as did 17 saved-receipt/PDF tests and 5 property-statement tests using the existing local Arabic shaping dependencies. The full inventory check and 31 selected runtime integrity/syntax checks passed for both the isolated source and a separately generated production artifact. That artifact also passed the production environment check. The two deployment test suites have been added to the existing CI workflow without removing any gate. These are local/synthetic checks, not a successful hosted workflow or production acceptance.

Production remains on `4d5e21073e1696b2f151a56e4af38242c3122693` at the time of preparation. Secure browser login to the existing account succeeded. The authenticated manager dashboard returned after reload without another login, and the saved-collection screen successfully read the current workspace (0 payments, 42 draft source contracts). No financial save or record edit was performed. This verifies the existing production version only; it does not establish acceptance of the prepared candidate. Actual candidate save/read/print flows, physical iPhone/iPad acceptance and a complete independently restored DB/Auth/Storage-byte backup are still not established. The hosted CI service has also failed before allocating a runner; successful local tests must not be represented as a green GitHub run. Unfinished integrations are not being implemented into this partial production artifact or used as a reason to wait for the entire backlog.
