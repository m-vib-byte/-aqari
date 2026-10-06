# Contract execution backend continuation — 2026-10-06

Read-only comparison of Production djkpkkgoibruaezdrchb and Preview ofgmcsmxmdswlovsckqs found:

- Production lacks private.aqari_contract_execution_settlements and private.aqari_contract_execution_artifacts, their app-state projection triggers, and the public artifact read RPC.
- Preview has both tables and projection triggers. Existing contract and receipt allocator definitions differ between the two environments; copying the old finalization SQL would replace them.
- The two legacy service scripts install successfully against the captured 2026-10-05 Production schema in local PGlite. Installation alone does not establish runtime readiness.
- Executing the old title expression fails with `invalid input syntax for type json` because concatenation and JSON extraction are not parenthesized. Preview's settlement function already contains the parenthesized expression; the source was stale.

Fixed the JSON extraction grouping in settlement title, body and official document number, and in the prepared-package title/body. No monetary formula or document text is changed. Added a PostgreSQL test that executes the expressions extracted directly from both source files: 12 fixtures, with exact title/body/number assertions, including Arabic and quoted identifiers. Added this test to Runtime contracts CI.

Local validation: 12/12 expression cases passed; both legacy scripts installed in memory on the captured Production schema; release freeze passed. No hosted migrations, receipt reservations, contract signing, or business-data changes occurred. The existing PR423 protection remains in Production.

Not closed: full signed-contract transaction tests, current-schema migration reconciliation, allocator preservation, rent-entitlement/schedule compatibility, PDF package integration, hosted role/session acceptance and physical owner devices. This source correction must not be reported as activation of the missing backend.
