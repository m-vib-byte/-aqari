# Contract foundation after an approved early release

Requirement R06.07 remains only partially verified: simultaneous authenticated contract creation has not been exercised.

## Confirmed defect and fix

The installed Preview exclusion constraint uses an inclusive range from `start_date` to `coalesce(vacated_on,end_date)`. The release routine preserves the contractual end and writes `vacatedOn` into the workspace contract snapshot. However, `activeUnitConflict` used only the original end date, so all three foundation checks could reject a new lease beginning after an approved early release.

A regression with a January–December contract released on June 30 failed before the fix: July 1 was incorrectly blocked. The fix accepts a valid in-range `vacated_on` or snapshot `vacatedOn` as the occupancy end. June 30 remains occupied; July 1 is available. It leaves the original contract end untouched. An expired status alone, impossible calendar date, or release outside the contract period cannot shorten occupancy.

## Evidence

- Focused foundation and migration-preflight tests: 22 passed, zero failed or skipped. Includes both release field shapes, inclusive release day, overlap before release, and malformed/out-of-range metadata.
- Read-only catalog inspection in Preview (`ofgmcsmxmdswlovsckqs`) confirmed the GiST exclusion constraint on workspace, unit and inclusive occupancy range. It excludes cancelled contracts and draft statement-import records.
- Read-only Production catalog inspection (`djkpkkgoibruaezdrchb`) confirmed the same occupancy range, but its predicate excludes only cancelled contracts. This existing Preview/Production difference was not changed.

No SQL migration, business write, authentication change, production deployment or concurrent-transaction test was performed. Source-level and catalog evidence do not establish complete hosted contract acceptance. The candidate is based on the current draft PR429 chain and requires its own exact-head review and authenticated UI acceptance.

## Isolated constraint execution

`staging-database/local-test/run-lease-overlap-constraint.mjs` executes the exact exclusion definition from the production schema catalog in local in-memory PostgreSQL (PGlite with `btree_gist`). That catalog definition matched the live read-only production result on October 6. It creates only a disposable local fixture table, without hosted connections or authentication stubs.

**18 cases passed, zero failed:** identical, nested and enclosing periods; both inclusive endpoints; adjacent prior/next days; different units/workspaces; cancelled old/new records; expired contracts without release; day after release versus release day; unknown date bounds; operational drafts; changing dates into overlap; and reactivating a cancelled overlapping record. Rejected writes must specifically return SQLSTATE `23P01`.

Run with the already installed local PGlite package, optionally setting `AQARI_PGLITE_MODULE` to its absolute `dist/index.js`, then `node staging-database/local-test/run-lease-overlap-constraint.mjs`.

PGlite is a single-session engine: these results do **not** prove concurrent transaction behavior, authorization, projection triggers or full hosted contract acceptance. They establish the copied exclusion constraint's insert/update behavior only.

The runtime fix head `2e94a1cb1dce18cd2ac98adb8c571e6cf5790a70` passed test/startup-order/paint checks and reached READY at deployment `dpl_5EBreshey9DodUT86VdtBpr3fcBR`; Supabase Preview was skipped. This follow-up adds verification only.
