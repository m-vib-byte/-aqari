# Contracts workspace and template library — 2026-09-21

Continued from deployed main `11f2af8fd105d9a08336611074685eb7010d3ce5`; no platform rebuild or business-data replacement.

## Delivered behavior

- Full-page property cards, then the selected property's units, contracts, tenant and five-document cycle. Normalized IDs establish the scope; duplicate unit numbers and historical property names cannot establish identity.
- Independent template families, multiple models per type, copies, revision history and full-page A4 editing. Human field chips retain the exact underlying legal text, including unresolved legacy fields until the owner explicitly replaces them.
- Move/resize/page/font/language controls, optional property logo and both parties' name/signature/fingerprint spaces. The editor scales to screen width; the final review embeds the actual PDF used for download.
- Autosave starts after a user edit, retains the same request on retry, serializes changes, guards navigation, and offers an independent-copy recovery after a conflict. Opening the existing shop draft writes nothing.
- Explicit user confirmation and recent MFA protect publication/issuance. Published versions and issued PDF bytes/snapshots remain immutable. Issuance revalidates source records and property-template eligibility under database locks, compares the reviewed PDF checksum, and verifies archive readback.

## Executed tests

- Standard `scripts/build-vercel.mjs` and configured owner-reference/owner-feedback installers passed in an isolated copy. Its Python gate passed **62 tests**.
- Entire built JavaScript suite: **1,908 passed, zero failed/skipped**. Two old VM harnesses were adapted to the full-page constructor; their existing recovery/print assertions remain intact.
- Focused UI/domain suite: **123 passed**, covering property isolation, deep links, tenant selection, PDF identity, approval confirmation, autosave ordering, lost replies, conflicts and exact long-text preservation.
- Actual PostgreSQL/PGlite migration and behavioral suite passed. It exercises independent families, all five kinds and custom types, legacy version continuation, autosave/history, 36-clause preservation, ACL/AAL2, forged or changed sources, cancelled receipts, scope restrictions, immutable PDF archives and idempotent retries.
- Synthetic text containing 36 numbered clauses in one stored clause rendered to five A4 PDF pages. First and last pages were visually inspected; all 36 markers were extracted. No real owner document was used or issued.

Reproduce the database gate:

```sh
AQARI_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js bash staging-database/local-test/run-template-library.sh
```

## Live preservation verification

Applied only additive schema/functions migration `20260921090251_v267_template_families_a4_archive.sql` to the existing isolated V267 data source used by myaqari.com. Migration SHA-256: `436097abf563b158fc0faaef002c59de69d32f574ab541d1a28a07d4df701ebb`.

Readback after migration confirmed shop draft `e1037221-60ff-4f0f-86bf-41535f6d1f79` remains title `محل`, draft revision 4, with one stored clause containing 15,657 characters and 36 numbered clauses. Original-column MD5 remains `9489308239fa6c8b31d9575cd844148e`; fields/clauses MD5 remains `7a41bbc4c82b94e6409d456a10715977`. Additive metadata is excluded from the original-column comparison.

Read-only mapping verified all 43 current contracts have matching lease snapshots and tenant links, with zero property/unit ID conflicts. Existing general-manager account count is one; no new owner identity or permission bypass was introduced.

No owner template was created, edited, approved or published by this work. No real rental document or financial transaction was issued.

## Verification limits

The browser session reached sign-in and was not authenticated. The live account journey and physical iPhone/iPad acceptance were not performed. Automated fixtures and visual PDF inspection are not represented as those checks. Signature/fingerprint support supplies labeled blank areas; it does not fabricate signatures or capture biometric data. Original wording and unresolved generic fields remain for the owner to review and assign.

Production readiness and deployed commit identity are checked after merge; this source report records the pre-deployment gates and applied schema evidence.
