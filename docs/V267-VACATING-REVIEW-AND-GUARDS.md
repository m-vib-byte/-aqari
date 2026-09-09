# V267 vacating review and settlement guards — 9 September 2026

The owner's instruction authorizes publication after completion of the requirements, practical account/device acceptance, and a complete current-data backup with an independent restore rehearsal. No repeated publication approval is required. Those conditions remain open; this is a development change, not final release acceptance.

## Added review dossier

The manager can save numbered, immutable review versions bound to a saved lease, tenant and unit. The dossier captures the contract and recorded rent/deposit evidence; a changed source or concurrent revision rejects an outdated save. Blank proposed rent, utility, damage or other charges remain unknown, not zero. Proposed net amounts use exact fils and do not post a payment, refund or lease termination. Keys, inspection, utility review and the review reference are stored with the authenticated author. The printed copy is visibly a draft and uses the saved version.

The draft's stable request ID supports recovery after a lost response. A definite rejection releases the draft only after an authoritative missing read. Financial values and personal notes are not stored in browser storage. Revoked server access closes the protected dialog and revokes generated download URLs.

## Integrated concurrent settlement work

This change preserves the settlement additions from `c2ac4f6` and the subsequent hardening/acceptance additions through `4332eb3`, plus the later contact-preference and document-catalogue work through `746e2f4`, retaining the subsequent settlement list-alias repair from `b13433c`, and the exit-review/original-document additions from `3f8da9f`. It adds checks that exposed concrete defects: a cancelled payment originally reduced settlement debt, and printing originally used a subsequently edited tenant/contract identity. Regression tests failed before repair and pass afterward.

- Settlement balances count only paid/partial payment statuses, matching the existing financial evidence rules. Missing contract inputs are rejected rather than treated as zero.
- Contract access alone no longer permits financial settlement reads: both contract and collection scope are checked. The private settlement table now also has RLS enabled, in addition to revoked direct access.
- Review of other charges requires an explicit reference even when declared damage is zero. An unresolved review cannot be finalized just because damage was entered as zero.
- Workspace-before-lease locking matches the existing deposit/application-state order.
- Printing uses saved identity/amount snapshots, rejects missing financial amounts, rereads the saved settlement through the current session and generates a revocable private document link. It no longer depends on obtaining a popup handle with `noopener`.
- Switching contracts clears the prior view before fetching. Save/finalize/clearance separately reread the saved revision/status; a concurrent change cannot be reported as verification of the original write. Button states are reapplied after the dialog's temporary busy-state restoration.
- Existing snapshot normalization and all concurrent acceptance assertions are retained. The contact-preference tests now use a dedicated synthetic imported tenant and a scoped temporary Storage-service fixture, without granting restricted membership or Storage table access to application roles. The older popup-source assertions were updated for private document links; a synthetic fixture now supplies the newly required charge-review reference. No workflow or business assertion was disabled.

## Verification

The merged local suite passed **750 Node tests** with zero failures or skips. All **thirteen in-memory PostgreSQL acceptance suites** passed. Three hosted rolled-back acceptance suites also completed successfully, including the preserved settlement/deposit-refund/clearance scenario. Candidate CI/preview status is recorded separately in PR #70. The new tests cover unknown-versus-zero, exact fils, malformed dates/amounts, immutable print identity, lost replies, conflicting revisions/source evidence, manager-only review access, denial of financial reads to a contract-only role, unresolved charges and cancelled-payment clearance prevention.

Both new SQL acceptance scripts passed on the independently verified `ofgmcsmxmdswlovsckqs` branch, in rolled-back transactions. Post-test counts were zero for Auth users, memberships, leases, payments, deposits, review versions, settlements and Storage objects. The RPC is not executable by anonymous users, and authenticated users have no direct review table access. No protected database or production domain was changed by this work.

Security advisors still report intentional private deny-direct tables with no RLS policy and authenticated security-definer RPCs. The new RPC explicitly checks the live manager membership and section/lease scope, uses an empty search path, and has restricted grants. This is not a zero-advisory claim. [Supabase function security](https://supabase.com/docs/guides/database/functions).

## Unclosed acceptance conditions

- The new dossier is a review aid, not a full obligations ledger or proof that all charges were reconciled. Saved checklist declarations are not uploaded inspection evidence or signatures.
- The concurrent settlement record does not by itself prove lease termination, unit release, prevention of later charges, complete utility/legal obligations, or a whole tenant departure journey. G06/G11 remain partial.
- The archived-review and settlement interfaces in this change are currently Arabic; the five-language requirement and actual iPhone/iPad layout/printing remain unverified.
- The cloud browser again timed out before listing tabs. No real-account browser test is claimed. The isolated project still has no activated Auth account.
- A complete DB/Auth/Storage-byte backup and independent data restore remain unverified through the available capabilities. Source-only rollback evidence is in [the rollback report](V267-ROLLBACK-VERIFICATION-2026-09-09.md).
- External provider integrations, source-data reconciliation and other open items in [the 155-item register](V267-REQUIREMENTS-155.md) are not closed by these repairs.

There is no confirmed production ETA before the missing access is available and the complete restore/practical acceptance are measured. Preview deployment and green CI must not be described as production acceptance.
