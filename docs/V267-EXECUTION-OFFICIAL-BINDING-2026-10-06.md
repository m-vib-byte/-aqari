# Atomic execution official-document binding — 2026-10-06

Preview-only migration: `20261006044006_v267_execution_official_document_binding`.
Project: `ofgmcsmxmdswlovsckqs`. No production changes.

## Problem and change

Full app-state signing reached official document issuance and was rejected by
`DOCUMENT_RESERVED_NUMBER_REQUIRED`. The generic official-document validator
also expects its own template format, which is different from the immutable
execution package's canonical contract and owner/tenant copies.

The execution projector now reserves the canonical document number and both
copy numbers in the same transaction that inserts the corresponding series.
The original reservation check remains mandatory in the source guard.

For the `rental_contract` kind only, a private validator checks the current
manager, entity scope, creator and issuer, version 1, issued status, unexpired
and unconsumed package, matching saved signed lease, and exact app-state
settlement/package/canonical-document binding. Canonical text and hash are
recomputed from the signed snapshot. Tenant and owner title, body, payload,
template version, timestamp, issuer name, document number, and SHA256 must
match the trusted package. Unknown copy roles are rejected.

Other document kinds continue through the existing template/source/hash guard
unchanged. The new helper is not executable by anon, authenticated, or service_role.
No triggers were disabled and no table grants or business rules were relaxed.

## Observed verification

- Zero-rent atomic signing succeeds with one settlement, three reserved official
  document numbers/series, two archived contract PDFs and one package consumption.
  It creates no fake payment or receipt PDF.
- Paid atomic signing (100 KWD) succeeds with the same contract artifacts plus
  one rent payment and one receipt PDF; first-period balance is zero and the
  receipt serial reservation is consumed.
- A wrong package ID aborts the real authenticated app-state update. Lease status
  and payment remain unchanged; the subsequent correct update succeeds.
- Replaying identical state produces no duplicate settlement, documents, PDFs,
  or package consumption.
- Viewer, expired-package and consumed-package validation are rejected.
  Helper execute privileges are denied to all three API roles.
- Existing package preparation tests also reject altered source, corrupt PDF
  digest, fake zero-rent receipt and mismatched paid receipt.
- Paid SQL fixture record/ledger/receipt was compared by Node deep equality with
  the actual frontend `rentReceiptArtifacts` output: identical.
- All four installed function body SHA256 values match the migration source.
- Security advisor identifiers/categories unchanged. Existing findings remain.
- After rollback: zero fixture workspaces and zero synthetic identities.

The migration was applied with a savepoint-scoped zero-rent acceptance test in
the same migration transaction. Expanded zero/paid tests were then rerun against
the installed functions. Fixture Storage rows are metadata only; no real files
were uploaded. SQL PDF bytes are synthetic; actual PDF rendering was validated
separately in the existing Python tests.

## Reproduction

Run `staging-database/tests/contract_execution_finalize_hosted.sql` on isolated
preview only. Default rent is zero; for the paid case set
`SET LOCAL aqari.execution_package_test_rent='100';` immediately after BEGIN.
The file ends in ROLLBACK and leaves no fixture records.

## Remaining acceptance

These are database transaction tests with synthetic identities, not a hosted
HTTP login/session test or device acceptance. The exact candidate still needs
authenticated package API/browser verification and owner iPhone/iPad acceptance.
Do not count all partially implemented platform requirements as complete, and do
not merge/deploy production before the existing exact-SHA release gate.

