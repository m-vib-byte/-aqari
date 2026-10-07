# Bank ingest readback and in-dialog recovery — 2026-10-07 Kuwait

The incoming-transfer form now rereads the scoped queue before submitting and rejects
an already visible bank-source/external-ID pair. It freezes the submitted payload and
locks the form before sending. A successful acknowledgement is not sufficient: an
independent read must contain exactly one matching transfer, with the acknowledged ID
when available, unmatched state, no payment link, initial revision and matching date,
amount, bank reference, sender, account hint and memo. Amount comparison normalizes
decimal text into fils with BigInt rather than floating-point equality.

A lost response or failed/mismatching readback retains the form and the lock. The
explicit recovery button performs only a list read, never another ingest. The inner
Back button cannot discard an unresolved attempt. A definitive transactional validation
or duplicate rejection, or the exact MFA-required rejection, unlocks the form for
correction. Generic transport errors do not unlock it. No automatic matching is added.

## Verification

- 46 bank-reconciliation and financial-register tests pass, including six new runtime
  cases for exact ingest readback, contradictory fields, lost acknowledgements, failed
  readback/recovery, duplicate preflight and definite versus uncertain rejection.
- Tests run the real page with DOM/RPC substitutes. Existing Vercel build runs the suite.
- Runtime inventory and diff checks pass. No new schema, grant or hosted record changes.

Recovery state is held only while this dialog remains open; durable recovery after
page reload and real hosted UI/RLS/device acceptance remain. Preflight is not a
replacement for server uniqueness or permissions. R12.09 remains partial. Draft
stacked on PR448; no production merge or publication.
