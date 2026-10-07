# Bank reconciliation independent readback — 2026-10-07 Kuwait

After checking a mutation acknowledgement, the page previously reread the list but
did not compare the returned transfer with the requested reconciliation/reopening.
An unchanged or contradictory list could therefore be followed by a success message.

Reconcile and reopen now validate the response workspace/user and exact transfer ID,
then independently read the scoped list. Success requires the same transfer, requested
state and payment link, the next revision, and unchanged amount, bank source, external
ID, transfer date and reference. Rendering uses that verified response without another
read. Failed or contradictory readback leaves an error instead of a success claim.

The list field mapping was checked against the repository's saved production schema
catalog (2026-10-05). This does not constitute a fresh hosted backend acceptance test.
No SQL, permissions, business records or automatic matching were changed. Ingest
readback and durable recovery across reload are outside this fix.

## Verification

- All 40 tests pass across bank reconciliation and financial register suites.
- Four new runtime cases execute the actual bank page with DOM/RPC substitutes:
  successful exact reread; unchanged/contradictory saved rows; foreign response
  envelope or failed read; and verified reopening with payment cleared.
- Existing Vercel build runs both suites. Runtime inventory and diff checks pass.
- Hosted authenticated UI/RLS and physical-device acceptance remain.

Draft stacked on PR447. No production merge or publication.
