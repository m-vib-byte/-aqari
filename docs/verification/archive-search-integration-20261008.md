# Archive candidate with the published tenant directory — 8 October 2026

## Why this integration is needed

PR #466 published independent tenant/contract search on main at
`bcf7b0960fd801275f22280ea6bf7b0e60b5ee4d`. PR #464 still had archive head
`d3cc956c8af632d383bc021a2157de390bf0b29e`; GitHub reported it unmergeable
after publication because the file inventory changed in both branches.

This candidate combines those exact sources. It preserves archive behavior,
SQL and gateway authorization, adds the published directory/search/timeline
changes, keeps both sets of runtime checks, and resolves the inventory using
the actual combined file bytes. No new product behavior is introduced here.

## Local evidence

- The reconstructed archive source tree exactly matched
  `a92fd786ba51ed4593a13f3edab8439eda39df21` before integration.
- The directory source tree exactly matched the published main tree
  `40c467faf6d2515e3b58974a6b26ae2f1553c907`.
- `node scripts/test-release-regressions.mjs`: 2,785 passed, zero failed/skipped.
- `python -m unittest discover -s tests -p '*_test.py'`: 225 passed, using
  an isolated environment with the repository's pinned requirements.
- `npm test --prefix supabase/functions/aqari-execution-archive`: 26 passed,
  zero failed/skipped, after `npm ci --ignore-scripts --no-audit --no-fund`.
- `npm run check` and `git diff --check` passed. Changed inventory entries
  match their actual SHA-256 and byte lengths.
- Apart from workflow/inventory metadata, archive-specific source bytes are
  unchanged from d3cc956c. No SQL or live business records were written.

The new commit and Preview URL are recorded in PR #464 and the execution
register after publication. CI results must be checked on that exact new head;
the previous candidates' green checks do not establish this candidate's result.

## Acceptance still open

This integration remains Preview-only. The signed-in hosted archive sequence
(prepare, finalize, reopen both contract PDFs and receipt, reject duplicate
settlement), signed-in directory search, owner devices and monthly day-25
report acceptance remain open. The hosted browser still refuses to resume
native credential state safely. Local/CI synthetic tests do not replace those
steps. No Production deployment, database activation, permission change or
business-record mutation is part of this integration.
