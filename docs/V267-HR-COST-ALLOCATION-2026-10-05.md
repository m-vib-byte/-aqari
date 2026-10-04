# HR cost allocation integrity — 5 October 2026 Kuwait

Monthly payroll reports previously assigned 100% of a multi-property employee's net salary to every property when allocations were missing. Annual reports instead used zero, independently rounded each portion, and contained an employee alias that conflicted with the PL/pgSQL employee variable. A 0.001 KWD salary split 50/50 could become 0.002 KWD across properties.

The shared private calculation distributes whole fils by largest remainder, with property UUID ordering for ties. Monthly, annual and property-filtered reports use the same result. An employee on one property defaults to 100% only when no allocation exists. Missing or inconsistent multi-property allocations block reports and month review/approval/closure with a readable message. No percentage is invented or saved by this migration.

Allocation inputs must be positive, no greater than 100%, contain at most two decimal places, belong to the employee's property scope without duplicates, and total exactly 100%. Validation occurs in both the browser and the RPC before stored numeric precision can change the total. Failed report refreshes clear the previous results instead of leaving a stale total visible.

The migration adds a private SECURITY INVOKER helper, revokes direct public/anon/authenticated execution, and patches exact expressions in the existing RPC. It preserves later numeric salary voucher fixes, the RPC's existing authorization and ACL, business rows and counters. Applying it twice is covered by the isolated test.

## Verification

`node staging-database/local-test/run-hr-cost-allocation.mjs` first reproduces the duplicated-fils failure without the repair, then passes with the migration applied twice. It exercises actual HR RPCs in disposable PostgreSQL with real pgcrypto, including:

- 0.001 KWD at 50/50; monthly and annual sum agreement; property filtering does not reassign the remainder.
- Zero, odd-fils and large amounts, plus 33.33/66.67 allocations.
- Missing allocation refusal for monthly, annual, cost reports and month review; invalid existing totals fail closed.
- Malformed and over-precise shares, duplicates, self-service write/read denial and private helper access denial.
- Single-property default and the original full HR lifecycle through salary correction, month close, settlement and immutable history.

The existing JavaScript allocation tests additionally cover NaN, infinity, negative/zero shares, empty/null values, scientific notation and precision-loss inputs.

## Scope still open

Reports continue to use the employee's current property list and current allocations, as before. This change does not freeze historical allocation snapshots, define payroll-to-expense accounting policy, certify a physical printout or assert completion of the entire HR requirements group. Those need their own implementation and acceptance evidence.
