# Document-backed vacating implementation — review only

Production gate: HOLD. The owner has already authorized deployment after actual acceptance and complete backup/restoration. No further publication approval is needed; these conditions have not passed.

This additive implementation records the vacating date separately from the original contractual end, preserves tenancy history, verifies handover-document identity/checksum, reads confirmed period-specific payments and the actual deposit ledger, requires key handover and inspection, and audits any explicit manager exception. Nonzero deposit balances, future-period money and unverified imported balances cannot be bypassed by an exception. Issuance is idempotent, checks the reviewed statement again under a workspace lock, and freezes the saved print snapshot. The next tenancy may begin the following day without rewriting the original contract end. Five-language UI and operation-recovery markers avoid storing personal or financial drafts in session storage.

## Integration hold

Concurrent work added a separate `vacating-settlement` implementation to the shared development branch. Its source and tests were preserved. The new document-backed page is deliberately not wired into the workspace menu: the two issuance paths must be reconciled before activation or production migration. Do not apply both issuers to production. The review branch includes both implementations for comparison, not a claim of one completed workflow. The independent hosted test database also contains other exit/vacating review functions from concurrent work; their complete compatibility is not established.

## Evidence

- 726 combined Node tests passed, zero failures/skips, after preserving the concurrent settlement and contact-preference changes.
- Ten local in-memory PostgreSQL suites passed: staff property scope, financial register, deposits, staff contract approval, maintenance locations, existing vacating settlement, settlement list readback, imported tenant editing, reminder contract balance, and the new document-backed vacating register.
- The combined run exposed fixture assumptions: direct authenticated membership-table access, dependence on real imported tenants, and privileged Storage metadata insertion. Tests now determine the synthetic workspace before switching role, create a rollback-only imported profile, and isolate the Storage metadata helper. Business RPCs and permission-denial assertions still run as authenticated. No application grants were relaxed.
- New vacating hosted migration and transactional acceptance passed only on isolated `ofgmcsmxmdswlovsckqs`. Post-rollback Auth users, memberships, leases, vacating records/operations, documents and Storage objects were zero. Protected current production and historical V266 were not changed.
- Document fixtures prove metadata/authorization behavior, not genuine signatures, physical key handover or real uploaded file bytes.
- New CI browser matrix covers synthetic save/reload/recovery/issue/print/denial across five languages, Chromium/WebKit and desktop/iPhone/iPad viewport sizes. Its execution result is tracked in the review PR; fixture emulation is not physical-device acceptance.

## Unclosed release conditions

1. Unify settlement/clearance issuance, meter evidence, and the other open items in the 155-item register. These remain partial, not complete.
2. Actual account testing: the cloud browser connection timed out again after documented recovery, and the isolated database has no activated Auth accounts. No current-head login/save/reopen/roles/print acceptance or physical iPhone/iPad pass is claimed.
3. Full current DB/Auth/Storage-byte backup, independent restore, and a rollback rehearsal preserving intervening transactions. Prior source-only archive drills do not satisfy this. A historical V266 alias switch points to another database and cannot establish current-data preservation.
4. Approved external provider configuration and end-to-end sandbox evidence. The independent branch has no Edge Functions. Notification queues and manual utility/payment entries do not prove KNET, WhatsApp/SMS/email or government utility integration. The connected Vercel project response did not expose environment keys, so no claim is made that credentials are absent.

There is no evidence-based production ETA until access, provider configuration, functional reconciliation and data restoration can be measured. No production deployment, domain reassignment or merge was performed.
