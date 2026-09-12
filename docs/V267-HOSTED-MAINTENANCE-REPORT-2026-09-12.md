# AQARI V267 — Hosted maintenance reporting acceptance — 12 Sep 2026

Environment: isolated V267 Staging only (`ofgmcsmxmdswlovsckqs`). No Production mutation. Synthetic acceptance data was created inside a transaction and rolled back.

## G07-11 — maintenance report by status, cost and time

A new read-only RPC, `public.aqari_maintenance_report(workspace_id, from, to)`, reports only maintenance requests inside the caller's permitted property scope. It derives request counts and approved/request costs from persisted maintenance records and derives response/closure timing from the immutable operation-audit trail rather than from invented SLA values.

The first hosted acceptance run exposed a parser defect: historic maintenance audit events store operation names as `maintenance_insert` / `maintenance_update` in lowercase. The report initially returned null event timings. The parser was corrected to normalize the operation value before matching, then the hosted acceptance was repeated.

The passing hosted transaction created one synthetic request at a fixed historical timestamp, advanced it through `received → assigned → in_progress → completed`, recorded a 12.500 KWD cost, and then read it through the report. Acceptance verified:

- the exact request was present in the report;
- final status was `completed`;
- cost was 12.500 KWD;
- first-response and closure timestamps were resolved from audit events;
- response and close durations were non-null positive values;
- the completed-status aggregate included the request and cost.

The complete synthetic transaction was rolled back after verification.

## Acceptance boundary

This strengthens the server-side implementation for G07-11. A UI/report-export surface and practical real-account/device acceptance remain separate requirements. The report intentionally returns null timing metrics when a historic request lacks the corresponding audit transition instead of fabricating a duration.
