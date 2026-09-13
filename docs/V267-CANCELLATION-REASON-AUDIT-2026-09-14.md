# V267 cancellation reason audit — 14 Sep 2026

Scope: Preview/Staging only. This change advances G07-03: every cancellation/void must preserve a reason, actor and time without physically deleting the source record.

## Unified immutable audit

`private.aqari_cancellation_audit` stores the workspace, entity type/id, cancel/void action, required 3–500 character reason, actor id/name, timestamp, and before/after snapshots. The table is RLS-enabled, inaccessible to browser/service roles, and immutable after insert.

Covered paths:

- lease transition to `cancelled`: reason comes from the saved contract `changeReason`; missing reason or actor fails closed; cancelled leases cannot be silently reopened/rewritten;
- document reservation cancellation: direct status mutation is rejected unless a reason-backed audit entry was created by `public.aqari_cancel_document(...)`;
- receipt cancellation ledger insertion: mirrored into the central cancellation audit using its already-required reason and approver;
- financial expense transition to `cancelled`: mirrors the existing required `cancel_reason`, cancelling actor and snapshots;
- official document transition to `void`: requires and mirrors `void_reason`, actor and timestamp.

A manager-only `public.aqari_cancellation_history(...)` RPC exposes only entity/action/reason/actor-name/time, not raw snapshots.

## Hosted isolated-Preview verification

Applied only to Supabase branch `v267-isolated-test` (`ofgmcsmxmdswlovsckqs`) as migration `v267_cancellation_reason_audit`.

Two transaction-scoped acceptance checks were executed and rolled back:

1. A fresh draft document reservation was created against an existing saved lease. A direct `status='cancelled'` update was rejected with `DOCUMENT_CANCELLATION_REASON_REQUIRED`. The new cancellation RPC then succeeded with a reason and the matching immutable audit row was read back. The entire fixture transaction was rolled back.
2. The existing Preview lease was temporarily transitioned to cancelled. The same update without `changeReason` was rejected with `CANCELLATION_REASON_REQUIRED`; adding a reason succeeded and produced the matching actor/reason audit row. The entire transaction was rolled back, so the saved lease remains unchanged.

These checks prove the hosted database boundary and audit behavior for the two previously uncovered cancellation paths. Existing receipt, expense and official-document sources already require reason fields and are now mirrored into the same audit when those paths execute.

This does not claim full 155/155 acceptance, physical-device acceptance, full backup/restore/rollback, green GitHub CI or Production readiness.
