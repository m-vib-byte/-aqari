# Current hosted acceptance fixtures — 2026-10-05 Kuwait

The older `completion/` scripts are reproducible tests of the earlier local
schema. Eight of nine could not reach their assertions on the current isolated
hosted schema: their fixtures omitted required maintenance categories, before/
after evidence, receipt transaction metadata, imported-contract provenance,
or app-state rows for synthetic secondary workspaces.

`../current-fixtures.py` produces these current-schema copies from those same
sources. It preserves the assertions, negative cases, MFA checks and rollback
boundaries. It supplies mandatory synthetic inputs rather than disabling
triggers or changing any application function. The original fixtures and
their historical evidence remain unchanged. Run the generator with `--check`
to verify exact source/fixture hashes without writing files.

All nine scenarios passed on isolated Preview `ofgmcsmxmdswlovsckqs` during
this review. Each complete SQL file was executed as one transaction ending in
ROLLBACK. The vendor scenario passed unmodified; the eight adjusted scenarios
passed with the current fixtures. No Production mutation, payment, notification
delivery or schema change was performed. Sequence values in Preview may advance
even though test rows roll back. Do not reset sequences to hide these gaps.

These are database acceptance scenarios with synthetic SQL identities and
Storage metadata. They do not prove a real Auth sign-in/MFA challenge, transfer
of file bytes, real-provider delivery, browser interaction or physical devices.
Local regression results alone were insufficient to reveal this fixture drift.

Run only on the independently verified isolated Preview project, never
Production or the recovery clone. Keep BEGIN/ROLLBACK and all assertion blocks
together. Do not execute extracted setup statements. No schema repair is needed
to make these fixtures pass.
