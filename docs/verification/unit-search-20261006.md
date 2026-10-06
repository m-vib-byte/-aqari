# Authoritative unit search — 2026-10-06

Production observation: unit 101 was visible in a property's full file but global search returned no results. The legacy rent-office projection had no rows for that unit. Draft leases must not be activated or assigned a financial balance to make units searchable.

This change adds a read-only unit directory to global search. The authenticated Supabase client reads minimal property/unit identities, with explicit workspace filters, deterministic pagination, and existing property RLS. Results open the full property file by ID after re-reading the unit's current property binding. They expose no tenant contact details, payment state, or financial actions.

Queries are cancelled when search text, period, visibility, or authentication changes. Stale responses are ignored. Connection failure is shown separately from an empty search. No PII cache or local-storage index is introduced. An explicit error replaces silent truncation above 10,000 source rows.

Evidence:
- Failing reproduction before the fix: unit 101 with an empty legacy rent ledger produced zero results.
- Passing after: authoritative unit 101 appears, including Arabic-digit search; no paid label or payment action.
- Tests cover pagination, denied properties, unexpected workspace data, account changes, cancellation, stale results, error UI, escaped labels, and revoked/moved unit opening.
- Prepared release regression suite: 2,429 passed, zero failed/skipped.
- Read-only production catalog confirms RLS enabled on aqari_properties and aqari_units, with staff_read using private.aqari_can_property for properties/read.
- Browser attempt against isolated localhost fixture was blocked by the browser client. No browser acceptance of the new version is claimed.

This branch is based on production e68d7790f12f88bfc32fec358fe8b36b3fb4b0ee and is independent of payment-status PR #421. It does not include that separate fix. Both PRs modify the search file and inventory; combined integration must be checked before merging. No production data, database schema, deployment target, or lease status is changed.

Remaining: authenticated hosted Preview acceptance (search 101, open the correct property, and a restricted-role check). Phone/civil-ID and authoritative tenant/contract directory search remain separate open requirements. This does not complete the overall global-search requirement.

## Combined candidate

The draft now also includes the payment-status fix from #421: unknown/blank payment status is never inferred as paid and review/unknown states are not styled as settled. The authoritative unit results remain free of payment labels and actions. The inventory merge conflict was resolved by recomputing hashes from the combined files. Earlier hosted acceptance applies only to 826cdd5d; the new combined SHA requires its own hosted acceptance.

Combined prepared regression suite: 2,431 passed, zero failed/skipped. Read-only membership inventory in the isolated Preview database found one active general_manager and no active restricted-role accounts. No account or permission was created or expanded; restricted-role browser acceptance remains unverified.
