# V267 long dialogs and interrupted notice operations

Preview continuation of draft PR 116 from
`9fa6be05c890fe5093894c3f166b075bfe66f20c`.

## Reproduced defects

- In the authenticated utility dialog, opening the unit-reading section scrolled
  the dialog by 605 pixels. The close control moved to -576 pixels above the
  viewport. Request feedback and the title also left view while completing a
  long form. The preceding fixed-position repair kept the dialog itself in the
  viewport but did not keep its controls visible during internal scrolling.
- Two new notice tests failed against the existing source. A committed draft
  whose response was lost was sent again with the old revision. Refresh did
  not reconcile that save or update the editor's revision for new edits.

## Changes

- Shared screen dialogs use three grid rows: title/close, live feedback and a
  scrollable content body. Short dialogs remain content-sized. Close and status
  are outside the scrolling form. Extremely long feedback has its own bounded
  scroll region. Printing is unchanged.
- Closing restores focus to the original connected control without scrolling
  the underlying page. The existing DOM child order, native modal, Escape,
  request cancellation and synchronous private-data cleanup are preserved.
- Notices retain an uncertain operation's ID, revision, action and exact
  submitted values. Refresh/retry checks saved records before further writes.
  Matching requires the expected next revision, status and content. Archive
  confirmation additionally checks the immutable version and recorded reason.
- Reconciliation preserves edits made after an interrupted save and advances
  the editor to the verified saved revision. New text is saved only by a later
  explicit save. No automatic publish, archive or acknowledgement is added.
- Opening a different draft and unrelated publish/archive actions are blocked
  while there are unsaved edits. Pending operations retain their form instead
  of silently discarding it. Known server rejections allow correction; unknown
  or mismatched outcomes remain pending for verification rather than being
  replayed blindly. The existing list is limited to its latest 100 records;
  absence from that list is not treated as proof that a write did not commit.
- Refresh removes old displayed notice/history rows before reading. Disposal
  clears drafts, cached records and pending operation metadata.

## Local verification

34 tests passed:

```sh
node --test tests/v267-property-notices.test.cjs tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs tests/v267-contract-workspace-runtime.test.mjs tests/v267-utility-history-runtime.test.mjs tests/v267-management-counters-runtime.test.mjs
```

The ten notice cases include lost commit responses, failed readback, edited
draft recovery, independent publishing, archive reason mismatch, uncertain
outcomes, known rejection recovery and literal saved text. Existing integrated
contract, meter, KPI and session tests remain passing. Notice transport uses a
synthetic server fixture; no hosted records are created, published or archived
by these tests. The initial navigation/property/report/readiness check also
passed 28 tests before this implementation.

This is a Preview repair. No database migration, Production mutation or full
155-requirement acceptance is claimed. Physical iPhone/iPad acceptance remains
unproven; browser checks must be reported separately.
