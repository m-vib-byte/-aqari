# Commercial sales basis reconciliation — review only

Production read-only inspection on 2026-10-05 confirmed register fingerprint
`cb97e85ab6de0e476adf67eec893292e` and an additional-to-base-only constraint.
The UI and approved terms workflow support greater-of-base-or-percentage, but
the captured Production sales register rejects it with INVALID_COMMERCIAL_SALES.

This candidate reuses the existing 20260912191240 basis migration and
commercial-sales-basis-constraint.sql. It adds the terms basis with the existing
additional-to-base default, patches the two exact captured function definitions,
and permits both approved bases. No business-row UPDATE, DELETE or INSERT runs
at installation. Existing sales amounts and request snapshots are unchanged.

The acceptance verifier applies this candidate, then the account-status and
commercial-allocation candidates. Reinstallation fails closed at the function
fingerprint gate. Use the whole transaction; do not extract statements.
This file is outside automatic migrations.

The verifier reproduces the prior failure, then passes the complete sales,
vacating/clearance and commercial collections suites using synthetic rollback-only
rows in local PostgreSQL memory. These cover exact arithmetic, zero differential,
approved terms revision/basis, source documents, retry identity, reversals,
closed periods, MFA and workspace/role restrictions. No hosted connection is used.

This is NOT a Production activation, complete backup, hosted restoration test,
or iPhone/iPad/Desktop acceptance. Hosted application remains pending the existing
recovery gate and a fresh schema/precondition check.

The verifier additionally restores the captured Storage SQL policies and runs all
nine completion suites together after the six reconciliation candidates in one
in-memory database. This covers maintenance workflow/attachments/work-order links,
tenant ratings/contact preferences, sales/clearance, collection accounts and vendor
identity. Actual Storage HTTP transfer and full Auth services are not modeled.
