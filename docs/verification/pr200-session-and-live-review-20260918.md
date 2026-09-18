# PR 200 authenticated review — 2026-09-18

Continues d5e338ad without reverting earlier work. This checkpoint builds on 9f80fa071929435c3e6bd8dd113529ad48322743. It is not a release approval. No merge or production promotion was performed.

## Session diagnosis and repair

Two different observations must not be conflated:

1. Earlier server session metadata identified Safari, whereas the connected QA browser is Chrome. A successful sign-in in the user's Safari does not establish a signed-in session in the connected browser. The user subsequently completed the secure sign-in request for the actual connected Chrome and the authenticated dashboard appeared.
2. On d5e338ad, an authenticated dashboard was followed by loss of server sessions, including the Chrome session. Thus browser mismatch alone does not explain all observed failures.

Source inspection reproduced a concrete logout path: the V75 timer reads a persisted activity timestamp, compares it with a 15-minute idle threshold, and invokes the bridge's legacy lock. Verified unlock had not reset the old V75/V119 clocks. The legacy lock called the default Supabase sign-out, whose scope is global. An idle browser could therefore revoke another active device's session. Official scope documentation: https://supabase.com/docs/reference/javascript/auth-signout (checked 2026-09-18).

Repairs:
- Reset both old activity clocks only after server-verified workspace activation. Actual inactivity still triggers the lock; no membership or permission check was relaxed.
- Pass local scope through the legacy idle/lock path to the adapter. The current session still signs out and clears its persisted authentication; another device is not targeted by that automatic lock. Explicit user logout retains its previous global scope.
- A mismatched identity cannot sign out a different active identity. Failed logout remains closed and does not report success.

The source/test-reproduced path explains a real defect, but there is no historical caller trace proving it caused every prior sign-out. Auth audit reads supplied no such trace. An old QA app tab was also closed before the successful retest. No token/session transfer, credential extraction, auth record editing or authorization bypass was used.

After the idle-clock repair, the connected Chrome session created at 15:55:22 UTC remained present at 16:22:44 UTC and supported repeated authenticated reloads, language changes, reads and a save/readback cycle. A separate Safari session created at 16:06:08 UTC coexisted. Later PR updates record further live observations; this is bounded evidence, not a guarantee of indefinite stability.

## Live record and navigation evidence

On e344fed3, the existing named acceptance property was edited through the actual UI: its originally empty address was temporarily set to `V267 readback e344fed3`, saved, independently read after a full reload, restored to empty, saved again, and independently verified empty after another reload. Property name, owner, unit count and income stayed unchanged. Ordinary save audit entries may remain. No real financial transaction, distribution, deletion or permission mutation was submitted.

Authenticated navigation exercised Properties, the property workspace, Units/readiness, Tenants, Contracts, Maintenance, Documents, Expenses, Staff/payroll, Reports, Owners/partners, General manager controls and Settings. Data reads included unit readiness, rental contracts, expense-period summary, staff directory, partner access settings, manager controls and reports. Reports returned two saved payments and KWD 200 for the selected payment month. This is general-manager read coverage, not all-role or all-form certification.

The shared properties/tenants list retained a stale Properties heading; that was corrected and Tenants was verified live. No white screen or horizontal overflow was observed in the checked Desktop views. Actual iPhone/iPad execution is unavailable in the connected browser capability set and has not been performed.

## Visible interface translations

Live inspection, rather than catalog completion alone, found missing property workspace and unit-tab text. Translation boundaries now cover the property overview, expanded financial metrics, unit directory, contract cards, collections, expenses and partner controls. Stored property/tenant/owner names, identifiers, personal details and user notes are explicitly protected. Generated note labels are separate from saved values. Dates, counts and KWD presentation retain their values and precision.

Reviewed source inventory at 9f80fa07: 3,403 unique classified visible source messages, 0 missing translated catalog values for English, Hindi, Urdu and Malayalam, with Arabic as the source language. Technical values and stored records remain excluded. This is NOT a claim of zero untranslated visible text throughout the running platform. Deep dialogs, generated documents, portals and all roles still require complete live coverage.

## Verification and release status

36 targeted Node tests pass across idle/session scope, startup authorization, auth errors, translation parameters, record preservation, property actions and shared-list headings. They include rejection after user/workspace/role/membership changes. Simulated multi-device sign-out tests are not two-device live certification. These local checks do not replace GitHub Actions or physical-device tests.

Latest checked e940c48c Runtime contracts run 35369016489, job 105678278303 failed with steps=null and logs_url=null. Existing repository evidence records the owner's Actions-budget annotation. The connector cannot independently inspect account billing. No application or workflow assertions were weakened to address infrastructure that never started testing.

Reference-derived dashboard structure is present and was inspected in an actual Desktop screenshot. Full reference matching on all pages and portals is not signed off. Full 176-item acceptance is not established. Complete live translation/role/device coverage and the GitHub gate remain open.

Do not promote this checkpoint. myaqari.com remains the sole final owner trial URL; publish only the same fully verified candidate, verify its SHA afterward, and retain the owner's personal test and explicit approval as the final acceptance gate.
