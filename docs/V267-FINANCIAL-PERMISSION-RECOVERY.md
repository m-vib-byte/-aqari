# Financial register read-permission recovery

The expense register previously left its last successful read, audit history,
document choices and local draft visible after the server denied a list refresh.
The dialog displayed the error while those private values remained accessible.

The register now clears those values on HTTP 401/403, PostgreSQL `42501`, or
`ACCESS_DENIED`. A successful authorized reread displays saved records only; it
does not revive discarded drafts or locally entered approval reasons. No saved
expense, document or audit row is changed by this cleanup. A direct write denial
uses the same cleanup and propagates the original status/code to the shared dialog
so its server-permission boundary can close the view. Adding a retry explanation
must not strip that authorization error. Disposal clears the remaining lock.

If a write was awaiting confirmation, cleanup retains only a non-sensitive lock.
Another write stays blocked until an explicit authorized reread. The user then
sees the saved records and a request to review the previous operation; the page
does not claim it matched an operation whose local details were cleared.
Temporary HTTP 503 failures retain the draft and the existing uncertain-write
lock, allowing the normal successful readback to confirm the original operation.

Verification: all 18 tests in `tests/v267-financial-register.test.cjs` passed,
including five new regressions covering four denial forms, denied confirmation
after a persisted write, direct write-error propagation to the shared dialog,
and temporary read/write failure recovery without duplicate writes.
These are local UI-fixture checks, not hosted-account or physical-device evidence.
