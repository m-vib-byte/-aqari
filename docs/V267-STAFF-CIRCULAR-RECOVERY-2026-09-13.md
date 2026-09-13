# V267 staff circular draft and verification recovery

Preview continuation of draft PR 116 from
`1f68b1b138749bd5c7a3c96efaa4b99b204a467e`.

## Reproduced defects

Four new runtime cases failed against the preceding source:

- Opening a new or existing circular replaced unsaved text and recipients.
- Verifying a saved operation after an interrupted response discarded newer
  edits, including when the user chose refresh instead of retry.
- Archive success used only the current record, without checking the recorded
  reason in the immutable version.
- Refresh left obsolete recipient choices in the editor and omitted newly
  available employees.

## Changes

The editor tracks its raw title, text, date and selected recipients. Opening a
replacement draft and unrelated publish/archive operations retain dirty input.
A recovered save closes only an unchanged editor; newer edits remain and use
that verified revision on their next explicit save. Exact original retries
continue to use the existing server idempotency contract. Refresh performs
readback without resending a mutation.

Publication verification checks the published timestamp and revision. Archive
verification additionally reads history and matches the circular, revision,
action, reason and complete content snapshot before reporting success.

Recipient choices refresh with the saved staff list while retaining selected
employees. A removed employee remains visibly selected and unavailable, with an
explicit removal control. Saving is blocked until the recipient selection is
valid; the application does not silently publish to a reduced audience.

Old list/history content is cleared before a new read. Dialog disposal clears
the editor, baseline, pending request and cached private records. The source is
included in the staging inventory/syntax verification gate. The existing CI
workflow already runs the expanded runtime suite.

## Verification and limits

43 focused local tests passed across staff circulars, property notices, staff
access, workspace feature discovery and shared dialog/session boundaries. The
11 staff circular tests cover manager saves, independent publication, explicit
employee acknowledgement, exact retries, mismatched readback, dirty forms,
interrupted commit/read responses, archive history and changed recipients.
The recovery test covers both refresh and retry, and both lost commit replies
and failed readback. These tests use a synthetic RPC fixture.

The existing SQL RPC and current Supabase RPC documentation were reviewed; no
schema, hosted record, permission or authentication configuration was changed.
The list remains limited to the latest 100 records. No hosted write, publication,
archive or employee acknowledgement was exercised. Browser verification is
reported separately in PR 116; the browser session required renewed sign-in.

This is a Preview repair. Full 155-requirement acceptance remains HOLD, and
physical iPhone/iPad acceptance remains unproven.
