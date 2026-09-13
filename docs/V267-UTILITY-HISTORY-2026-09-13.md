# V267 — utility history completion

Continuation of draft PR 116 on `support/v267-management-counters-20260913`.
Parent: `e7ebdab228559f731337cbc1e97d30e1404098a2`.

## Problem and changed behavior

The property utility page silently loaded only 100 entries, 100 meters and 200
properties. Its latest-reading summary sorted only those 100 entries by reading
date, so an older import containing the newest observed reading could be omitted.

- History now provides newer/older navigation in pages of 50, with an extra row
  to determine whether an older page exists. All reads are explicitly scoped by
  workspace, property and meter. The ordering is recorded timestamp then unique
  ID, both descending, so equal import timestamps have deterministic order.
- Latest dated reading is requested separately across the selected meter's
  history. It is ordered by observed date, recorded timestamp and ID. Missing
  dates and absent readings never produce invented values; a documented zero
  reading remains valid.
- Properties and meters load in batches of 200 until the last batch, removing
  their old silent cutoffs. Stable ID ordering breaks name/kind ties.
- Changing the meter/property, refreshing, or completing a save starts at page
  one. History and private attachment URLs clear before loading. Failed meter
  loads also clear the previous meter selection. A closed dialog or changed
  selection cannot display a late result.
- The six new interface messages include English, Hindi, Urdu and Malayalam
  translations. Existing Arabic interface and stored record text are retained.

History navigation is a live offset view, not a transactional database snapshot.
If another operator imports entries while browsing, refresh to restart at the
newest page. No schema, hosted database, ministry/payment integration, Production
deployment, domain, protection setting or release gate is changed by this work.

## Local verification

80 tests passed:

```sh
node --test tests/v267-utility-history-runtime.test.mjs tests/v267-unit-meter-runtime.test.mjs tests/payment-proof.test.mjs tests/v267-locale.test.mjs tests/v267-management-counters.test.mjs tests/v267-management-counters-runtime.test.mjs tests/v267-kpi-dashboard.test.cjs tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs tests/v267-workspace-controls.test.cjs tests/v267-workspace-features.test.cjs
```

The six new runtime tests mount the actual dialog/page and exercise 121 records
with equal timestamps, a latest reading outside the first 100 records, explicit
cross-workspace/property/meter exclusions, exactly 50 rows, missing dates, 205
properties and meters, failed page/latest/meter requests, retry and closing
during an outstanding load. Reads use a deterministic fake query transport;
these tests do not prove hosted RLS or authenticated browser behavior.

The previous Preview was opened in the cloud browser and displayed the AQARI
V267 login screen. Authenticated utility/KPI screens and real iPhone/iPad flows
still need their practical acceptance. All 155 release requirements remain
subject to their recorded gates. This continuation does not claim full release
acceptance or authorize a merge.
