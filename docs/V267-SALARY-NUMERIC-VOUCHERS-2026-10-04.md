# Salary voucher numbering

New salary vouchers use digits only, padded to at least four digits (0001, 0002,
9999, 10000). Issuance continues the existing global salary sequence; it does not
restart at 1, create a separate yearly sequence, or promise gapless numbering.
Existing issued/paid vouchers and their archived documents retain their numbers.

The migration replaces exactly one known expression in the current
`public.aqari_hr(uuid,text,jsonb)` definition. It fails if that expression is
missing or ambiguous and is safe to reapply. It preserves all other function
text, grants, row locks, revisions, approval and signed-document gates. No table
data or sequence state is changed during installation.

Validation: `node staging-database/local-test/run-salary-numeric-vouchers.mjs`.
This reproduces the old numbering failure, runs the original and numeric salary
lifecycle suites, and verifies two approvals, scope isolation, signed-document
requirements, replay refusal, unchanged historical rows, unchanged sequence
state during migration, unchanged function ACL, and single sequence consumption.
Boundaries: 1, 2, 9999, 10000, 1000000, and 9223372036854775806.
All fixture records and boundary sequence changes are confined to in-memory
PostgreSQL. Production verification must not issue a synthetic salary.

Rollback, if needed: replace the new numbering expression with the exact old
expression using the same fail-closed guard. Do not reset the sequence or rewrite
issued numeric vouchers. This change does not resolve other document counters or
the unconfirmed iPhone PDF upload incident.

## Corrected vouchers

The follow-up migration also replaces the correction suffix (for example -C2)
with a fresh number from the same salary sequence. It preserves the old voucher
number and snapshot, the replacement link and separate version field. Existing
corrections retain their historical identifiers. Exporting an existing voucher
does not allocate a new number.

Run `node staging-database/local-test/run-salary-numeric-corrections.mjs` for the
full isolated HR lifecycle with real pgcrypto hashing. It first reproduces the
suffix defect, then tests numeric correction, old-number/snapshot retention,
version and replacement linkage, export retry, correction retry rejection,
manager-only access, invalid-total rejection, month close and immutable history.
The pgcrypto option affects only the disposable test runtime.
