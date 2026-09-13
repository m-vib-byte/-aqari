# V267 collector performance — 14 Sep 2026

Scope: Preview/Staging only. This advances G07-09: performance by collection employee using operation count and amount, with explicit settlement separation and safe handling of legacy names.

## Identity policy

New rent-payment rows receive immutable attribution from the authenticated actor when that actor is an active workspace member. A typed collector/accountant name is never allowed to override the authenticated account identity.

Historical rows retain their literal saved collector/accountant source name. They are reported as `legacy_unmatched` until a manager explicitly maps the normalized legacy name to an active workspace account through `aqari_set_collector_alias`. The alias write requires the manager permission boundary and recent MFA (`private.aqari_require_sensitive_aal2`). No fuzzy/automatic assignment to a person is performed.

`aqari_collector_alias_candidates` exposes only active workspace accounts to a manager for the mapping UI.

## Authoritative report

`public.aqari_collector_performance_report(workspace, from, to, property)`:

- requires `collections/read` plus property scope;
- uses actual saved payment date (`paid_at`), not rent period, for employee-performance timing;
- excludes receipt rows present in the cancellation ledger;
- groups by resolved collector identity/name and mapping status;
- returns operation count, amount, regular-operation count/amount, settlement count/amount, distinct properties and contracts;
- returns receipt-level evidence lines with property, unit, contract, date, method and collector mapping state;
- marks a payment as settlement only when its saved payment metadata contains an explicit settlement classification. Free-text notes are never used to guess settlement status.

## Hosted isolated-Preview verification

Applied only to `v267-isolated-test` (`ofgmcsmxmdswlovsckqs`) as migrations `v267_collector_performance_report` and `v267_collector_alias_candidates`.

The existing Preview property was read for 1–30 Sep 2026 under the authenticated workspace account. The result verified:

- 2 non-cancelled collection operations;
- total amount 200.000 KWD;
- 2 ordinary operations and 0 explicitly classified settlements;
- the preserved historical accountant/collector source name remains `legacy_unmatched`, proving the report did not silently attribute legacy activity to a current user;
- cancellation exclusion and no-auto-assignment policy flags are present.

No test row was inserted or mutated by the report verification.

## UI

The property statements workspace now contains **تقرير أداء موظفي التحصيل** for the selected property/month. It shows operations, amounts, ordinary collections, settlements and receipt details. An unmatched historical name is visibly labelled as unmatched and offers a manager mapping control populated from active accounts. The mapping write goes through the recent-MFA-protected RPC and then reloads the report.

The property selector now also loads authorized property records directly, so operational collection and collector reports remain available for a property even when that property has no imported legacy statement for the selected month.

Focused source/UI contracts run in the exact Vercel Preview build. This does not by itself claim real-account browser acceptance, physical-device acceptance, same-SHA GitHub CI success, 155/155 acceptance, backup/restore/rollback or Production readiness.
