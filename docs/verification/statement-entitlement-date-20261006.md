# Statement entitlement date regression

The installed isolated Preview statement used the lease/calendar start date for the charge timestamp even when rent entitlement began later. A read-only fixture extracted the actual installed charge SELECT and reproduced 33 KWD charged on 2025-09-19 although entitlement begins on 2025-09-20.

`official-statement-due-date.sql` replaces only that date expression with the existing entitlement-aware helper. It requires the exact reviewed commercial-aware function hash, stops if the prerequisite is missing or changed, and supports replay of this exact patch. Existing payment, cancellation, adjustment, credit, commercial collection, reversal and authorization code is preserved byte-for-byte. No ACL, user, JWT, table, ledger, document or reservation changes.

Applied `v267_official_statement_due_date` to isolated Preview only on 2026-10-06. Eight read-only SQL fixtures passed after the pre-fix failure: before due, on due, due date as report start, next-month opening balance, manual first amount, full first month, free first month, legacy date behavior. Verified the complete installed definition differs by only the intended expression and the ACL remains `{postgres=X/postgres}`; anon and authenticated cannot directly execute this private helper.

These tests cover the installed charge query and installed entitlement helpers, not the authenticated full statement/PDF flow. No authenticated session was fabricated and no test account was created. Production is missing the statement prerequisite; this patch deliberately refuses to bootstrap it. Production repair still needs dependency ordering and full review, then exact-candidate acceptance. Overall requirement counts remain unchanged.

Security advisors were inspected after the change; this is not a claim that the whole Preview project is free of unrelated findings.
