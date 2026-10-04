# Saved report filters — 5 October 2026 Kuwait

Requirement R24.12: retain repeat report choices across devices without retaining financial results in the browser.

Property statements, the owner report, monthly payroll and annual payroll now offer save/clear controls. Choices are stored per authenticated account, workspace and report. Reopening restores the saved period and available property, while an explicit property/period navigation takes precedence. An unavailable property is ignored. Every report still performs its existing authorization checks and fetches current business data.

The new table has RLS with matching USING/WITH CHECK ownership and active membership constraints. Anonymous access is revoked. The RPC uses SECURITY INVOKER, validates a small allowlist of report/filter fields, dates/month/year and property membership, and cannot choose another account. Save confirmation requires a fresh readback equal to the intended choices. Concurrent writes use last saved preference; mismatching readback reports a conflict. Clear affects only the selected account/workspace/report and leaves currently displayed controls unchanged until reopening.

Verification:

- JavaScript validates malformed dates/fields, current-session checks, per-user/workspace/report isolation, second-session readback, failed/concurrent saves, save/clear controls, explicit navigation precedence and ignored unavailable property.
- Isolated PostgreSQL applies the migration twice and tests real persistence/update/clear, input validation, user/workspace isolation, direct RLS insert/update/delete attempts, revoked membership and anonymous denial.
- The same SQL acceptance runs on the hosted preview in a synthetic workspace with full transaction rollback.
- The isolated runner restores the existing narrow membership SELECT column grant from the original core migration. It does not grant new hosted membership access.

Only filter choices are written. This does not alter leases, receipts, salaries, financial totals, report permissions or saved document wording. Physical iPhone/iPad acceptance remains distinct from automated verification.
