# V267 sensitive-record delete guard — 14 Sep 2026

Scope: Preview/Staging only. This change advances G07-02 (sensitive records must not be deleted; corrections use cancellation/reversal) without changing Production or historical V266.

## Protected records

`private.aqari_reject_sensitive_delete()` raises SQLSTATE `23514` with `SENSITIVE_RECORD_DELETE_FORBIDDEN:<schema.table>` on every direct `DELETE` from:

- `public.aqari_leases`
- `public.aqari_rent_payments`
- `public.aqari_documents`
- `private.aqari_financial_expenses`
- `private.aqari_official_document_series`

The trigger function is not executable by `public`, `anon`, or `authenticated`. Because it is a row trigger, direct server-side deletes are rejected as well; the business correction paths remain status cancellation, receipt-cancellation ledger, expense cancellation, document cancellation/void, and replacement/version records rather than physical deletion.

## Hosted isolated-Preview verification

Applied only to the isolated V267 Preview Supabase branch `v267-isolated-test` (`ofgmcsmxmdswlovsckqs`) as migration `v267_sensitive_record_delete_guard`.

A direct database verification then attempted real deletes against the currently stored Preview lease, payment, and document rows. All three attempts were rejected with SQLSTATE `23514` and the expected `SENSITIVE_RECORD_DELETE_FORBIDDEN:` prefix. No row was deleted. Catalog readback confirmed five `BEFORE DELETE` triggers, including the two empty-at-test-time protected tables (financial expenses and official-document series).

This proves the database delete boundary on the isolated Preview branch. It does not by itself close G07-03 (mandatory reason for every cancellation), full 155/155 acceptance, hosted application acceptance, physical-device testing, backup/restore/rollback, or Production readiness.

## Exact-build regression

`tests/v267-sensitive-delete-guard.test.mjs` pins the source contract for all five trigger bindings, SQLSTATE, privilege revocation, and additive transaction shape. `scripts/build-vercel.mjs` executes that suite in the exact Vercel Preview build.
