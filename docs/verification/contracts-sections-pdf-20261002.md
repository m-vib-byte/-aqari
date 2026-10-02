# Contracts sections and direct PDF actions — 2026-10-02

The user reported confusing categories and disabled Download PDF / Print PDF buttons on an unnamed draft.

- Separate lease templates, property document templates, employee templates, and the existing per-property PDF archive. Salary and employment shortcuts open the employee section; contract upload appears in the contracts section.
- Clarify reusable templates are shared and uploaded files belong to the chosen property. Saved templates display saved + draft/approved, never a live lease state.
- Download/print generate the current verified PDF directly. Validation still applies; edits invalidate PDF and approval. Printing reserves a new viewer within the click gesture for mobile browsers, with a manual viewer link when popups are blocked. Approval remains explicit.
- Keep inline retry visible even when the real page lifecycle catches preview errors.

Validation: 37 focused template tests pass; package check and release freeze check pass. Chromium touch viewport 390x844 tested sections, direct download (PDF signature verified), fresh direct print (reserved popup receives PDF; headless Chromium downloads PDF because it lacks a native viewer), archive and no accidental template writes. Backend PDF responses in this interaction test are synthetic. Physical iPhone printing was not tested. No database migration or production document mutation.
