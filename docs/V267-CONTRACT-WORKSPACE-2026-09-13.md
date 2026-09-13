# V267 contract workspace

Continuation on Preview support branch `support/v267-management-counters-20260913`,
parent `735e9ad02f842f67d1f5059c11ecd503c0251a58` (draft PR 116).

## Behavior

- Replaces the saved-contract button list with a responsive white/gold card
  workspace. Shows saved totals, preparation, printing/signing and signed stages.
- Searches contract number, Arabic/English tenant name, property and unit. Arabic
  and Persian numerals are normalized for search, as are Arabic diacritics and
  common alif variants. Stored names and values remain unchanged.
- Combines property and workflow filters with 20-record pages. Imported records
  remain in source review even when their source status says signed. Unknown
  statuses remain visible for review. Counts represent saved workflow statuses;
  they do not infer active occupancy or recompute expiry.
- Each contract shows its current workflow step and next action. Presence of a
  saved signed-contract document is reported separately from its workflow status;
  a signed state with no visible document prompts verification.
- The main official print action prepares two identical contract/annex sets from
  the existing authoritative approval check. Draft review remains available.
- Keeps the existing scanner, verified original upload, state transitions,
  immutable history and linked tenant/property/unit workflow. Describes the paper
  signing path and labels electronic signing as awaiting integration. No electronic
  signature is generated or simulated. No new legal contract templates are added.
- Refresh clears previous private rows before loading and provides a retry on
  failure. Closing clears the workspace, and detached search handlers cannot
  render old rows. No schema or hosted records are changed by this update.

## Local verification

31 tests passed, covering 45-contract navigation, Arabic search, combined filters,
unknown/imported stages, original-document visibility, empty/error recovery,
literal record text, two-set print requests, current server approval, identical
copies, scope/role changes, dialog disposal and scanner linkage:

```sh
node --test tests/v267-contract-workspace.test.mjs tests/v267-contract-workspace-runtime.test.mjs tests/v267-contract-print.test.cjs tests/v267-contract-scanner-entry.test.cjs tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs
```

These runtime tests use synthetic transport and DOM fixtures. They do not prove
hosted data writes, physical iPhone/iPad use, legal-template approval or full
acceptance of all 155 requirements. Release remains subject to the recorded gates.
