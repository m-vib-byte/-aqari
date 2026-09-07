# V267 payment persistence and contract lookup

Preview only. Main domain and production are unchanged. Owner iPhone approval remains required.

Root cause identified in code: the property payment path called local `persist()` without awaiting a cloud write. Generic quick-add accepted unlinked collection rows. On startup, authoritative cloud restoration could remove locally-only entries.

Changes:
- Quick collection creation and the collections add command route through the property/active-contract form.
- Payment validation retains existing access, period, amount and duplicate-reference checks.
- Save compares fresh cloud collections/ledger/contracts to local state, verifies the selected contract is present and active in cloud contractsV202, appends to the existing cloud envelope with revision checking, and independently reloads to confirm both collection and ledger rows.
- UI publishes server-confirmed records only. Save failure does not report success or issue a receipt. Ambiguous outcomes require reload/reference verification before resubmission. In-flight operations are bounded at 20 seconds; timeout does not imply server cancellation.
- Payment form searches tenant name, contract number and apartment number, including Arabic/Persian digits. Exact units take precedence; numeric apartment 4 cannot select apartment 14. Ambiguous results require selection. Missing active contract disables receipt submission.
- Successful save selects the saved month and collections tab.

Validation: 430 Node tests passed, including cloud-backed fixture save/reload, rejected write, missing readback, stale cloud data, changed auth scope and unit search. These use isolated synthetic services; no real financial records were created for testing. They do not constitute a physical iPhone or live authenticated cloud write test.

Limits: protected imported properties remain intentionally read-only through this payment path; their existing access controls were not bypassed. Contracts must already be persisted in cloud contractsV202. Existing historical local-only collections are not automatically uploaded or reconstructed. Authenticated browser testing remains blocked at Vercel/GitHub sign-in.
