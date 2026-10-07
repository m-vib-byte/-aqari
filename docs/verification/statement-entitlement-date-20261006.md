# Statement entitlement date regression

The installed isolated Preview statement used the lease/calendar start date for the charge timestamp even when rent entitlement began later. A read-only fixture extracted the actual installed charge SELECT and reproduced 33 KWD charged on 2025-09-19 although entitlement begins on 2025-09-20.

`official-statement-due-date.sql` replaces only that date expression with the existing entitlement-aware helper. It requires the exact reviewed commercial-aware function hash, stops if the prerequisite is missing or changed, and supports replay of this exact patch. Existing payment, cancellation, adjustment, credit, commercial collection, reversal and authorization code is preserved byte-for-byte. No ACL, user, JWT, table, ledger, document or reservation changes.

Applied `v267_official_statement_due_date` to isolated Preview only on 2026-10-06. Eight read-only SQL fixtures passed after the pre-fix failure: before due, on due, due date as report start, next-month opening balance, manual first amount, full first month, free first month, legacy date behavior. Verified the complete installed definition differs by only the intended expression and the ACL remains `{postgres=X/postgres}`; anon and authenticated cannot directly execute this private helper.

These tests cover the installed charge query and installed entitlement helpers, not the authenticated full statement/PDF flow. No authenticated session was fabricated and no test account was created. Production is missing the statement prerequisite; this patch deliberately refuses to bootstrap it. Production repair still needs dependency ordering and full review, then exact-candidate acceptance. Overall requirement counts remain unchanged.

Security advisors were inspected after the change; this is not a claim that the whole Preview project is free of unrelated findings.

## Follow-up: complete aggregation query

`official_statement_ledger_readonly.sql` executes the full entries and aggregation query extracted from the installed Preview statement against synthetic CTE rows. All 15 cases passed: paid, cancelled, pending, future, other workspace, other lease, credit/debit adjustments, credit/debit ledger entries, excluded cancellation ledger, allocated credit, commercial collection, commercial reversal, and payment before the reporting period. It compares all four totals (opening, charges, payments, credits), without writing tables or bypassing any account authorization.

Combined with the 8 date cases, this is 23 SQL calculation cases. This is stronger calculation evidence for the statement portion of R10.03, supporting partial implementation only. It does not prove the public authenticated RPC, PDF rendering, renewal/nonrenewal notices or complete requirement acceptance.

A read-only literal dependency scan found no unresolved private function names in Preview after excluding existing table references. Production still has 6 call sites referring to 4 missing helpers: statement, contact-channel permission, effective contact profile, and rent-period breakdown. Name resolution is not an argument-type or runtime acceptance test. No production schema changes were made.

## PDF/archive follow-up

The real PDF renderer and archive API passed 21 focused Python tests. A new statement-specific test covers three calculation vectors, including the negative opening balance, verifies extracted PDF dates, typed document number and exact monetary strings, rejects leftover template placeholders, and proves subsequent export returns the same archived bytes without rendering again. The transport is simulated in memory; this does not prove hosted archive persistence or browser/device acceptance. No runtime code or database schema changed in this follow-up.

Command: `PYTHONPATH=.:tests python3 -m unittest official_document_pdf_test official_document_archive_test -v` (21 passed, no failures/skips).
