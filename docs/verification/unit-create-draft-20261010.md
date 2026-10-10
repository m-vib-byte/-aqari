# Unit creation draft protection — 10 October 2026

Requirement R01.07 is partially implemented; this closes a concrete uncovered form path, not the entire requirement.

The full property add-unit form previously had no departure guard. It now detects changes across all 16 controls, offers cancel/discard on close, warns on browser departure, and blocks ordinary close while the save is being verified. A failed or unconfirmed save keeps input and warns to check the property record before creating another unit. Verified save clears the warning. Native dialog auth-boundary disposal remains unchanged.

Validation: four new behavioral regressions fail against a626f9f0 and pass after the fix. All ten focused unit-create tests pass, including existing Arabic/Persian numeric parsing and pre-write validation. Tests use synthetic RPC results; no live business data was written. Hosted CI and physical device acceptance remain separate.

This change does not redesign the existing two-RPC save or make retries atomic. Force-closing a mobile app cannot be guaranteed to display beforeunload. No production merge, deployment, database or authentication changes.
