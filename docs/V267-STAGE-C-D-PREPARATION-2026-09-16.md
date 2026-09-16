# AQARI V267 — C/D preparation lane — 16 Sep 2026

Status: **PREPARATION ONLY / NOT ACCEPTED**.

This lane is isolated from Phase B PR #192 and Issue #193. It may fast-forward to read the current B candidate, but it must not write to the PR/issue, merge to `main`, deploy Production, change DNS, or change `myaqari.com`. Official order remains **B close → C acceptance → D → owner practical test → explicit owner approval**.

## C — prepared artifacts

Existing repository evidence is reused rather than duplicated: `staging-database/verification/v267-data-safety-manifest.sql` produces read-only business/Auth/Storage metadata fingerprints; `docs/V267-ROLLBACK-VERIFICATION-2026-09-09.md` documents historical source-only rollback drills and explicitly says they do not satisfy the full Database/Auth/Storage restore gate.

New preparation guard `scripts/v267-stage-c-preparation.mjs` adds fail-closed checks for the remaining C evidence package:

- refuses Production-like targets, `myaqari.com`, and the known Production/V266 project refs;
- creates/verifies a backup evidence manifest only when Database, Auth, and **Storage bytes** are all present and SHA-256 fingerprinted;
- compares pre-backup and post-restore data-safety manifests, ignoring only generated timestamps/warnings and, by default, ephemeral Auth sessions; strict session comparison remains available;
- validates an independent restore report only if external side effects are disabled and DB/Auth/Storage-byte restore plus readback/hash equality are all proved;
- validates a rollback point only when it is application-source rollback with data preservation, automatic DB rollback is disabled, post-checkpoint transactions are captured, and audit/documents are preserved.

Templates under `evidence/templates/` define the exact evidence shapes. They intentionally contain false/placeholders for unexecuted restore/rollback facts and therefore cannot be mistaken for acceptance evidence.

## D — prepared artifacts

`scripts/v267-stage-d-precheck.mjs` and its template prepare the owner-acceptance packet without asserting acceptance. The guard requires the 155-item evidence matrix, Desktop/iPhone/iPad practical flow plan, physical iPhone/iPad, existing release-gate and owner-approval validators, and explicit flags that B is not closed, C is not accepted, Production changes are forbidden, owner testing is still required, and later explicit owner approval is still required.

No D packet is allowed to carry an approval timestamp/SHA/decision during preparation.

## Tests in this lane

- `tests/v267-stage-c-preparation.test.mjs`: Production target denial; complete backup bundle; checksum tamper detection; incomplete-bundle denial; restore manifest comparison; isolated restore gate; data-preserving rollback gate.
- `tests/v267-stage-d-precheck.test.mjs`: prepared-only acceptance semantics; early Production/acceptance denial; physical iPhone/iPad + practical-flow requirements.

These tests are source/tooling tests. They do **not** claim that a current full Staging backup has been taken, an independent live restore has been executed, physical devices have been tested, or the owner has accepted anything.

## Remaining after B closes

1. Freeze the exact B-closing candidate SHA and run `v267-data-safety-manifest.sql` immediately before backup.
2. Create the private complete backup: Database + Auth + original Storage bytes; generate the new backup manifest and store the backup outside Git/repository/chat.
3. Restore to a new isolated target with outbound notifications/payments disabled; rerun the data-safety manifest and byte checks; complete the restore report with actual timing/RTO.
4. Rehearse the data-preserving application rollback point against the same exact SHA, explicitly reconciling writes created after the checkpoint; mark `rehearsed=true` only after that proof.
5. Only then evaluate C for acceptance. D may then use the exact unchanged candidate for physical-device/user acceptance and the existing full release/owner-approval validators.
