# V267 Preview reconciliation — expense, staff access and employee directory

Date: 13 Sep 2026 (Kuwait time)

This Preview-only reconciliation starts from the unit-handover integrity head `a606c49d04d4f053d8efa4796e0d787426b57e93` and ports the latest operational recovery source from PR #116 head `a84eb607d0dc4d280b652897feabf377afc8e12d` without touching `main`, Production, `myaqari.com`, historical V266, or Production business data.

## Reconciled changes

- Financial register: Arabic-aware combined search, property/state filters, 20-row pages and interrupted-save recovery that preserves newer edits and advances from verified revision state.
- Staff access: recovery preserves newer permission edits, keeps unavailable selected properties visible until explicit removal and retains replay guards on uncertain outcomes.
- Employee directory: Arabic-name normalization, Arabic/Persian digit search, phone-separator normalization, explicit display fallbacks and private-state cleanup on disposal.
- Pearl/gold semantic presentation additions used by these views are carried with the same source snapshot.

## Exact-source integrity

The historical `FILE_INVENTORY.json` remains untouched. `docs/V267-R17-LATEST-OPS-OVERLAY.json` pins the four reconciled runtime/presentation files to their exact byte lengths and SHA-256 digests from source commit `a84eb607d0dc4d280b652897feabf377afc8e12d`. `scripts/verify-staging-runtime.mjs` verifies those exact bytes and JavaScript syntax before the Preview build runs the focused regression suites.

Vercel build also executes:

- `tests/v267-financial-register.test.cjs`
- `tests/v267-staff-access.test.cjs`
- `tests/v267-employee-directory-runtime.test.cjs`

A dedicated read-only GitHub workflow runs the same exact-overlay verification and tests when GitHub allocates a runner.

## Acceptance boundary

This closes programming/test reconciliation only. It does not claim 155/155 acceptance, same-SHA hosted CI success, hosted real-account write acceptance, physical iPhone/iPad acceptance, complete Database/Auth/Storage backup with attachment bytes, independent restore, transaction-preserving rollback rehearsal, correct Production configuration, final owner practical acceptance, or Production approval.

Owner governance dated 13 Sep 2026 Kuwait time controls. Preview/design/READY is not Production approval. No Production publication is authorized by this reconciliation.
