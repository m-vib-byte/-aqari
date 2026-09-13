# AQARI V267 — Owner release governance (13 Sep 2026, Kuwait)

This document records the owner's current release authority and supersedes any older repository wording that grants automatic, incremental, or pre-authorized Production publication.

## Binding release rule

Development, testing and independent Preview deployments may continue. They do **not** authorize a merge to `main`, a Production deployment, a `myaqari.com` change, or any mutation of the historical V266 reference.

Before the owner can be asked for final Production approval, one exact unchanged candidate SHA must have all of the following independently evidenced:

1. all 155 requirements accepted with requirement-level evidence;
2. every required GitHub CI check passed on that exact SHA;
3. the matching hosted Preview tested and accepted beyond a READY build state;
4. real authenticated accounts proving login, session continuity, save, reopen/readback, permissions, contracts and printing on Desktop, a physical iPhone and a physical iPad;
5. a current complete backup of Database, Auth and Storage including the actual attachment bytes, not metadata only;
6. an independent restore with restored attachment bytes verified;
7. a rehearsed rollback that preserves both the transactions already present at the checkpoint and transactions created after it;
8. the intended Production configuration verified for the exact candidate.

After those technical gates pass, the owner performs the final practical test on that exact SHA. Production remains blocked until the owner later gives an explicit Production approval for the same exact SHA. Preview/design/luxury approval is not Production approval.

The machine-readable validator in `scripts/v267-release-gate-manifest.mjs` is fail-closed around these technical conditions. The owner-approval validator in `scripts/v267-owner-production-approval.mjs` additionally requires the exact decision token `approved_for_production`, the same final-tested SHA, repository-owner provenance and an approval timestamp later than final-test completion.

## Current state

Until every condition above has evidence on one exact candidate, the Release Gate is **HOLD**. A Vercel `READY` state, local/synthetic tests, mocked browser runs, or successful build-time tests are useful evidence only for their narrow scope and must not be relabelled as hosted, physical-device, backup/restore, rollback, or Production acceptance.
