# Server access revocation repair — 9 September 2026

Base: `0a0f3bd51133f70e7cb2ac725ce54370b228ae50`, PR #70.

## Defect and repair

The shared protected dialog displayed a server authorization error while retaining
its previous private records and generated document URLs. A server-side property
or section revocation can precede any change in the locally cached membership.
For example, the employee detail view awaits its next authorized read before
replacing the previous employee/payroll data.

HTTP 401/403, PostgreSQL permission code 42501 and ACCESS_DENIED now synchronously
dispose the dialog. Existing cleanup removes the private DOM, revokes generated
download URLs and aborts pending requests. Temporary failures such as 503 retain
the open draft and permit a retry.

The new Node regression failed before the fix and passed afterward. The full
Node suite passed 661 tests with zero failures or skips. The browser scenario
adds a saved-document download followed by server denial with unchanged local
membership; it asserts DOM removal, URL revocation, no repeated upload and a fresh
authorized read after access returns. It runs inside the existing six
Chromium/WebKit and phone/tablet/desktop viewport cases. Current-commit CI is
recorded separately in PR #70; fixture browsers do not constitute physical-device
or real-account acceptance.

## Hosted database verification

Five transactional SQL suites passed on the independent hosted test branch
`ofgmcsmxmdswlovsckqs`: linked rental details, staff contract approval, rental
provisions, employee payroll and salary slips. They exercised contract/payment
save and readback, receipt linkage, immutable values, approval restrictions,
employee edits, audit, property isolation, payroll approval and bilingual slips.
These use synthetic identities and stored-file metadata, not real sign-in or
binary upload acceptance.

The payroll and salary-slip fixtures predated operational staff property scope.
Their setup now derives the workspace from the test manager and grants each
synthetic accountant the appropriate property through the existing manager RPC.
All original positive and negative assertions are preserved; no application
permission was widened. Both corrected files passed on the hosted test branch.
The legacy rental_transaction fixture still predates mandatory contract details
and the signature workflow; it was not changed or counted as passing evidence.

All fixture writes were rolled back. Before/after users, memberships, tenants,
leases, payments, employees, payrolls, storage objects and related fixture tables
remained empty; the original workspace/state and seed were preserved. PostgreSQL
sequences may advance during transactional tests.

## Open release conditions

No schema, live business data, production deployment or domain change is part of
this repair. The cloud browser connection timed out during both discovery and
the documented recovery attempt, so actual hosted sign-in and UI acceptance
remain unverified. The new isolated Auth instance has no real activated account.

The current Supabase connection does not expose backup/PITR inventory. No current
full backup or isolated restore has been verified; a schema-only development
branch is not a data restore. Real-account workflows, physical iPhone/iPad tests,
source-data reconciliation and the full backup/restore gate remain open.

Release status: HOLD. Successful CI alone does not authorize this candidate as
fully tested for production under the owner's requested acceptance conditions.
