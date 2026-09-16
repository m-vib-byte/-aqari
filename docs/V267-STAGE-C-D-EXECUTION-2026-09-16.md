# AQARI V267 — Official C execution + D gate snapshot — 16 Sep 2026

Status: **B CLOSED / C OPEN / D NOT ACCEPTED / RELEASE GATE HOLD / NO PRODUCTION CHANGE**.

This report is evidence-only on the isolated C/D lane. It does not modify the exact B-closing application candidate, PR #192, Production, DNS, or `myaqari.com`.

## Frozen candidate

- Exact candidate SHA: `d4862762ac5df21209177c7c6fdcd31cdf8293cb`.
- Phase B real Hosted Preview acceptance: PASSED.
- Staging acceptance evidence id: `222b5a43-eb3d-4cbe-ab61-122a9a1bcf6f`.
- Exact Vercel Preview deployment: `dpl_2CyyF4iLE2csCEVu27wWoZFkx5ky`, host `aqari-1p165cmpl-m-vib-5421.vercel.app`, state READY, Preview target.
- Current Production rollback reference is unchanged: deployment `dpl_5dTK9q34xn86GdHNTzKMvEp8PS37`, SHA `02d22d41090eddc77df945d285ac1df515044d4f`, state READY. No alias was changed.

## Phase C — executed evidence

The read-only `v267-data-safety-manifest.sql` procedure was run against isolated V267 Staging project ref `ofgmcsmxmdswlovsckqs` after B closed. A compact repeat digest at `2026-09-16T11:16:50.345825Z` recorded:

- AQARI tables fingerprinted: 158.
- AQARI rows in those tables: 294.
- Business fingerprint: `44cb4ad23f5f529bdb48320df20c0d0b6e04b3fb5a0ec15034bbd7a47f63dd6d`.
- Auth: users=1, identities=1, MFA factors=1.
- Storage: buckets=3, objects=2, reported bytes=156509.
- Storage metadata fingerprint: `b092d329ee7ea475afa0b0f444c75869c39d893291cafdac1bfd290b904a142a`.
- Uploaded AQARI documents=2; both Storage objects exist and their recorded sizes match.
- Rent payments=2; amount total=200 KWD.
- Active/prepared/provisioning QA accounts=0.
- Exact-candidate B acceptance exists and is passed.

Targeted integrity readback returned zero for: duplicate property refs; duplicate unit numbers per property; duplicate civil IDs; duplicate contract numbers; bad lease dates; orphan lease-unit/lease-tenant/payment-lease links; overlapping non-terminal leases on one unit; non-positive payments; duplicate payment references; duplicate contract serials; duplicate receipt serials; missing uploaded Storage objects; Storage/document size mismatch; orphan memberships; ownership head/revision mismatch; ownership percentage total mismatch; ownership area total mismatch; and surviving QA Auth users.

One PostgreSQL CHECK constraint is present as `NOT VALID`: `private.aqari_tenant_ledger_entries.aqari_opening_entry_direction`. An explicit read-only scan found **0 violating rows**. This is recorded as schema-validation cleanup, not current data corruption.

### C security/performance observations

Supabase Security Advisor currently reports `Leaked Password Protection Disabled` (WARN). It also reports private-schema RLS/no-policy INFO findings and authenticated SECURITY DEFINER RPC warnings. Those RPC/private-schema findings require scope/grant review against the intentional RPC security model; they are not silently reclassified as passed. No security setting was changed by this report.

Performance Advisor reports informational unindexed-FK and historical backup/restore-schema findings. No index or schema change was made to the frozen candidate during C evidence collection.

### C blockers — therefore C is NOT closed

A complete C backup/restore proof is still missing. The connected Supabase capability available in this execution can query data/projects/branches but does not expose an action to list/download managed DB backups, clone/restore a backup to a new independent project, or export original private Storage object bytes. Database backup/restore alone is insufficient because original Storage bytes must be copied and verified separately.

Therefore the following are **not claimed**:

- complete current Database + Auth + original Storage-byte backup;
- independent full restore to a separate target;
- post-restore byte-for-byte Storage verification;
- post-restore equality against the pre-backup digest;
- measured RTO/RPO;
- rehearsed data-preserving rollback after a real candidate deployment.

The rollback *point* is identified (current production deployment/SHA above), but rollback is not marked `tested=true` because no Production change was made and the full data backup/restore layer has not passed.

## Phase D — work completed without accepting D

- Exact candidate identity is stable at `d4862762ac5df21209177c7c6fdcd31cdf8293cb`.
- Matching Vercel Preview is READY and its build completed `AQARI V198 package check: PASS`; build logs explicitly bind the Preview browser session to the exact candidate/immutable host.
- B real-account manager AAL2 and temporary collector/accountant/maintenance/property_manager/viewer/partner/tenant role/scope/deny tests passed with cleanup.
- Current source remains Preview configuration (`releaseStage=preview`) against the isolated Supabase target. Production configuration has not been substituted or declared correct.
- The repository 155-evidence file itself still declares `releaseGate: HOLD` and states that evidence association is not proof of complete execution/acceptance.

### D / Release Gate blockers

1. C has not passed the full Database/Auth/Storage-byte backup + independent restore + rollback rehearsal described above.
2. Same-SHA GitHub Actions are not green. All four failed required workflows were explicitly re-run again on exact `d4862762...`; the reruns again ended before runner allocation. Representative Runtime Contracts run `35083508253` attempt 4 / job `104772554032` has `steps=[]`, `runner_id=0`, and an empty runner name. This is not relabelled as an application-test failure; Vercel's same-SHA build tests pass, but the required CI gate is still false.
3. Physical Desktop/iPhone/iPad acceptance evidence required by the release validator is not present for D; no simulation is substituted.
4. Production configuration on the exact candidate is not yet verified. The frozen source still contains Preview Supabase/redirect configuration.
5. Supabase Auth leaked-password protection remains disabled and is retained as a pre-production security gap.
6. Final owner practical testing and later explicit final approval remain pending and are not inferred from B closure or this report.

## Deployment disposition

**NO DEPLOYMENT / NO `myaqari.com` CHANGE.**

The requested publication condition has not been met because C, D, and the Release Gate are not all closed on the exact candidate. Publishing now would bypass the mandatory backup/restore and CI/device/security gates and would contradict the fail-closed release validators.

The only application candidate remains `d4862762ac5df21209177c7c6fdcd31cdf8293cb`. No later application SHA is created or nominated by this C/D evidence lane.