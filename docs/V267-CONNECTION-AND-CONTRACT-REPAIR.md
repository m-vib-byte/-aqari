# V267: connection and contract approval repair — 9 September 2026

Release Gate remains **HOLD**. This follow-up starts from development commit
`70cad13c5fa2b4dc947a02afbd416fbb515ce449` on PR #70. The changes are for the
development branch; no production merge, domain change, hosted SQL write or
account creation is part of this repair.

## Contract approval regression

An assigned property manager could submit a new legacy-shaped contract without
`rentalTermsVersion` and bypass the newer manager-approval validation. Running
`staging-database/tests/staff_contract_approval.sql` against the baseline in the
isolated local PostgreSQL engine failed with
`STAFF_LEGACY_NEW_APPROVAL_BYPASS:approved`.

The scoped save now requires the current source and contract versions on every
changed contract row from a non-manager. It still accepts unchanged historical
rows. A valid current draft can be saved and read back; approval remains a
manager operation, and signing still requires a saved signed-contract document.
This does not claim that every printing path or every legacy manager workflow
has passed final acceptance.

The regression covers new and existing legacy approval/signing attempts, current
approval/signing attempts, unchanged history, valid draft persistence, manager
approval and rejection of signing without a document. It is included in the
local PostgreSQL npm test command used by Runtime contracts CI.

## Initial connection could leave a dialog busy indefinitely

`createSession.connect()` previously awaited `getClient()` without a deadline.
Dialog actions awaited this connection before running their own bounded queries.
A provider promise that never settled therefore left that dialog busy indefinitely.

Client setup now has a 20-second deadline and is cancelled when the session is
closed. The candidate client is retained only after the bound user, workspace and
role are checked again. A timed-out attempt cannot overwrite a later successful
retry. The underlying provider promise has no cancellation API; its eventual
result is discarded. No password, account, redirect or database configuration is
changed by this fix. The deadline is a failure bound, not a response-time target.

Four added tests cover timeout followed by a successful retry and late result,
immediate close with a permanently unresolved provider, an account change during
setup, and recovery from a synchronous setup error.

## Verification and remaining limits

- 610 Node tests passed, zero failures, cancellations or skips.
- The contract regression and existing staff-scope and expense-register SQL
  suites passed in a fresh local in-memory PostgreSQL instance. Synthetic rows
  were rolled back. No hosted database was contacted by these tests.
- Local tests do not establish real-account browser results, physical iPhone or
  iPad behavior, multiple concurrent database connections, or a successful CI run.
- The 155-item gate, independent hosted integration, V266 restore rehearsal and
  configured external providers remain open.

Read-only verification during this follow-up still resolves `myaqari.com` to
production deployment `dpl_HcqaX1zBBrhmMD2qnMakENyH1Djb`, commit
`2cd2804d496b82c0ce9cf5e09fd3d9368a62510a`. Its `main` source config points to
`djkpkkgoibruaezdrchb`. The available Supabase project list contains that project
and the existing V266 project `qtavnufzbkdfeauyukot`; the former has no development
branches. There is no verified separate hosted target for applying these SQL
changes. A project named Staging is not by itself proof of isolation.

The new SQL is therefore committed for isolated validation only. It has **not**
been applied to either protected database. CI/Preview status must be read from
the final development commit; older test or deployment results do not qualify it.
