# V267 staff-access recovery and employee directory fixes

Preview continuation of draft PR 116 from
`940e119d82d075ac01ac66068bb3f4e5e9e6feaa`.

## Reproduced defects and changes

Four staff-access runtime cases failed before the fix: verified recovery reset
newer permission edits; refresh dropped unavailable selected properties from
a draft or a saved assignment; and unmatched readback cleared the duplicate
save guard.

Recovery now preserves newer role, property, activation and raw reason edits,
while advancing the next expected revision only after the previous operation
matches its saved record. Ordinary refresh retains the original revision.
Unavailable selected properties stay visible with generic labels and block
saving until explicitly removed or made available by a later read. Unknown
unmatched outcomes remain pending; known precommit rejections permit correction.
Role ceilings, manager checks, explicit property selection and disposal cleanup
remain enforced. No account is granted or denied access by this code release.

Three employee-directory cases also failed before implementation: Arabic name
and phone searches missed existing entries, incomplete display profiles produced
undefined text, and closed dialogs retained cached directory content.

Search now normalizes Arabic/Persian digits, Arabic diacritics and letter forms;
phone searches also tolerate separators. Original displayed and saved values
are unchanged. Missing name/job/status display fields use explicit fallbacks.
Disposal clears the cached directory and dialog body, and a queued search cannot
restore private rows. Detail and editor paths retain their existing expectations
for valid server profiles.

## Verification

60 focused local tests passed:

```sh
node --test tests/v267-staff-access.test.cjs tests/v267-employee-directory-runtime.test.cjs tests/v267-payroll.test.mjs tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs tests/v267-financial-register.test.cjs
```

This includes 18 staff-access cases, three new directory cases and the existing
payroll, financial and shared-session regressions. The directory suite also
passed after adding the explicit Persian-digit assertion. Source/test changes
were independently reviewed; no blocking issue was found. The existing CI
workflow includes the new directory suite. No hosted CI pass is claimed.

## Hosted verification limit

The earlier financial screen's search/layout checks remain valid for the prior
Preview. The unfinished final draft observation was retried through the
supported browser API. The old tab timed out; a new tab was created and its
navigation completed, but DOM inspection returned a browser-recovery error and
subsequent tab discovery timed out. No new live UI pass, temporary-draft cleanup,
physical-device acceptance or hosted write is claimed.

Only source, tests, workflow and evidence documents changed. No hosted records,
SQL schema, accounts, permissions, Production aliases or security settings were
modified. This is a Preview release; all-155 acceptance remains HOLD. An
interrupted staff-access operation that never matches remains pending for
review rather than being silently replayed.
