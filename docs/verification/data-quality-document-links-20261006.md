# Read-only archive relationship observations — 2026-10-06

Extends the R04.07 quality scan after PR442. Archive relationships are matched by
the exact `external_ref` of the declared property, tenant or lease, as required by
`private.aqari_document_entity` in the scanner and staff-scope SQL. Internal IDs,
names, a different entity type, case-folded or trimmed lookalikes do not confirm a
match.

The page reads existing identity reference columns and paginated document metadata
only. It does not download document contents or Storage objects. Findings distinguish
missing link fields, references absent from the readable scope, ambiguous references
and unexamined scopes. Unsupported entity types and omitted identity columns are
not mislabeled as missing records. Archive numbers make observations identifiable.

The UI explicitly limits results to readable records. RLS can hide orphaned or
unauthorized rows, so this is not a complete server-side integrity audit. Neither a
matching reference nor an empty report verifies file contents or stored bytes.
No correction, relinking, merging, deletion or other business mutation occurs.

## Evidence

- Nine added cases: five inspector cases and four runtime page cases.
- Original source: 14 passed, 9 failed. Updated source: 23 passed, zero failed.
- Coverage includes external-reference/entity identity, ambiguous and missing
  targets, incomplete scope, historical statuses, unchanged inputs, second-page
  documents, failed document reads and scan caps. Earlier role/session tests remain.
- The actual page executes with DOM/transport substitutes; this is not hosted
  browser/RLS or physical-device acceptance.
- Existing CI runs both suites. Runtime inventory and diff checks pass.

R04.07 remains partial. Financial-reference checks, complete visibility validation
and hosted/device acceptance remain. No schema/grant changes or production release.
Stack on PR442; no new hosted test property or document was created.
