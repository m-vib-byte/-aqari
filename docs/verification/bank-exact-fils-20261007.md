# Bank reconciliation exact fils — 2026-10-07

Large decimal strings such as `99999999999999.999` and `99999999999999.998` collapse to the same JavaScript Number. Candidate filtering and saved-state verification therefore could accept a one-fils discrepancy, and the displayed amount could be rounded.

The bank page now uses its integer-fils parser for candidate equality, persisted amount verification, and three-decimal display. Invalid amounts never match each other. Numeric transport values outside safe integer-fils precision are rejected; large amounts must arrive as exact decimal strings. This does not recover precision already lost before the page receives a value.

Validation: four new runtime cases cover large adjacent fils, contradictory readback, invalid/unsafe numeric input, and equivalent decimal scales. Three cases failed before the fix. The bank and financial-register suites now pass 50 tests; staging runtime verification and git diff --check pass.

These are DOM/RPC fixture tests, not authenticated hosted acceptance. No database change, actual transfer, production deployment, or owner acceptance is included. Durable ingest recovery after closing/reloading the page remains open. R12.09 remains partial; platform counts remain 16 complete, 106 partial, 152 requiring verification.
