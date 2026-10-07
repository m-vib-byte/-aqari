# Bank reopen read-only recovery — 2026-10-07

Reopening a reconciled transfer previously had no durable pending marker. It now records the expected unmatched state, cleared payment and next revision before sending, reusing the scoped opaque-ID/digest marker from matching. The page switches to read-only recovery while unresolved. Lost responses and contradictory acknowledgements retain the marker; recognized definite validation/MFA rejection clears it. Successful independent readback clears it before banking controls return.

The marker retains compatibility with existing version-1 matching markers: state is part of the digest, without storing a new plaintext field. A stale reopen handler checks for a pending marker before considering another mutation.

Validation: four new runtime cases failed before the fix. Bank and financial suites now pass 64 tests, zero failures. Cases cover lost reopen replies, same-tab dialog recreation, still-linked/later-revision state rejection, unavailable storage before write and definite rejection cleanup. Runtime verification and diff checks pass.

Limits: DOM/RPC fixtures and shared storage simulate recreation; hosted reload/device acceptance remains outstanding. SessionStorage does not guarantee recovery after tab closure, storage clearing or another device. Ingest reload recovery remains open. No real financial action, database migration or production deployment. R12.09 remains partial; counts 16/106/152 unchanged.
