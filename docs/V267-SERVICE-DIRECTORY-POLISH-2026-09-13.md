# V267 service directory and shared dialog repair

Preview continuation of draft PR 116, parent
`f9bcefb5c4a7b1c5464abe0c486ca5317d3dc8b9`.

## Changes

- Repairs a reproduced failing regression: clicking an old shortcut after
  permission revocation denied execution but left the old shortcut in place.
  The directory now refreshes its availability immediately. Preview retains
  the entry with an unavailable state; normal mode removes it.
- Old shortcut handlers cannot execute after logout, workspace change or home
  replacement. Search cannot restore directory contents after logout. Native
  toggle events from detached sections cannot overwrite the current expansion.
- Six compact white/gold category cards replace the forced-open Preview list.
  All services remain discoverable in their categories, including unavailable
  Preview entries. A single control opens or collapses all sections. Search
  opens matching sections without overwriting the user's chosen expansion;
  changing workspace resets that choice.
- Shows service and section counts. The shortened Preview explanation appears
  once; search results and unavailable feedback use the existing live status.
  New controls and explanatory copy cover Arabic, English, Hindi, Urdu and
  Malayalam. No new service is represented as implemented by these counts.
- Pins all shared V267 dialogs to the viewport and reserves title space for
  the close control. This extends the earlier contract-only positioning repair
  to the common screen style. The print styles are unchanged.

## Verification

50 focused local tests pass, including all 14 service-directory cases and the
shared dialog/session controls:

```sh
node --test tests/v267-service-directory.test.mjs tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs tests/v267-workspace-controls.test.cjs
```

The new cases cover Preview discovery, unavailable service clicks, expansion,
search restoration, scope reset, stale callbacks and all five interface
languages. Existing authorization and dialog disposal tests remain passing.
These tests use synthetic DOM/transport fixtures; they are not physical-device
or full-release acceptance.

Before the change, authenticated browser inspection confirmed all six Preview
groups were forced open and repeated the same explanation. Opening the utility
dialog from a scrolled page used absolute positioning and reset the page scroll
to zero. No hosted records were created or modified during this inspection.

Publishing remains restricted to the existing support branch and Preview.
Full 155-requirement acceptance, device checks and Production promotion remain
subject to the existing release gates; no readiness status is upgraded here.

## Authenticated Preview verification

Implementation `96b9663ac9a42e0959a04a3cd712ef1309b52f2e` deployed READY as
`dpl_EAaqz4nADp2op9TNLM41u2NkqvR6`. On the stable support-branch alias, the
signed-in UI displayed 32 service entries in six initially collapsed sections.
Opening/collapsing all six worked. Searching for meters opened its single
matching section; an unmatched search showed the empty state, and clearing
search restored all six collapsed cards. The desktop viewport had no horizontal
overflow. Screenshots of the new workspace, utility dialog and KPI dialog were
visually reviewed.

Both dialogs used fixed positioning with bounds 12–924 in a 936-pixel-high
viewport; the close control remained visible at opening. KPI readback reported
successful loading of saved indicators and counters. The utility page truthfully
reported no confirmed meters for the selected property. No test records were
created or modified. Physical phones/tablets and internal-dialog scrolling are
not claimed as verified by these checks.

A final wording refinement places translated labels before numeric totals,
avoiding awkward singular/plural phrasing on one-result searches. It changes
no service behavior or permission checks.
