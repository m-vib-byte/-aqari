# Contract administration implementation — not a release approval

Base: `2d0d8ee9e13c388859892abed2f7f6bb377f05e9` on `main`.

Implemented in this change:

- Separate general-manager template entry, reusing immutable published versions. Publication requires a complete preview after the last text edit. The number of templates/versions has no new limit.
- Historical-contract archive entry. Uploads preserve the original bytes, attach to the tenant, and register tenant/property/unit IDs separately from operational leases. Archive registration never creates a lease, payment, notification, or outbound integration event.
- Staff contract creation, edits, renewal cancellation, and transitions are removed from the UI. The app-state database trigger independently rejects contract/preparation mutations by non-managers. Direct authenticated INSERT/UPDATE/DELETE on `aqari_leases` are already denied in the inspected database.
- Staff change requests and manager decisions. Approving a request records a decision; the manager must apply the approved change in the existing contract workflow. Approval itself does not rewrite legal text or create financial movements.
- Separate file and signature-review state. The manager reviews the actual uploaded copy, including tenant, landlord, and any additional required signers. Signature reviews are fingerprinted to the saved contract content, excluding workflow status, change reason and update timestamp. Amendments invalidate the old copy and require a newly uploaded document. Missing signers stay incomplete; required signers cannot subsequently be removed from that document's review. A new transition to signed requires an uploaded copy with a complete review.
- Fixed the existing property-template scope guard's reference to nonexistent `property_master.type`; the actual column is `property_type`. Existing scope checks are preserved.

Verification performed:

- 84 passing Node tests across archive registration, administration, template preview, contract viewing/foundation, payment references, persisted rent readback, and the separate deposit ledger.
- SQL upgrade and synthetic manager/staff fixture executed together inside a transaction on the identified test project `djkpkkgoibruaezdrchb`, then **rolled back in full**. No permanent schema change, fixture user, or test record was retained.
- SQL verifies manager archive/readback/filtering/idempotency, invalid-unit rejection, missing signatures, required-witness retention, completed signature readback, staff admin denial, pending change request, cross-workspace denial, staff draft-write denial, and manager request decision. Final assertions verify no new lease/payment/notification/integration event and no contract rewrite from approval.
- Release-freeze now passes. The 19 unrelated inventory entries were corrected after their local Git blob hashes matched the authoritative upstream tree; source files were not changed.
- These are programmatic role tests, not browser acceptance tests. Secure sign-in reached the existing general-manager dashboard. Its records have not been used as isolated test fixtures; the complete manager/employee cycle remains untested.

Open requirements / release blockers:

1. Automatic receipt delivery from each building's authenticated WhatsApp account AND official email remains unfinished. The inspected test database's existing queue chooses only one preferred channel and has no email/WhatsApp integration config rows. This change does not replace that dispatcher, invent credentials, or send real tenant messages. Implement and test the two-channel dispatcher against verified building sender identities and destinations snapshotted in the contract.
2. Run the full actual browser flow using isolated manager and employee accounts, including original-file upload and retrieval, requests/approval, final collection save, immutable receipt linkage, and both delivery channels. SQL fixtures and mocked UI tests do not satisfy this gate.
3. Verify backup/restore and the release rollback point; review and apply the SQL upgrade to the verified deployment database before enabling the new UI. Do not merge or publish this partial change as a completed release.
4. Full translation review and manager request application tracking require end-to-end verification before release. The request decision currently does not mark an amendment as applied.

Reproduce the focused tests:

```sh
node --test tests/v267-contract-archive.test.mjs tests/v267-contract-administration.test.mjs tests/v267-rental-templates.test.mjs tests/v267-contract-view.test.mjs tests/v267-contract-foundation.test.mjs tests/v267-rent-entitlement-payments.test.cjs tests/v267-payment-method-reference.test.cjs tests/v267-deposit-ledger.test.mjs
```

For the database test, execute the SQL upgrade and fixture in one transaction, omit the upgrade's final `COMMIT`, and finish with `ROLLBACK`. The fixture intentionally uses synthetic storage metadata; it does not prove actual file storage or external delivery.

Native platform follow-up:

- Added manager-only preview and operational-approval entries inside AQARI; the approval inbox excludes historical source contracts.
- Contract HTML, originals, and archived originals render in sandboxed inline viewers with no external-tab preview. Downloads remain optional.
- Focused workflow suite: 85 passing tests. Additional print, load, upload, document catalog, and onboarding regression suite: 42 passing tests.
- The live domain-trial configuration selects branch `ofgmcsmxmdswlovsckqs`, under staging project `djkpkkgoibruaezdrchb`. The administration RPC is absent there and email/WhatsApp integration configurations are empty. No permanent upgrade applied.
- Standard build plus owner-reference and owner-feedback overlays succeeded in an isolated build copy. The complete built suite passed: 1,825 tests, zero failures. The source-only failures depended on these normal build overlays. This does not establish browser or delivery acceptance.
