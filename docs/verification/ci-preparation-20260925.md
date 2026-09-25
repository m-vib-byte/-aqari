# PR #301 CI preparation repair — 25 September 2026

## Reproduced and corrected

Source baseline: `eab0a8b94c0577a9420adc10dc3b569148b8a3a1`, tree `1fe14aa348efb2ca420b6a59a00810183e944446`.
All 1,199 repository files were reconstructed and checked against Git blob hashes before testing. No mismatch.

1. Running the complete Node suite on the raw checkout produced 2,140 passes and 18 failures. The failed navigation, ownership, service-icon and inline-style assertions require the existing build preparation. Running the normal Vercel build first yielded 2,158 passes.
2. `scripts/test-release-regressions.mjs` now copies the checkout to a temporary directory, runs the existing style synchronization and ownership/navigation installer, then runs every selected test. Nonzero exits propagate; cleanup always runs. It does not install packages or contact a database. Source files are preserved byte for byte.
3. Release gate, release verification and the runtime-contract batch now use that entry point. The source identity test still requires verification before tests and before source export. No test or required check was disabled.
4. Regenerated nine rollback-only hosted SQL fixtures and their manifest from the existing source tests. Their positive MFA fixtures had become stale. The generator check and six regression tests pass; authentication guards are unchanged.
5. The isolated financial-close regression was failing during fixture setup because newer payment validation requires matching method/reference metadata. Its four synthetic payments now supply matching bank references in both stored record and receipt. Both historical cancellation defects are reproduced, then the repair and retry/upgrade cases pass. No business SQL migration was changed.

## Verification

- Node 22.23.3: 2,158 complete regression tests passed, zero failures/skips/cancellations (plus the installer’s 29 preparation tests).
- Original Node 24.19.0 baseline after the existing build: 2,158 passed.
- Python suite: 165 passed on the baseline; application Python was unchanged.
- Existing PGlite SQL completion gate: 70 test-file executions passed in local memory after the fixture repair. No hosted database connection.
- Financial-close regression: both prior defects reproduced; current repair and upgrade from previous repair passed, including repeated application.
- Hosted SQL generator: all nine SQL files and manifest match; 6 generator tests passed.
- Nine existing package/release self-checks passed on the source baseline.
- The prepared test runner left every input source file unchanged.

Commands:

```sh
node scripts/test-release-regressions.mjs
npm ci --prefix staging-database/local-test --ignore-scripts --no-audit --no-fund
npm run test:completion --prefix staging-database/local-test
node scripts/verify-financial-close-regression.mjs
python staging-database/hosted-test/generate-completion.py --check
python staging-database/hosted-test/test-generate-completion.py
```

## Remaining gate and verified access limits

This repair resolves reproducible CI preparation/test-fixture failures and provides a local alternative. It does not prove that GitHub has resumed allocating runners. The latest inspected release run `36075849067`, attempt 4, still failed before any step. The checks contain annotations, but the connector does not expose the annotation endpoint and the browser is not signed into GitHub. No billing cause has been established.

The existing acceptance deployment `dpl_DnovUW8NewNMfTHbzYxiE7xyZUnb`, source `2773d3eb652b6e1b7a40dd3b5776c0d640a339ab`, is READY. Its build script already emits staging configuration on the acceptance branch. The protected deployed configuration request still redirects to Vercel SSO, so authenticated browser acceptance remains unproven. Read-only Supabase inspection confirmed the seven HR lifecycle tables in the **private** schema and `public.aqari_hr_cycle` in `djkpkkgoibruaezdrchb`.

No production deployment, main merge, PR #301 merge, database migration, billing change, or hosted data mutation was performed. Full backup/isolated restore and device acceptance remain open; see #197. These results do not close the production release gate.

## Execution log digests

```json
[
  {
    "log": "node-fixed-tests.log",
    "bytes": 538299,
    "sha256": "4bf01adce2c2081c929690162b32c641b92fcb875b40c1e1ac0923ff4988f366"
  },
  {
    "log": "python-tests.log",
    "bytes": 28255,
    "sha256": "1546d4404b4e8b893d17f7a8f246e0d47924e83edcf1b7f05d0b66a6e260e90a"
  },
  {
    "log": "sql-fixed-existing.log",
    "bytes": 19075,
    "sha256": "6dd11cb06f4b47a08e092681c79d2c9e6ce58f335cabd2f2b27b41bf5849d696"
  },
  {
    "log": "sql-close-fixed.log",
    "bytes": 7663,
    "sha256": "225d8eca1a449bc842273cec848ba97931a704382ecc9435270408e052dd6470"
  },
  {
    "log": "source-verification.json",
    "bytes": 157,
    "sha256": "b31cb8083e2929d784a428443eb1e97012337e6c5f6b1a90790ce0c0ba009732"
  }
]
```
