# AQARI V211.1 — secure cloud follow-up journal

V211.1 adds a review-only candidate for durable follow-up history.

- Append-only `aqari_follow_up_events` table with forced RLS.
- Server-derived user identity and workspace-bound membership policies.
- Atomic app-state revision check before every journal insert.
- No tenant name, phone, email, civil ID, or free-form note columns.
- V211 records an event only after an official action succeeds or a reminder is copied.
- A short, scope-bound timeline appears on matching follow-up rows.

The migration is committed for review but is not applied to production by this pull request.
