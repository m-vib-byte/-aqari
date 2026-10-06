# Contract execution MFA recovery — 7 October 2026

Continues PR #428 from `9152db449c822cd6aed77e88d2136ac7f1a46989`.

## Reproduced problem

The package endpoint collapsed user-scoped source MFA challenges into a generic
HTTP failure, and its client discarded authorization status. Independently, the
actual contract form permanently disabled its submit button before finalization,
even when the server explicitly rejected the operation for recent MFA. The shared
dialog's earlier draft-preservation fix could not restore this business control.

## Change

- Preserve only HTTP 403 / PostgreSQL 42501 with exact `MFA_REQUIRED` or
  `MFA_RECENT_REAUTH_REQUIRED` from the user-scoped source RPC, before package
  commit. Only the allowlisted message and code reach the client; upstream
  details/hints and privileged-commit errors remain hidden.
- Preserve generic 401/403 statuses so the existing dialog disposes unauthorized
  views. Recheck scope after reading a challenge body.
- Keep entered payment/reference fields and enable an explicit manual retry only
  when settlement has not been sent or its transaction was explicitly rejected
  by MFA. There is no automatic resubmission.
- Keep submission locked after unknown outcomes and after a successful write
  followed by a read challenge. Explain that the contract must be checked before
  another approval or payment. A changed scope closes the view. Disabled forms
  also ignore subsequent submit events.

## Evidence

Before the fix, four new JS tests failed and the Python source-challenge test
failed in four subcases (both messages, before and after PDF rendering).

After the fix: 81 JS tests and 19 Python tests pass, no skips. Commands:

```sh
node --test tests/v267-contract-execution-package.test.mjs tests/v267-dialog-progress.test.mjs tests/v267-contract-execution-readiness.test.mjs tests/v267-contract-execution-pdf.test.mjs tests/v266-startup-snapshot.test.cjs tests/v267-auth-repair.test.cjs
python3 -m unittest discover -s tests -p contract_execution_package_test.py -q
```

The tests execute the real HTTP handler, preparation library, client, dialog,
submission handler and finalization function with simulated transport/DOM. The
existing real-renderer test generates tenant/owner/receipt PDFs and verifies
stable hashes. Source denial before or after rendering never calls the privileged
commit. Misleading/oversized/malformed errors, expired sessions, scope changes,
timeouts and post-save failures are covered. These are local tests, not hosted
authenticated or physical-device acceptance.

No SQL, database permissions, MFA policy, business records or production release
changes. Hosted authenticated package preparation/signing/readback and owner
iPhone/iPad acceptance remain open. Do not increase completed-requirement counts
or infer production readiness from this fix. The existing production dependency
and restore gates still apply.

Error mapping checked against Supabase's PostgREST error documentation:
https://supabase.com/docs/guides/api/rest/postgrest-error-codes

## Integration

Merged current production main `3bb3cae3fcf8a1145c39ac8992fee78685ec2064`
into this preview candidate. Preserved package preparation, service-readiness
guards and published search/ledger fixes. Resolved the import/inventory/history
conflicts, then repeated the focused tests and the runtime verification on the
combined tree. No production branch or deployment was changed.

The state adapter now marks only a direct 403/42501 MFA rejection from the write
response. The finalization code requires that marker before treating a submitted
settlement as uncommitted. Post-save context checks, missing HTTP status, generic
permission denials and expired sessions never receive the marker. Tests execute
the actual adapter for update, insert and staff RPC paths, including successful
write followed by failed reauthorization. The added auth/startup regressions
bring local evidence to 100 passing cases (81 JS + 19 Python).
