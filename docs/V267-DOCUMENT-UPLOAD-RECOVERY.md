# Document upload recovery — 9 September 2026

Base: `31bb256c83a0076c7e7d99d56d7fece400049e99`, PR #70. This is a
V267 preview repair. The eight workflows passed on that baseline; results for
the resulting repair commit are recorded separately in the PR.

## Confirmed defects and changes

- The scanner marked an upload as attempted before the request completed. If
  the request never reached storage, subsequent clicks only retried GET and
  could not upload the missing file. It now reads the same reserved path first;
  a 404 permits one insert-only upload on the next explicit attempt.
- Contract and employee uploads accepted an object-conflict response without
  reading and matching the original file bytes. The shared verifier requires
  matching size and SHA-256 before finalization. Legacy 400 and current 409
  conflict responses alone never establish success. Originals are not
  overwritten; the existing `x-upsert: false` storage boundary is retained.
- A lost response after storage accepts the file can be recovered by reading
  it, without another upload. A denied or unavailable reread never starts
  another upload. Session checks surround asynchronous reads and hashing.
- Scanner, signed contracts, employee/payroll documents, and utility payment
  proofs use this verifier. Contract finalization now includes the verified
  checksum and confirms the saved document ID, author, type and contract.
  Employee uploads verify the employee/payroll binding and ready document after
  finalization. Utility proof readback must match the reserved document ID.
- Changing an employee document's type after an interrupted upload allocates
  a new reservation instead of reusing an incompatible ID. Choosing another
  signed contract or payroll file clears the previous review attestations.
- Maintenance read denial during post-save verification now clears private
  rows and drafts, just as a denied list refresh does. A transient 503 preserves
  drafts and keeps the uncertain save locked.

## Verification

- 659 local Node tests passed with zero failures or skips, including 22 added
  regressions for storage recovery, caller integration and maintenance readback.
- Browser CI now exercises a scanner upload that never reached storage, denied
  reread, recovery using the same reservation and a lost successful response.
  The five-language maintenance flow also checks revoked read access during
  save confirmation. Both browser engines and all three existing viewport sizes
  retain their prior assertions.
- Release inventory, syntax/integrity checks and the existing release checks
  are run before pushing. No workflow is disabled or weakened.

No hosted schema, data, account, storage object, production or domain mutation
is part of this repair. Read-only hosted checks still found zero Auth users and
zero memberships in the isolated project `ofgmcsmxmdswlovsckqs`. Real-account
activation, actual hosted upload acceptance, physical-device tests and the other
requirements remain open. Automated fixtures are not physical iPhone/iPad or
real-account evidence.

The provider's documented object-conflict and insert-only behavior was checked
against [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
and [Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes).
