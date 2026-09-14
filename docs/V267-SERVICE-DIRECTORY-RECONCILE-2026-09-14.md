# V267 service directory reconciliation — 2026-09-14

Scope: Preview-only reconciliation on top of PR #158. No merge to `main`, no Production deployment, no `myaqari.com` or V266 change.

## Reconciled support work

This slice ports the non-conflicting service-directory polish from the current support branch while preserving the newer release-stack document upload/scan shortcut.

- Keeps all original service controls and authorization as the execution source.
- Adds compact service/section counts, explicit expand/collapse control and five-language guidance.
- Keeps unavailable Preview entries visible but non-executable; stale shortcuts cannot execute after logout, account/workspace replacement or home replacement.
- Preserves the scoped document upload/scan shortcut, its multilingual search terms and its hidden/disabled/revoked guards.
- Keeps mobile document shortcut layout and combines it with the newer white/gold directory layout.
- Treats `service-directory.js` as a bounded support overlay rather than rewriting historical candidate inventory.

## Verification contract

`tests/v267-service-directory.test.mjs` now covers both the support polish and the preserved document shortcut, including permissions, stale handlers, search, five locales, expand/collapse state and the narrow-screen CSS contract. The Vercel Preview build runs this suite explicitly.

This evidence does not close hosted-account acceptance, physical iPhone/iPad acceptance, the full 155-item matrix, backup/restore/rollback, or same-SHA hosted CI. Release Gate remains HOLD until those requirements have independent evidence and the owner later approves the exact unchanged release SHA.
