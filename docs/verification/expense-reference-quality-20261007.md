# Read-only approved expense reference review — 2026-10-07 Kuwait

Extends R04.07 after PR444 inside the financial register. The existing monthly
`aqari_financial_register` read supplies expenses and readable uploaded document
metadata; no extra query, schema change, grant or financial write is introduced.

The review flags approved manual expenses with missing voucher numbers, supporting
documents, bank/cheque references or known payment methods. An unavailable document
is explicitly not proof of deletion; a readable document linked to another property
is reported separately. Duplicate references use the exact saved `(method, reference)`
identity of the database's approved noncash reference index, across readable properties.
Cash references may be blank. Drafts, cancelled expenses and payroll allocations are
excluded because they are not live manual expenses with the same document semantics.

The review covers the loaded month before search and pagination. It does not inspect
other months, hidden rows, file contents, amounts or payroll. The scope and limitations
are visible beside the observations. A failed refresh immediately clears observations;
only a successful reread restores them. Existing access-denial clearing also removes
the review. Findings identify saved vouchers and row IDs and offer no correction action.

## Verification

- All 33 financial-register tests pass, including five new cases covering missing
  references/documents, hidden versus mismatched documents, valid cash, excluded states
  and payroll, exact duplicate identity, cross-property duplicates, rows beyond page 20,
  search-independent scope, monthly scope, failed refresh and access denial/recovery.
- The existing save, approval, cancellation, period closure and uncertain-write cases
  continue to pass. Tests execute the actual page with DOM/RPC substitutes.
- Existing CI already includes this suite. Runtime inventory and diff checks pass.

R04.07 remains partial. Hosted authenticated UI/RLS and physical-device acceptance,
payroll references and other ledger coverage remain. This is not a complete database
integrity audit. No hosted business records or production release are changed.
