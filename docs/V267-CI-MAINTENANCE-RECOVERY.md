# V267 CI and maintenance access recovery — 9 September 2026

This repair is based on development commit
`42131968ac45de56ad183a8d1c3d826a3dbd80d6` in PR #70. The separate test database
configuration and earlier permission repairs are preserved. No hosted database
write, account creation, production merge or domain change is part of this pass.

Concurrent test corrections through `a3ec4bd3e3628dafe15f9e9547a5d48fcc795b77`
are incorporated. Their draft-preservation scenario is tested with a temporary
503 service failure; an explicit 403 read denial still removes private data.

## Failure reproduced by CI

GitHub-hosted runners are allocating again. Seven workflows passed on the
baseline; Authenticated home regression run `34392070495`, job `102606208140`,
executed its tests and failed in `verifyServiceDesk` at line 186. It waited for
the retired English text `Records loaded from the independent preview database.`
in all six Chromium/WebKit and phone/tablet/desktop configurations.

The test now waits for the current translated maintenance-read completion
message. It also verifies the explicit reload required after an uncertain write:
ordinary refresh preserves the draft and keeps save locked, while discarding the
local draft rereads the saved request without issuing another write. No test or
workflow was disabled, skipped or converted to an unconditional success.

## Preserve drafts during outages; clear data on denied access

The preceding draft-preservation change retained the old maintenance view after
every failed read, including permission denial. That could leave previously
loaded private data visible after access was revoked.

The desk now clears visible rows, retained drafts and pagination on HTTP 401/403,
SQL permission denial, an explicit access-denied error or a changed bound session.
A later authorized read cannot revive the discarded private draft. Temporary
network/service errors still preserve the current view and unsaved fields.

The session adapter retains the authoritative HTTP status alongside the original
database error code. It does not modify the SDK's error object, and the existing
safe-error mapper still prevents raw provider messages from reaching the UI.

The browser fixture now includes HTTP status, like a real SDK response. Its
maintenance flow exercises a temporary 503 outage and recovery, validates input,
saves and rereads the request, blocks uncertain retries, explicitly reloads the
saved state, and finally verifies that a denied read removes previous requests.
The same assertions run in all five interface languages and six browser/viewport
combinations. Existing document, tenant, scanner and access assertions remain.

## Evidence and limits

- 637 local Node tests passed, zero failures, cancellations or skips. Four new
  regressions cover denied reads and recovery, service outages, session loss,
  and preservation of authoritative HTTP status without exposing provider text.
- Source syntax, release inventory and the existing release checks are verified
  before pushing. CI results for the resulting commit are recorded in PR #70.
- Earlier green runs and local tests do not replace the new commit's browser
  checks. Synthetic browser tests are not physical iPhone/iPad or real-account
  acceptance. Remaining requirements and final release approval stay open.

The reason GitHub stopped refusing runner allocation is not established by these
results; successful test execution is the observed change. No subscription,
spend-cap or repository-visibility setting was changed by this repair.
