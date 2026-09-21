# Additive A4 and template starter verification — 2026-09-21

## Scope

Continue the current platform with additions only. Preserve existing contracts, drafts, fields and clause text. This change introduces no database migration and performs no hosted business-data writes.

- Template editing starts at actual 100% A4 size with visible page boundaries, optional larger zoom, fit and focused reading controls. Zoom/focus does not modify the draft or queue a save. All page edges remain scrollable on narrow screens.
- Saved contracts gain an A4 viewer with pagination and zoom. It displays the existing contract markup; operational editing and existing printing remain available. Long bilingual content and the 36-clause fixture retain their text and order.
- Users can create and rename Arabic, English or bilingual custom fields, select existing supported field types and save them in the template. Internal field keys stay stable. A temporarily blank label does not submit an invalid autosave; its last valid value remains until a valid replacement is entered.
- The template library contains four independent starting drafts: rent receipt, tenant eviction pledge, apartment handover, and owner final clearance. These are static headings and editable fields, with no invented legal clauses or personal data. Opening a starter creates a fresh in-memory draft and family ID. Only the user's edit/save persists a new draft through the existing save operation; opening the library does not insert records or approve documents.

## Tested source

The combined source includes concurrent main commit `a70a36bf5a596ed6db8ebed20f0cdc6568130241` (PR #273). Its property portfolio additions and build gates were preserved. This change does not apply that other release's migration.

Validation in an isolated copy of the combined source:

- `node scripts/build-vercel.mjs`: passed, including 62 Python PDF/layout tests.
- Owner-reference and owner-feedback installer validation: passed.
- `node --test tests/*.test.mjs tests/*.test.cjs`: **1932 passed, 0 failed, 0 skipped**.
- Focused A4, template, starter and layout tests: **51 passed**.
- Local PostgreSQL-compatible template-library SQL gate: passed. It checks custom-label persistence, Arabic/English/bilingual labels, supported types, required flags, stable-key rename and version history, along with boundary and invalid-input rejection.

## Read-only production baseline before this change

The shop draft was already revision **7** when this request began. Earlier release verification used revision 4; that older baseline is historical and must not be restored.

- Shop draft: status `draft`, 8 fields, 36 numbered clauses, content length 15658.
- Original-column digest: `58e5c04bda8d0a533d6b3142244dfaeb`.
- Full-row digest: `7791be4c13c3955b1756a3455019ee5f`.
- Content digest: `68a41782ca6daea43bae00bbd01399c2`.
- Application state: revision 45; digest `5afd606813588e69d66be4a5ecef4233`.
- Counts: 7 properties, 170 units, 44 tenants, 43 leases; 1 user draft, 0 user-published templates, 1 system template, 2 documents, 0 archived documents and 4 template history entries.

## Verification limits

The available production browser session is at sign-in. Authenticated end-to-end visual acceptance, physical iPhone/iPad interaction, and a real owner save/approval were not performed. Automated DOM/SQL tests and deployment health checks do not replace that owner acceptance. No real template or rental document was approved or issued during these checks.
