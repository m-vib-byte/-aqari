> Update: the number-reservation/template integration blocker below is now resolved on preview by `20261006044006_v267_execution_official_document_binding`; both zero and paid atomic SQL acceptance pass. See `V267-EXECUTION-OFFICIAL-BINDING-2026-10-06.md`. The following records the earlier diagnosis.

# Execution document text: verified fix and remaining integration blocker

Preview project: `ofgmcsmxmdswlovsckqs`. Production was not changed.

## Confirmed and fixed

The installed settlement projector concatenated text and JSON extraction without
parentheses. PostgreSQL raised `22P02` at `title:='عقد إيجار '||c->>'contract_no'`.
Parenthesize the seven directly concatenated JSON extractions in title, body,
and document number. Date and amount regexes were tested and already work.
No financial validation, status guard, table, or permission changes.

Applied preview migration: `20261006042444_v267_execution_document_text`.
Installed function body SHA256:
`74a32bde1c2b4a40d52c6c7abbfbf65791ce28c8e507598edf081328c78e1ec8`.
It matches the committed migration body exactly.

## Verification

`contract_execution_document_text.sql` is appended before ROLLBACK to
`contract_execution_package_hosted.sql`. It extracts and executes the installed
projector's actual canonical-text statements and document-number expression.
Before the fix it reproduced 22P02. After applying the migration it passed for
rent 0 and 100, checking title, document number, canonical SHA256, and exact
tenant/owner copy-body parity with the authoritative package source.
The package fixture also verifies access rejection, PDF/source integrity and
idempotency. All fixture workspaces and identities were rolled back (zero left).
Security advisor identifiers and categories were unchanged before/after.

## Still blocked: complete signing transaction

`contract_execution_finalize_hosted.sql` now reproduces a second integration
failure with synthetic manager, tenant, signing contract, document metadata,
signature-review metadata, and prepared zero-rent package. No triggers are
disabled. The real authenticated app-state UPDATE reaches canonical document
insertion, then fails with `DOCUMENT_RESERVED_NUMBER_REQUIRED` from
`private.aqari_official_source_guard()`.

This is not just a missing test fixture: the execution projector generates
`CT-<contract number>` directly without an official-number reservation, and
the owner/tenant artifacts path does the same. Further, the generic guard
calls `aqari_official_validate`, whose template-title/payload/hash rules must
be reconciled with the execution package's canonical contract format.
Adding only a reservation or bypassing that guard is not a complete fix.

The failing acceptance test is intentionally preserved as evidence, not counted
as a passed test. Paid full-transaction acceptance, authenticated hosted API/browser
testing, and owner/device acceptance remain pending. This work does not close
the entire execution feature or change the overall partial/complete counts.

