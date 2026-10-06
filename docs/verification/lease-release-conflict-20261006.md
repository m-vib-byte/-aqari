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
