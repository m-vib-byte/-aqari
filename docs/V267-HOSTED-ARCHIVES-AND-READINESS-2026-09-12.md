# Hosted archives, unit readings and readiness — 12 September 2026

Release gate: **HOLD**. The owner has authorized completion and release after all 155 requirements and the existing acceptance, backup, restore and rollback gates. No renewed release approval is needed.

## Target and activation

Source baseline: `489e45e0d1d49e2f43b3d3b2f65fc402242da3bc`, PR #75, `fix/v267-jsonb-readback`. All 510 source blobs were reconstructed from existing workspace copies and approved GitHub file reads, then verified against the exact Git tree. No remote clone or DigitalOcean filesystem change was made.

The Supabase branch list confirms `ofgmcsmxmdswlovsckqs` is the healthy independent `v267-isolated-test` branch of `djkpkkgoibruaezdrchb`. The project-details endpoint does not resolve this branch, while branch listing, migration history and SQL do. Only this independently verified branch was changed.

| Applied migration | Behavior |
|---|---|
| `20260912123429_v267_hosted_archives_and_meter_readings` | Activates scoped monthly financial archive; immutable unit entry/exit meter readings; authoritative document sources, reserved numbers, source/hash validation and scoped archive; original PDF byte storage and service-only commit; feature discovery. |
| `20260912123701_v267_hosted_unit_readiness` | Adds explicit immutable inspection history and new-tenancy readiness guards while retaining existing-lease collection and the overlap constraint. |

Migration identifiers above were returned by the provider after successful application. The recorded SQL is the exact applied SQL. These changes add tables/functions/triggers and preserve existing business records. They do not mark existing units ready without inspection. PDF server credential configuration is still separate from database activation.

## Executed acceptance

- The unchanged source baseline passed all **25** local SQL suites in in-memory PostgreSQL/PGlite via `test:completion`, including readiness and the actual state-save/receipt-projection regression. This is local synthetic evidence.
- Five generated suites under `staging-database/hosted-test/` passed on the hosted branch, both before readiness activation and, with explicit synthetic inspection fixtures, after activation. They create an independent temporary workspace, use password-free synthetic identities, enforce role/property checks, and roll back every fixture.

| Hosted suite | Proven scope |
|---|---|
| `financial_archive.sql` | Eight monthly streams, cancelled receipt classification, opening balances separated from receipts, historical closed snapshot, month validation, accountant property scope, cross-workspace and maintenance-role refusal. |
| `unit_meter_readings.sql` | Entry/exit save and readback, exact retry, append-only correction history, chronology, rejection of unverified photos, assigned-property scope, accountant write refusal and audit. Storage image bytes were not uploaded in this test. |
| `official_document_source_binding.sql` | Twelve document kinds issued from saved sources; body/hash/amount forgery refused; numbering/retry, cancellation and archive scope checked. |
| `official_document_pdf_archive.sql` | Exact test bytes saved/read back, browser/anonymous write refusal, trusted-renderer actor scope, checksum/version checks, retry, correction, cancellation and membership revocation. The SQL fixture uses a small `%PDF-` test payload; this is not a browser PDF-download or printing test. |
| `workspace_feature_discovery.sql` | Installed service discovery, unavailable-service hiding, manager-only features, foreign workspace and revoked membership refusal. Temporary function renaming rolls back. |

The separate `unit_readiness_activation.sql` rehearsal passed **before activation** in one hosted transaction: legacy fixtures were created before the actual readiness DDL, then both original readiness suites ran in savepoints. It proved new-tenancy refusal, reviewed-unit acceptance, real state RPC collection/readback, preservation of existing contract/receipt, overlap, immutable history, role/property scope, retry and MFA. Its entire DDL and all fixtures rolled back before applying the persistent migration. It is a before-activation rehearsal, not a repeatable post-activation script.

The archive test generator deliberately gives only its synthetic fixture units an explicit ready inspection. No application trigger or access check is disabled. These scripts do not contain a database URL, password or service credential and cannot connect to a database themselves.

## Preservation and limits

Compared all **79** existing public/private application tables with `v267_staging_backup_20260912`: **79 exact matches**, zero mismatches before activation and after hosted acceptance. This is an in-database application-data checkpoint, not an external Database/Auth/Storage backup or a restoration test.

