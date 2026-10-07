# Read-only payroll reference review — 2026-10-07 Kuwait

Extends R04.07 after PR445 with an explicit review button in the employee file and
salary shortcut. It rereads the selected employee through the existing `aqari_hr`
get action, whose payroll and document arrays cover that employee's saved months.
It does not query another employee, create a salary, download a file, change an
amount, or add a database function or grant.

Only paid salaries are reviewed. Observations include missing vouchers, unknown
methods, missing cheque/transfer/KNET references, shared voucher numbers and exact
shared references within each method. A batch payment may legitimately share a
reference: the UI explicitly does not equate this with duplicate disbursement.
Cash may have no reference; drafts and issued-but-unpaid salaries are excluded.

A signed document satisfies this metadata review only when it belongs to the same
employee and payroll, has kind signed_salary and status ready, and all three stored
attestations (signature, fingerprint, stamp) are boolean true. This does not verify
file contents or the physical signature. Unavailable evidence is not called deleted.
Incomplete arrays, wrong employee identity or foreign payroll rows cannot produce a
clean report. Any subsequent HR request clears old review output before reading;
failure cannot leave an earlier report presented as current.

## Verification

- 45 tests passed across employee directory runtime, HR permission runtime,
  document upload pages and payroll domain suites.
- Seven new cases cover paid-state scope, cash/noncash methods, each signed-document
  requirement, exact shared identities, employee boundaries, explicit reread, failed
  review/refresh, incomplete responses and disposal. No financial writes occur.
- Tests execute the real page using DOM/RPC substitutes. The existing Vercel build
  already runs the employee-directory runtime suite.
- Runtime inventory and diff checks pass.

R04.07 remains partial: other ledgers, cross-employee review and hosted authenticated
UI/RLS plus physical-device acceptance remain. No production publication, business
data mutation, schema update or permission change was performed in this follow-up.
