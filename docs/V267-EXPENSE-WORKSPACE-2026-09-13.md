# V267 expense search and draft recovery

Preview continuation of draft PR 116 from
`5e989b7089fbcbf6ca96fabdf7dc49f622ce925d`.

## Usability changes

The financial register supports combined search, property and state filters.
Search covers beneficiary, category, voucher number, reference, description,
date, payment method and property name, with Arabic/Persian digit, Arabic
letter and diacritic normalization. It operates on the authorized records
already read for the selected month, without additional requests or mutations.

Results show the matching count and visible range, with 20 records per page.
A new filter resets to page one; refresh clamps a shortened page. A missing
selected property remains unavailable instead of silently broadening the
filter. Filtering and paging preserve a dirty editor and clear obsolete audit
selection. The server's approved total and count remain unchanged and are
explicitly labelled as covering all available properties in the period.

The filter panel follows the existing white/gold design with responsive grid
rules. Paging controls are recreated when results change so completion of an
older request cannot restore stale disabled states on those controls.

## Reproduced and repaired defects

Three new tests failed against the preceding source:

- Reconciliation of a saved expense discarded edits entered after a lost reply.
- A later matching revision was accepted as proof of an earlier operation.
- Inner discard could clear a draft while its save outcome remained uncertain.

A pending operation now retains the submitted form snapshot. Matching readback
preserves newer input and advances its next explicit save to the verified
revision. Confirmation requires exactly the expected next revision. Inner
close asks for verification while an operation is pending. Existing server
revision checks, explicit outer close confirmation, month closure rules and
redaction on authorization failure remain in force.

## Verification and limits

54 focused tests passed:

```sh
node --test tests/v267-financial-register.test.cjs tests/v267-staff-circulars-runtime.test.mjs tests/v267-property-notices.test.cjs tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs
```

The 24 financial cases include exact fils, invalid inputs, approval and
cancellation readback, month closure, authorization failure, uncertain saves,
later-edit preservation, combined Arabic search, 45 synthetic records across
three pages, page clamping and stale-control privacy checks. Tests use synthetic
RPC fixtures; no hosted financial record is created or modified.

The SQL list was reviewed: it returns the month's authorized expenses, while
its audit list remains limited to the latest 100 entries. No SQL, account,
permission or hosted data changes are included. The existing CI workflow runs
the expanded financial suite. Browser evidence is recorded separately in PR
116. Local tests and a Preview build do not establish physical iPhone/iPad
acceptance or completion of all 155 requirements; release status remains HOLD.
