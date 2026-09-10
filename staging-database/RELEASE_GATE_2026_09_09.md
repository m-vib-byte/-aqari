# V267 Release Gate — Staging only — HOLD

This evidence supersedes older claims of readiness. No merge, Production, V266, myaqari.com or production alias change is authorized or performed.

## Implemented in this pass

- Applied `v267_contract_period_payment_reminders` to isolated Staging `djkpkkgoibruaezdrchb`.
- Reminder preparation now uses the saved contract's approved free month and dated rent adjustments, retaining the original amount for earlier periods and legacy contracts.
- Contract projection uses that same period amount to reject cumulative overpayment, cancel planned reminders after full payment and queue the payment acknowledgement. No external notification is sent.
- Approved state changes reconcile existing queued/awaiting-configuration reminders after projection, under the shared app-state transaction lock. Invalid or settled demands are cancelled.
- Updated the older payment regression fixture to satisfy the current mandatory contract fields and signed-document gate. No production validation was relaxed.

## Verified

- 568 local Node tests passed, zero failures/skips; package check passed; all eight critical source checksum/syntax checks passed.
- New rolled-back SQL integration test: saved draft, transactional signed-document metadata fixture, signed transition, scheduled reminder, approved free-month cancellation, no new free-month demand, future discount, original/legacy amounts, alternate-day schedule and idempotency, discounted full payment and acknowledgement, rejection of cumulative overpayment with no partial save, outsider/helper access denial.
- Existing linked-payment regression passed after correcting its stale test data: payment/receipt persistence, authoritative reread and idempotency. Signed-document SQL fixtures are metadata only, not actual uploaded signatures.
- Post-transaction Staging counts remained 1 Auth user, 41 tenants, 42 leases and 0 rent payments. No synthetic tenant, lease or collection was retained.
- Real manager login succeeded on the current branch Preview. The app's HR screen read the existing synthetic employee; an edit was saved and reread. October test payroll was prepared, Dhahawi template and payer names saved, Arabic digits ٥/٢ normalized, and server net confirmed as 578.000 KWD. Issuance returned immutable voucher `DT-20260909-000002`; the financial inputs became disabled. The browser opened a new tab titled with that voucher. Cloud browser policy blocks inspection of blob document pages, so this is not a new visual/physical-device printing pass. The earlier synthetic one-page A4 render remains the layout evidence.
- Two synthetic issued salaries remain UNPAID (September 590 KWD and October 578 KWD); no real employee signature, fingerprint, administration stamp or managerial approval was fabricated. The synthetic employee is excluded from automatic payroll by inactive status after the check.
- Security advisor categories remained the existing intentional private-table / guarded RPC findings and existing leaked-password-protection warning; no claim of zero advisories.

## CI evidence and remaining gates

- Before this patch, all eight runs on `ec81c2bfa17c0867940d2ec83a04fbaf5c192518` failed. Runtime run `34376184846`, job `102549461005`: `steps=[]`, `runner_id=0`, empty runner name. This establishes that no runner was assigned, but not the reason allocation failed.
- Earlier `75a73c2` Runtime job `102544425798` likewise had no runner/steps. Log lookup returned BlobNotFound; request `9278f9e0-501e-008d-2e76-4099c6000000`, time `2026-09-09T16:12:33.7874591Z`.
- Check-run/Annotations endpoint is not exposed by the GitHub connector. No proven billing/permission root cause, successful CI, private support ticket or public support disclosure is claimed. No blind rerun was performed.
- Other actual account roles and two distinct actual payroll approvers are unavailable: Staging has only one Auth account. Scoped SQL role/property tests are not represented as real-account browser tests.
- Physical iPhone/iPad, actual signed-salary upload/attestation and external provider integration credentials/configuration remain unverified. Cloud Chrome is not a physical Apple device.
- Original-source owner discrepancies remain unresolved; final identity/data entry was deferred to the owner. No guessed corrections or imported handwriting.
- Release is still for Staging testing. A green CI and completion of the above evidence are not inferred from local tests or a READY Preview.
