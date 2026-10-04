# Issued payroll allocation history — 5 October 2026 Kuwait

Monthly and annual reports used each employee's current property allocation. Editing an allocation changed the apparent cost of an already issued salary; transferring the employee could remove that salary from the former property's report. This repair freezes the exact-fils allocation atomically when a new payroll leaves draft status.

A private, RLS-enabled, client-inaccessible snapshot table records property, percentage, allocated amount and capture time. Updates and deletes are rejected. The capture trigger uses the existing validated exact-fils splitter after generated net has been calculated. Missing multi-property allocation aborts issuance and leaves the draft unchanged. Later approvals and payment do not recapture it.

Monthly, annual, property cost and month-close checks use the issued snapshot when available. Moving an employee does not remove historical property cost or bypass a closed historical month's guard. Drafts continue to use current allocation. Report rows and CSV identify the basis: issued snapshot, current draft, or current allocation for a legacy salary whose historical allocation was not recorded.

No existing payroll, payment, voucher, approval or allocation row is rewritten or backfilled. Existing issued salaries without snapshots remain explicitly labeled legacy/current; their historical percentages cannot be invented. Salary correction versions retain their existing document-only behavior; this repair does not introduce expense posting, transfer money or replace financial records with corrected document amounts. Scoped report permissions and existing salary RPC ACLs are retained.

## Verification

The isolated PostgreSQL runner first reproduces the old historical-drift failure, then applies the migration twice and checks actual RPC issuance, allocation changes, employee transfer, new drafts, monthly/annual/property reports, failed issuance rollback, immutable/private snapshots, the remaining HR lifecycle, and protection of the old property's closed month. An upgrade fixture checks no legacy snapshot is fabricated. The existing two-approver/signed-document salary lifecycle is also executed with the migration installed.

The hosted Preview test uses a dedicated synthetic workspace and full rollback. It does not pay real money or modify production business rows. Physical device and actual payment acceptance remain separate.

The migration modifies only checked source expressions in existing report and close-guard functions and preserves their ACLs. It aborts when expected expressions have changed. New helper/trigger functions are SECURITY INVOKER with empty search paths and no client execution grants.
