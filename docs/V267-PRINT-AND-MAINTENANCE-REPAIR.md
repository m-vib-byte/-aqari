# V267 contract printing and maintenance recovery — 9 September 2026

Release Gate remains **HOLD**. This repair incorporates remote development head
`fa8c865b8b501f5179a63bafab810c09a54ba0b0`, including its connection deadline and
contract-approval SQL guard. No production merge, domain change, hosted SQL write,
account creation or V266 modification was performed.

## Contract issuance

The contract workspace previously created a printable HTML file immediately,
even for a draft. The legacy copy viewer also accepted caller-supplied markup.
The new V267 contract entry points now share an issuance gate:

- Read the saved contract afresh through the authenticated state adapter when
  a copy is requested. The adapter revalidates server membership after the read;
  the gate also checks workspace, role and local authentication boundaries.
- Official issuance accepts only a single matching saved `v267-cloud` contract
  in `approved`, `signing` or `signed` state. Missing, duplicate, imported,
  cancelled, expired and unapproved records are rejected. Cached approval and
  caller-supplied HTML cannot authorize a copy through these entry points.
- Review markup is explicitly a draft, including its annex. Every draft article
  has prominent notices at its start and end and omits signature lines.
- One or two sets are generated from one saved revision, each containing the
  contract and annex. Private links are created only after verification and
  released on retry, record change or dialog disposal. Late results after
  closing a dialog do not create files.
- Existing unit/ledger entry points for new V267 contracts use the same gate.
  Historical imported-contract summaries and stored original documents retain
  their separate review paths; this does not certify every legacy document.

This is HTML issuance through the application, not a signed PDF or a new
server-side signing service. Approval is checked at issuance time; an exported
file is not remotely revocable. The server approval fixes remain reviewed SQL
for an isolated target and have not been installed on the shared hosted database.

## Maintenance updates

Refreshing the desk used to clear its list before the request completed and
discard edits on every successful refresh. Saving one request also erased local
changes to other requests.

The desk now replaces its list only after a successful read, preserves local
status/cost drafts across refreshes and pagination, and retains their original
revision. A newer server revision disables the stale save without overwriting
another employee's change. An explicit discard action reloads the stored request.
Saving and rereading one request preserves other pending drafts. Both update
and readback responses must identify the same request. Uncertain writes stay
locked, including across refreshes, until the stored request is reloaded through
the discard action. Closing the dialog clears retained private drafts.

The new desk messages are included in all five supported languages. The screen
no longer describes its connected database as independently isolated merely
because the project name includes Staging. This repair does not implement
maintenance images, supplier orders, expense posting or the scoped operational
projection needed by the new maintenance role.

## Verification

- **630 Node tests passed**, zero failures, cancellations or skips. This includes
  20 new regressions for print approval, draft marking, two complete sets,
  changed authentication, timeout, private-link lifecycle, legacy routing,
  failed maintenance refresh, stale revisions, uncertain writes and pagination.
- Three SQL suites passed in the isolated in-memory PostgreSQL runner: staff
  property scope, financial register and contract approval. All synthetic test
  transactions rolled back; no hosted database connection was made.
- Runtime CI includes both new test files. Critical runtime verification includes
  the maintenance desk and its translations, bringing coverage to 15 files.
- Package check, all 15 critical source hash/syntax checks, whitespace validation
  and all eight existing release self-checks passed. Local checks do not substitute for real-account browser tests,
  physical iPhone/iPad tests or final release acceptance.

Retrying the earlier Runtime run `34386184831` produced attempt 3, job
`102586686442`, with `steps=[]`, `runner_id=0` and an empty runner name. It failed
before executing tests. The remote `fa8c865` report records the same failure mode
on that newer baseline. The underlying provider cause is not established; no
check has been disabled or bypassed. CI on this repair's final commit must be
reviewed separately. Independent hosted integration remains open.
