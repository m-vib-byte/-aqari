# Onboarding attachment retry recovery — 2026-10-06

The onboarding dialog recreated `createOriginalDocumentUpload` whenever submission
resumed. A failure after reservation therefore discarded the known document ID and
the immutable object's verification state. Retrying could reserve a second document
instead of confirming the existing one.

The dialog now retains one lazily initialized uploader for its lifetime. Uploads
remain sequential: confirmed manifest entries are skipped, and the current pending
entry keeps its reservation and read-before-retry storage verifier. Master-data save
and completion remain blocked until every selected attachment passes authoritative
document and byte verification. No shared archive API or database change is needed.

## Evidence

- Ten runtime tests execute the actual onboarding state, attachment loop, assets
  mapping and submission function with the real original-document uploader and
  byte verifier. Only transport and later master-save/UI boundaries are mocked.
- Faults include storage failure before commit, failed storage readback, lost
  finalize response, failed document readback, wrong category, checksum or bytes,
  persistent mismatch, and revoked session. An empty manifest makes no archive call.
- The pre-fix source fails eight tests and passes two. The corrected source passes
  all ten. The related onboarding, owners, master-data and original-document suite
  passes 152 tests; the final revoked-session case also passes independently.
- Runtime inventory verification and `git diff --check` pass. CI runs the new suite.

## Scope and remaining acceptance

This is dialog-scoped recovery after a reservation response has supplied a known
document ID. It does not add durable recovery across dialog closure/reload or solve
a lost reservation response. It does not claim transaction-wide idempotency.
Transport fault tests are not hosted browser or physical-iPhone acceptance.
No hosted property or document was created, no business data or grants were changed,
and this follow-up does not release to production. Stack on PR438. Preserve the
separate PR423 optional-completeness-service behavior when integrating the stack.
