# Editable contract wording drafts on latest V267 support head — 13 September 2026

This support branch forward-ports the editable contract/declaration draft editor from stale PR #120 onto the exact latest PR #116 support head `f9bcefb5c4a7b1c5464abe0c486ca5317d3dc8b9`, without rewriting or merging the parallel branches.

## Implemented

The general manager receives a **قوالب العقود والإقرارات — تعديل المسودات** entry from the rental-contract workspace. Five independent editable drafts are available: house, apartment, shop, vacating undertaking, and unit handover. Each supports title/body editing, variable-field insertion, text-only preview, append-only versioned save, exact readback verification, retry reconciliation after a lost acknowledgement, concurrent-revision conflict rejection, and unsaved-change warnings.

The bundled wording remains explicitly provisional. The editor does not approve legal wording, issue an official document, alter a signed lease, fill live tenant data automatically, or change historical contracts. The actual handover date/time remains separate from the drafting date.

## Authorization and persistence

The application domain rejects non-`general_manager` sessions before a query is made. The additive database migration is intentionally **not applied by this branch**. It grants authenticated users only SELECT/INSERT, keeps UPDATE/DELETE ungranted, binds the author to `auth.uid()`, accepts only draft status, and requires both `private.aqari_manager(workspace_id)` and the existing administration/contracts permissions in RLS.

The migration file contains an explicit Production prohibition until the owner's later exact-SHA Production approval. This branch does not touch Production, the Production data source, `main`, `myaqari.com`, or historical V266.

Historical note: PR #120's execution record documents a temporary schema mutation against the Production data source that was subsequently removed. This forward-port does not replay that operation and makes no hosted database write.

## Verification

`node --test tests/contract-template-drafts.test.mjs` passed 15/15 locally on the code copied into this branch. Coverage includes all five templates, required placeholders, independent handover date/time, signature/fingerprint wording, validation limits, manager-only access, exact persisted readback, idempotent retry, lost acknowledgement reconciliation, concurrent-revision conflict, wrong workspace/user rejection, failed insert behavior, and static RLS/append-only checks.

A dedicated read-only GitHub Actions workflow is included. Remote CI is accepted only if GitHub actually allocates a runner and executes the steps on the final SHA.

## Release boundary

This is a Preview/support implementation only. It does not satisfy 155/155 acceptance, hosted authenticated Preview acceptance, physical Desktop/iPhone/iPad acceptance, complete Database/Auth/Storage-byte backup, independent restore, transaction-preserving rollback rehearsal, Production configuration verification, or the owner's later explicit Production approval of the exact unchanged tested SHA. Release gate remains HOLD.
