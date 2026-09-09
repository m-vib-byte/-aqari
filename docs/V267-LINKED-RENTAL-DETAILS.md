# V267 linked tenant, contract, statement and receipt

Staging only. No merge, promotion, V266, Production or myaqari.com changes are authorized.

## Implemented

- Tenant profile and preparation drafts retain passport number. Imported passport corrections use the existing manager-only audited RPC with a reason, revision check and preserved source evidence.
- New contracts require both names, email, nationality, civil ID, passport, phone, unit, floor, contract number, start/end, original rent, deposit, advance, cleaning fee, discount (explicit zero accepted), contract delivery timestamp and responsible accountant. Incomplete tenant drafts remain possible but cannot issue contracts.
- `contractRent` preserves rent at writing; `rent` is calculated from it minus `discount` in integer fils. `writtenOn` uses Kuwait's calendar date and is verified by the server. Original rent/date cannot be replaced by later status changes.
- Printed contracts start with “حرر هذا العقد في دولة الكويت بتاريخ …”. Receipt time is explicitly Kuwait (+03:00); invalid and future times are rejected.
- The operational rent ledger receives linked profile and contract fields, including floor, both names, contact/identity, dates, fees, receipt status/time, eviction notice and prominently rendered accountant. CSV includes the detailed fields. Missing historical fields remain unrecorded, not fabricated.
- Payment entry collects transaction number for non-cash payments. Saved vouchers and authenticated PDFs carry a historical snapshot of contract/profile/fees, transaction and accountant. Reprinting does not rebuild history from later profile changes.
- Database trigger validates mandatory fields and linked receipt details, preventing direct JSON writers from bypassing client validation. Existing source statements are not backfilled or converted into collections.

## Verification

- 559 Node tests passed locally, zero failures/skips.
- 13 PDF tests passed, including real multipage rendering of the linked snapshot.
- `npm run check` passed.
- `staging-database/tests/linked_rental_details.sql`: mandatory field rejection, snapshot match, original-rent immutability, discounted-rent projection, accountant mismatch rejection, payment/receipt readback. All synthetic fixtures rolled back.
- Extended imported tenant SQL test: passport save/readback, preserved source/contracts, stale revision rejection, accountant denial. All synthetic fixtures rolled back.
- Applied `v267_linked_rental_details` only to isolated project `djkpkkgoibruaezdrchb`. Security advisors show no new warning for this change; pre-existing warnings remain.

## Open release gates

PR #70 remains draft and unmerged. At baseline c6af043, all eight CI runs failed. Runtime run 34357176967 / job 102484704181 has no available steps; log retrieval returned BlobNotFound at 2026-09-09T14:05:16Z. The connector rejects the detailed job endpoint. This does not establish a billing, workflow or runner root cause. No successful CI claim or blind retry.

New-preview real-account browser verification is pending deployment. Physical iPhone/iPad tests, other real-role accounts, provider configuration and unresolved source discrepancies remain open. Local tests do not certify these gates. No final release approval is claimed.
