# Reopen contract execution archives — 7 October 2026

Continues PR #428 from `62fa067f4ea2a19a5a1e35f18088d5f087e42726`.

## Observed gap

The finalization screen offered the original tenant/owner PDFs and the first
rent receipt, but reopening a saved contract had no direct entry to those
execution artifacts. The existing “linked PDF copies” control reads a separate
template-binding registry. The general official-document center remains a
separate archive entry; this change adds contract-scoped access.

## Change

Signed and expired cloud contracts now offer “مستندات الإبرام المؤرشفة”. The page
reads the existing authorized artifact RPC and verifies the contract number,
settlement/copy identifiers, distinct owner and tenant copies, and receipt/sequence
pair. It binds the new page to the original authenticated user and workspace.

Each download rereads the artifact binding before and after calling the existing
PDF export endpoint. The existing reader verifies the PDF signature, MIME type,
size, archived SHA256 and current identity. A failed refresh removes prior links
and revokes their object URLs; closing the page does the same. The receipt action
exists only for an actual saved receipt. Refresh retries only reads.

No settlement, signature transition, payment or number reservation is submitted
by this page. The existing PDF endpoints retain their existing behavior: they can
archive a missing PDF for an already issued immutable document. No endpoint,
SQL, security-policy or production change is included here.

## Validation

A test exercising the real saved-contract page first failed because the archive
entry was absent; it passes after the change. 66 focused tests passed, no skips:

```sh
node --test tests/v267-contract-execution-archive.test.mjs tests/v267-document-upload-pages.test.mjs tests/v267-contract-execution-pdf.test.mjs tests/v267-contract-execution-package.test.mjs tests/v267-contract-execution-readiness.test.mjs
```

The new archive tests execute the actual page and PDF reader with simulated DOM,
authentication and transport. They cover both copies, paid/zero-receipt cases,
wrong scope, malformed bindings, binding changes during export, corrupted bytes,
network recovery, stale-link cleanup and session revocation. New interface
messages have English, Hindi, Urdu and Malayalam translations.

This is not hosted authenticated signing or archived-readback acceptance. The
owner's iPhone preview/zoom/print-or-download observations on the previous
`62fa067f` deployment remain evidence for that earlier candidate only. Full
execution acceptance, save-and-reopen confirmation, other device checks and the
existing production/restore gates remain open.
