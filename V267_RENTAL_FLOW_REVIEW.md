# V267 rental records — implementation review

Preview branch only: `design/v267-premium-workspace`. No production promotion, domain change, database migration or customer test records were made. Final acceptance requires the owner's explicit **اعتمد**.

## Implemented

- Tenant add/edit uses a reusable profile: Arabic/English names, civil ID, phone, optional email/address, nationality, and attachment controls for both civil-card sides, marriage certificate and additional files. Existing row columns are preserved. Duplicate civil IDs are checked against profiles and the unit directory.
- Private attachments use the existing document reservation → Storage upload → finalization flow, with a stable profile reference in `entity_ref` and metadata. Bytes are not embedded in app-state/localStorage. Attachments are uploaded sequentially and opened with short-lived signed URLs. They remain workspace documents; this change does not migrate tenants into the separate normalized `aqari_tenants` table.
- New contracts and workflow status changes use the existing authenticated, revision-checked app-state writer. An independent cloud read is required before updating local state. They reference the saved tenant profile and preserve a profile snapshot, rent, deposit, unit/property, dates and status.
- Lease validation rejects duplicate numbers and overlapping date ranges on the same property/unit, including localized apartment digits and incomplete legacy dates. Concurrent writes use the existing cloud revision check. No new database constraint is claimed; external writers using other APIs are outside this client flow.
- New cloud contracts are visible to the existing contract/workflow screens after reload. Legacy local-only or protected imported contracts are not silently promoted or overwritten. Protected imported properties retain their existing write restrictions.
- Collection save retains active-cloud-contract validation and adds explicit tenant/unit/contract-number checks, duplicate receipt checks and a persisted receipt snapshot in the same app-state write. Collection, ledger and receipt must all be present on independent readback. Ambiguous outcomes require reload before resubmission.
- Voucher layout follows the supplied blank `183220DF-4DA8-4536-B1CA-9B8C4D0C0954.jpeg`: dinar/fils boxes, voucher/date, payer, payment method, month/unit, terms and empty signature fields. Property branding is retained. Pixel-level equivalence is not claimed.
- Saved contract data can produce one or two copies in one action. These are copies of the same contract, not separate legal documents. Existing contract clauses are retained.
- Verified saved rent vouchers have an authenticated server PDF download. Other documents retain browser print/Save PDF; no HTML download is offered. Print styling is released on `afterprint`, not an arbitrary 400 ms timeout that can interfere with Safari's print flow.
- New tenant inputs use a single column on small screens, 16px input text and large controls. The rental module loads only on demand; it adds no polling, background refresh loop or observer.

## Verification and remaining gates

Final local verification: 441 Node tests passed, zero failures. Release freeze, route-contract and autosync checks passed.

Automated synthetic tests cover full tenant → cloud lease/status → collection → cloud reload → collection-list markup → saved-voucher markup and print invocation. They also cover lost acknowledgements, missing readback, scope changes, concurrent lease writers, unit conflicts and tampered receipt linkage. These tests do **not** establish real cloud/browser/Safari success or deployed PDF endpoint success. Seven additional Python tests verify real PDF output, embedded Arabic font, pagination, receipt integrity and authorization. The synthetic PDF was rendered and visually inspected locally.

Live browser access remains at GitHub sign-in for Vercel protection. No credentials were entered and protection was not changed. Physical iPhone testing is unavailable in this runtime. Attachment upload/readback, live authenticated writes, visual comparison and actual iPhone input/print/download remain unverified. The version is **not ready for final approval** and no fresh user test is requested before these gaps are resolved.

This is an incremental implementation on the current app-state architecture. The separate normalized tenant/lease/payment tables and their automation were inspected read-only and were not migrated or synchronized. Protected imported properties remain a known end-to-end limitation.
