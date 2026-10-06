# Resume uncertain property creation without another write

Date: 6 October 2026 (Kuwait). Based on PR437 head
`18820ca298fac40ac5101f40e9b91cf194cb6392`.

## Failure and change

The onboarding manifest was retained before image preparation and the legacy
property write completed, but retries skipped creation whenever that manifest
existed. Image errors, failed initial reads, a lost save response, or failed
post-save identity reads could strand the dialog before master-data saving.

Preparation failures now clear the unsubmitted manifest so corrected form values
are captured on retry. Before a create is sent, the current cloud revision, legacy
name collisions and scoped typed external-reference collisions are checked. A
random request marker is saved inside the existing presentation metadata, and the
attempt is remembered before sending. Form fields and owner-row controls are
locked; the action becomes “التحقق ومتابعة الملف”.

After a send, retries only read. Recovery requires a later cloud revision, exactly
one unchanged property row including its marker, and exactly one typed property
with the expected workspace, name, external reference, nonempty ID and matching
source row. Both array metadata and the existing `source_record` wrapper are
supported; JSONB object key ordering is ignored. Uploads and the master save remain
blocked until this identity is confirmed. Session checks remain in place.

## Verification

- 19 tests execute the real creation and orchestration functions with controlled
  transport faults. Against the unchanged PR437 source: **5 passed / 14 failed**.
- After the change: **132 passed / 0 failed** in the combined eight-file suite.
- Tests cover failed image preparation and initial read, lost create response,
  failed cloud/typed readback, uncommitted writes, pre-existing identities,
  missing marker, changed/duplicate rows, stale revision, wrong workspace/reference,
  missing ID, mismatched typed source, metadata wrappers and revoked sessions.
- The eight-file suite is included in Runtime contracts CI.
- `verify-staging-runtime.mjs` and `git diff --check` passed.
- Read-only queries against isolated Preview `ofgmcsmxmdswlovsckqs` confirmed
  metadata shapes (4 array / 3 object records) and authenticated SELECT access to
  all five queried columns. This is not authenticated RLS end-to-end acceptance.
- Source projection contract inspected in
  `staging-database/sql/restored-property-identity.sql`; no SQL was changed.

## Boundaries

No hosted property was created and no business records, permissions, migrations
or production release were changed. This is dialog-scoped recovery, not a durable
cross-reload idempotent backend API or an atomic concurrency guarantee. A missing,
changed, removed-marker or ambiguous record stays unconfirmed and is never blindly
resent. Preflight collision checks do not replace a transaction-level uniqueness
contract. Hosted end-to-end acceptance and physical-device acceptance remain open.
Preserve PR423's separately published optional completeness-service behavior when
integrating the stack. Requirement counts remain 16 complete / 104 partial / 154
needing verification.
