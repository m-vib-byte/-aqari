# Commercial sales basis — review candidate

Production readback on 5 October 2026, after #413, confirmed that the terms
table lacks `sales_rent_basis`, its save RPC silently ignores that input, and
the sales RPC/table only support `additional_to_base_rent`. The current UI and
Preview support `greater_of_base_or_percentage`. This is a real schema/function
gap, not an obsolete fixture. A nullable assertion in the existing sales suite
missed the failed save and reported only the later `INVALID_COMMERCIAL_SALES`.

The candidate reuses the committed historical basis migration and constraint
alignment, within one transaction with a five-second lock timeout. Exact hashes
of both Production functions and the absent-column check reject source drift
and repeat installation. It adds the column, persists the selected basis,
returns it to the UI, binds posting to the approved terms revision and basis,
and charges only the positive excess above base rent for the greater-of basis.
It keeps the existing MFA, property/document, closed-period, immutable-history,
workspace-lock and idempotency guards and RPC ACLs.

No existing sale, adjustment or payment is recalculated. The column default
records the only basis implemented before this upgrade. It does not reconstruct
historical user intent; any contract whose intended basis was silently ignored
needs evidence-led review rather than a guessed financial backfill.

## Verification

Run from the repository root:

```sh
python3 scripts/build-production-sales-basis-reconciliation.py
node scripts/verify-production-sales-basis-reconciliation.mjs
```

An optional absolute `AQARI_SCHEMA_CATALOG` selects a freshly captured application
DDL catalog. The local run passed against current Production DDL (171 tables,
384 functions), with synthetic Auth/Storage only. The acceptance copy changes
one assertion to `IS DISTINCT FROM`, so an absent returned basis fails explicitly.
It reproduces the ignored save before the candidate. Thirteen acceptance suites
then pass together with the maintenance, rating/contact, allocation and account
status candidates, including both sales bases, exact amounts, reversal, duplicate
requests, MFA, isolation and closed-period protection. A separate rehearsal
compares old sales, adjustments and terms and verifies unchanged function ACLs.
Repeated installation is rejected.

## Deployment status

Review only; outside automatic migration directories. No hosted candidate was
applied and no real business row was changed. The schema catalog is not a backup.
Complete current DB/Auth/Storage export and isolated restoration, hosted rehearsal,
advisors and formal migration review remain required before Production installation.
Local Storage metadata tests do not establish file-byte recovery or device acceptance.
