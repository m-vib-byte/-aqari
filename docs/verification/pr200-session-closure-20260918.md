# PR 200 closure investigation — 2026-09-18

Base: b42d0ca62a54329eff95636a7788d8cf368e1d21. This is a repair checkpoint, not a release approval or delivery candidate.

## Observed session blockage

- The existing QA browser reproduced a locked app at `data-auth-phase=error`, `data-auth-stage=verify-user`, with the Arabic message claiming that the account was inactive in the workspace.
- One visible retry remained blocked at user verification. This happens before the workspace snapshot request.
- Source inspection found that HTTP 401 and 403 startup errors shared workspace wording, and the login bridge classified any workspace wording as inactive membership. Network/server errors containing that wording were also misclassified.
- Read-only aggregate checks of the isolated Supabase branch found one active general-manager membership and zero auth sessions. The live browser configuration could not be independently read, so these database aggregates do not establish the live failure's cause. No credentials, tokens, session secrets, or personal audit payloads were read; no data, memberships, RLS, or session records were changed.
- A secure browser credential request returned submitted. Subsequent visible checks showed the ordinary login gate and its prompt to enter email/password. There was no positive signed-in signal. Do not count this as successful login, or infer that the secure form did not receive input.

## Implemented

- Distinguish session-expiry, temporary server/network failure, and access-verification failure before interpreting workspace wording.
- A forbidden response no longer asserts an inactive-account diagnosis without evidence.
- Translate all resulting session/connectivity/access messages into English, Hindi, Urdu and Malayalam, retaining Arabic and correct direction.
- Authorization, token persistence, refresh behavior, account roles and database policy are unchanged. This fixes misleading presentation, not the unexplained session loss.

## Verification

22 tests passed across `v267-auth-error-classification`, `v266-startup-snapshot`, `v267-app-login-locale` and `v267-visible-locale-integration`. They cover error precedence, login-language rendering and credential isolation, rejection after user/role/workspace/membership changes, and mandatory post-read server confirmation. These tests do not replace authenticated live acceptance.

GitHub run 35339253183/job 105581148796 was rechecked: failure, no steps, no log URL. Existing repository evidence records the owner-provided Actions-budget annotation. The connected API cannot read billing/runner allocation evidence directly. No application or workflow code was changed to address a job that never executed.

## Delivery gates still open

Session stability and complete authenticated interface/save/readback/role coverage are unverified. The previously observed Arabic operational-property workspace in English remains open. Final reference-design matching across all pages and portals is incomplete. The available cloud browser does not expose device emulation; actual iPhone/iPad checks have not been performed. No zero-untranslated-UI count or 176-item completion claim is justified.

No production promotion or merge. `myaqari.com` remains the sole final owner trial URL. Promote only after the required gates pass, then verify the same tested SHA and obtain the owner's personal approval.
