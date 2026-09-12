# Preview completion acceptance — nine isolated transactions

These generated scripts are for the independently verified V267 preview project `ofgmcsmxmdswlovsckqs` after its completion migrations. The generator does not connect to a database. No hosted database operation was performed while creating this package.

Run each numbered `.sql` file **in full as one query**, including its `BEGIN` and `ROLLBACK`. Do not execute setup statements separately. Use `manifest.json` for the exact filenames, primary workspace IDs, source hashes and generated hashes.

Every test creates its own unique synthetic workspace and test accounts inside its transaction. None uses the user's `aqari-v267-staging` workspace. Secondary workspaces used for rejection scenarios are also synthetic and transactional. Direct UPDATE/DELETE statements, including negative permission tests, add an explicit synthetic workspace predicate; Storage mutations additionally restrict the path prefix. All numbered tests omit CREATE/ALTER/DROP/GRANT/REVOKE, committed setup, trigger changes and RLS disabling. Local helper functions have been expanded into ordinary expressions or anonymous DO blocks. Unit readiness is recorded through the existing authorized readiness RPC.

The `request.jwt.claim.sub` / `request.jwt.claims` values and `SET LOCAL ROLE authenticated` are synthetic SQL test identities. They exercise the database's identity/authorization predicates; they are **not an actual Supabase password sign-in, issued JWT, enrolled MFA factor or browser session**. A simulated `aal2` claim verifies the enforcement branch, not a real second-factor challenge. Separate real-account authentication and browser acceptance remain required.

`generate-completion.py` in the parent directory regenerates all nine scripts from the normal acceptance sources, validates the transaction boundaries and mutation scope, and records SHA-256 hashes. The scripts preserve the source acceptance/rejection cases rather than replacing them with schema-only checks.

From the repository root, run `python3 staging-database/hosted-test/generate-completion.py --check` to verify all nine saved SQL files and `manifest.json` against their current sources without writing any files. It exits with status 1 for missing or stale output. Run the same command without `--check` to regenerate. The CLI's read-only and stale-file checks are exercised by `python3 staging-database/hosted-test/test-generate-completion.py`.

## Verified locally

The full existing `test:completion` schema/test baseline, including `20260912164000_v267_private_rls_hardening.sql`, was restored in PGlite and then all nine generated files were appended. **All baseline steps and all nine generated tests passed; exit code 0.** These are SQL permission/metadata/ledger tests. Storage fixture records do not prove upload of actual bytes through hosted Supabase Storage; browser/file transport acceptance remains separate.

The final local run also includes the legacy vacating guard represented by the local-only `rating-vacating-history.sql` fixture, two applications of `vacating-release-legacy-compat.sql`, and `vacating_release_legacy_compat.sql` acceptance through the current `test:completion` command. That entire baseline and all nine final generated copies passed together. The fixture is never part of hosted execution; apply the actual compatibility migration there before rerunning the numbered tests. The rating test's issued historical record is synthetic input for rating calculations, not evidence that a real clearance certificate was issued.

No `local-test/fixtures/maintenance-attachment-storage.sql` is required or permitted on hosted Supabase: real Supabase already supplies its Storage columns, grants and RLS. That file is used only to model the service in the in-memory baseline. Apply the actual maintenance attachment migration before the hosted attachment test.

As with PostgreSQL rollback tests generally, row changes roll back but consumed identity/sequence values can advance. The tests do not reset sequences or rewrite existing data to hide such gaps.

## Excluded from hosted execution

- `tests/commercial_sales_vacating_upgrade.sql` depends on `local-test/fixtures/commercial-vacating-existing.sql`, which deliberately commits a pre-migration historical fixture. Keep this upgrade scenario in local memory.
- `tests/partner_shares_integrity.sql` depends on `local-test/fixtures/partner-shares-existing.sql`, which deliberately seeds pre-migration state and restores local catalog grants outside a rollback transaction. Keep this scenario in local memory.
- Do not run any `local-test/fixtures/*.sql` file against the hosted database as part of this package.

The full partner-share and legacy commercial-upgrade scenarios passed in the local baseline; this package does not misrepresent them as independent hosted acceptance.
