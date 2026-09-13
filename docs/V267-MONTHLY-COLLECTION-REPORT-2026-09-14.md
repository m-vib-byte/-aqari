# V267 monthly collection report — 14 Sep 2026

Scope: Preview/Staging only. This change advances G07-06 (monthly property collection statement) and G07-07 (collection percentage) from the authoritative persisted rent-due schedule introduced on the preceding candidate.

## Calculation contract

`public.aqari_monthly_collection_report(workspace, month, property)` is permission/property scoped and reads `private.aqari_rent_due_periods`, signed lease links, units and properties. It returns both property summaries and lease-level evidence lines.

For each lease/month:

- gross contract rent = original `contractRent` when valid, otherwise the lease rent;
- discount = gross contract rent minus authoritative due, never below zero; this naturally exposes a full free-month waiver as a discount while the due remains zero;
- paid total = non-cancelled payments already projected into the authoritative due schedule;
- allocated paid = `least(paid_total, due)`;
- overpayment = `greatest(paid_total - due, 0)` and is shown separately;
- remaining = `greatest(due - paid_total, 0)`.

The collection percentage is `sum(allocated_paid) / sum(due) * 100`. The response explicitly publishes the numerator and denominator. Cancelled receipts are excluded by the authoritative due schedule, overpayments cannot inflate the numerator, and zero-due/waived months add zero to the denominator.

## Hosted isolated-Preview verification

Applied only to Supabase branch `v267-isolated-test` (`ofgmcsmxmdswlovsckqs`) as migration `v267_monthly_collection_report`.

The RPC was then called under the existing authenticated general-manager identity for the existing Preview property's September 2026 due period. Readback verified:

- due: 100.000 KWD;
- allocated paid: 100.000 KWD;
- remaining: 0.000 KWD;
- collection percentage: 100.00%;
- numerator equals allocated paid and denominator equals due;
- cancellation and overpayment exclusion flags are present.

No business row was inserted, updated or deleted by the report test.

## UI

`src/v267/pages/property-statements.js` now keeps the legacy imported/source statement separate and adds **كشف التحصيل الفعلي**. The operational panel shows contract rent, discounts, due, total paid, amount counted in the percentage, remaining balance, overpayment, numerator/denominator, and lease-level details. It remains available even when no legacy source statement exists for that month.

Source and UI contracts are pinned by `tests/v267-monthly-collection-report.test.mjs` and `tests/v267-monthly-collection-ui.test.mjs` and run in the exact Vercel Preview build.

This does not by itself prove all-property historical acceptance, physical-device acceptance, full 155/155 acceptance, backup/restore/rollback or Production readiness.
