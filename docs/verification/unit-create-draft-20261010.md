# Unit creation draft protection — 10 October 2026

Requirement R01.07 is partially implemented; this closes a concrete uncovered form path, not the entire requirement.

The full property add-unit form previously had no departure guard. It now detects changes across all 15 controls, offers cancel/discard on close, warns on browser departure, and blocks ordinary close while the save is being verified. A failed or unconfirmed save keeps input and warns to check the property record before creating another unit. Verified save clears the warning. Native dialog auth-boundary disposal remains unchanged.

Validation: four new behavioral regressions fail against a626f9f0 and pass after the fix. All ten focused unit-create tests pass, including existing Arabic/Persian numeric parsing and pre-write validation. Tests use synthetic RPC results; no live business data was written. Hosted CI and physical device acceptance remain separate.

This change does not redesign the existing two-RPC save or make retries atomic. Force-closing a mobile app cannot be guaranteed to display beforeunload. No production merge, deployment, database or authentication changes.

## Retry follow-up — 10 October 2026

The departure-guard head e69be564809575097a82aecf9b04448c66ed1945 completed all nine hosted workflows. Its Preview is READY; HTTP 200 /api/release independently identifies that exact SHA and the preview environment.

This follow-up fixes the two-step form's retry state, without changing SQL. The first readiness request retains its ID and immutable payload after uncertain outcomes. Once acknowledged, its unit identity is retained. A repeated master attempt first reads the scoped property file: an exact revision-one match is accepted without another write; an explicitly revision-zero unit may retry the same payload with expected_revision=0. Missing, foreign, conflicting or unreadable results block another write. All master fields, services and workspace/user scope are checked before success. Inputs are frozen while a pending operation is unresolved; the existing translated notice explains that Save verifies that same operation. Transactional first-step validation rejections unlock corrections.

Validation: all 16 focused tests pass, including six added tests exercising lost readiness responses, rejected and committed-but-unacknowledged master writes, missing/foreign/conflicting readback, transactional rejection correction, and all-field/scope verification. Five behavioral tests fail against the prior implementation. Syntax check passes. These are synthetic RPC tests, not real-account or device acceptance.

Limits: the two writes remain separate database transactions. An incomplete unit can exist after the first succeeds; no rollback or deletion is introduced. Closing the dialog or ending the session discards its in-memory retry state, so existing property records must be checked before starting again. A conflicting or invalid master payload may require reopening the existing unit for correction. This does not complete R01.07, deploy Production, change schema, or write business records. Hosted checks for this follow-up remain pending until independently verified.
