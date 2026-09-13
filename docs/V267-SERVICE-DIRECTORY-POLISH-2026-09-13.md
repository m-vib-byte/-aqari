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
