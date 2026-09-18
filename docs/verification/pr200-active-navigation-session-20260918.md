# PR 200: active navigation must not look idle

Base: `147130cf7580f771d99d7b031d27ce3abbb5c5a1`. All 1,044 repository blobs were matched to GitHub before this change. Continues the same PR and branch.

## Reproduced defect and repair

The V75 and V119 activity listeners ran on document during bubbling. Existing document capture navigation handlers call stopImmediatePropagation, so successful route clicks could never reach those listeners. A regression exercising the real unified navigation interceptor and the real V75 timer reproduced a lock after twenty minutes of repeated five-minute navigation intervals.

Both listeners now run in window capture, before the document route interceptors. Trusted pointer, touch, keyboard, wheel, input and change events update the existing clocks. Script-dispatched events do not prolong the session. The 15-minute inactivity threshold and current-device-only logout behavior remain unchanged. No authentication, authorization, database, production configuration or business-data change is included.

## Verification

- Before repair: six of eight new behavioral cases failed, including the active-navigation lock.
- After repair: all eight pass, including continued navigation, input methods, real inactivity and rejection of synthetic activity.
- Related startup, expiry diagnosis and independent-device logout regression: 54 passed.
- All three committed Vercel build-command stages succeeded locally, including their existing Python and security gates.
- Full generated-output Node suite: 1,655 passed, zero failed or skipped.
- Added the regression to the Vercel build and Runtime contracts workflow; no failing gate was disabled.

This establishes a specific reproducible idle-accounting defect. It does not attribute all prior server-session losses to this defect. Auth audit rows after 17:30 UTC were absent in the configured QA project; no initiator for the earlier loss of both browser sessions was established.

## Open delivery gates

Hosted verification of this exact continuation, final save/readback and role/language checks, and physical iPhone/iPad acceptance remain open. GitHub run 35380707645/job 105715928394 on the base failed with steps=[], runner_id=0. The connected GitHub browser visibly says the account does not support password sign-in; that method was not repeated. No current billing diagnosis is claimed. No production publication was performed.