| Preserved relation | Rows | Fingerprint before and after |
|---|---:|---|
| Workspaces | 1 | `e607b6b13585d95048358485e0321ea0` |
| Rent payments | 2 | `7d96b8df6e03a1b99473400ab9f302df` |
| Leases | 1 | `c85ef299694a07cf75879b5ce167cf8b` |

Auth users stayed at **1**, Storage objects at **1**, and readiness records at **0** after rollback. No existing unit received a guessed inspection. No fixture workspace remained. PostgreSQL sequences can advance during rolled-back tests; there is no claim that sequence counters roll back or that receipt numbers are gapless.

The security advisor still reports intentional private RLS tables without direct client policies, authenticated SECURITY DEFINER RPC exposure, and an existing leaked-password-protection warning. New direct table access and anonymous RPC access are denied; role/property/MFA checks were tested. There is no zero-advisory claim.

At the source baseline above, and at activation commit `5bdccd075c4608ae41b9b3206b530dbdbb7549f1`, all nine CI workflows completed successfully, including hosted signed-out Preview E2E and authenticated-renderer tests with a synthetic backend. The matching activation deployment `dpl_8Qace9DHb8UykGLsKLQVHd7mDdHH` was READY. CI alone is not real-user acceptance; the subsequent actual-account checks are recorded below.

Remaining gates include real account/device journeys, PDF server credentials and end-to-end download, archiving atomically at issuance, remaining supplemental financial/form/circular features, real provider delivery and K-Net, source reconciliation, complete external Database/Auth/Storage-byte backup, isolated restore, and transaction-preserving V266 rollback. Neither these migrations nor this report approve all 155 requirements or publish production. `main` remains `4d5e21073e1696b2f151a56e4af38242c3122693` at this verification.

## Actual-account read acceptance and receipt compatibility repair

The owner securely signed into the AQARI application on the protected branch Preview. The actual manager dashboard, saved documents, More tools, unit readiness, monthly financial archive, official-form saved context and security center loaded with that account. Existing TEST-01 correctly showed that inspection is needed with revision zero. The existing test contract and two saved test receipts were readable. This is a hosted desktop read journey, not a real-account write, physical iPhone/iPad acceptance, or production acceptance.

That journey exposed two genuine compatibility defects with existing saved receipts:

1. The financial archive labelled Arabic `مدفوع` as unknown and omitted it from the paid filter and filtered Excel output. The UI now maps the four existing Arabic status aliases to their canonical display/filter keys. Original JSON exports retain the saved status. Two behavioral regressions failed before the fix and all 46 financial archive tests passed after it, including CSV and Excel filtering. A stray literal `\n` at the top of the application document was also removed.
2. Existing receipt snapshots store the collector in `accountant`. Official-form context and archive descriptions recognized only newer field names. Both functions now use saved `collectorName`, then `collector`, then `accountant`, without substituting the current user or modifying receipt snapshots. Hosted regressions first failed with `SAVED_ACCOUNTANT_NAME_MISSING` and `SAVED_COLLECTOR_READBACK_FAILED`. The provider then successfully applied function-only migration `20260912130249_v267_saved_receipt_collector_readback`. The source-binding, financial-archive and immutable-PDF suites passed afterward. The actual account then selected TEST-V267-RECEIPT-01 and displayed its saved collector correctly. All 25 local SQL suites passed with the new fixtures.

After this repair and the rolled-back hosted tests, the same 79 application tables still matched the checkpoint exactly. No receipt amount, status, snapshot, lease, or readiness state was edited. Existing dashboard and monthly archive figures use different views of test source records; they have not been reconciled by guessing or deleting a saved payment.

The security center reports AAL1 and no verified second factor for this account. Sensitive saves/approvals remain subject to the existing AAL2 requirement. Creating a new authenticator factor requires the account owner's secure browser interaction; no factor was created, no credential was read, and no MFA rule was relaxed. Full acceptance of the 155 items, provider integrations, complete backup/restore, and V266 rollback remain open. The status UI patch has local evidence here; its fresh deployment and browser verification must be checked separately from the already verified activation commit.
