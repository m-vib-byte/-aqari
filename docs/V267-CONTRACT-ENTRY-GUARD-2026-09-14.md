# V267 contract-entry guard — 2026-09-14

Scope: Preview/support only, replayed linearly on the latest observed PR #160 head `293e6e84826a1a076af513e0f4cc67439c2d003c`. Earlier drafts based on older PR #160 heads were closed without merge rather than forcing conflicts. Concurrent contract-foundation and isolated-domain-trial preparation already present at this head is preserved unchanged; this branch does not activate the trial target or change `myaqari.com`.

## Change

- Canonicalize contract-route intent and drop unknown route fields.
- Reject conflicting create/open/renew intents instead of choosing one implicitly.
- Reject control characters, oversized references and non-scalar contract/renewal/property references.
- Permit an initial property hint only for explicit new-contract creation.
- New-contract entry performs a fresh `aqari_workspace_access` read before and after lazy-loading the contract foundation.
- The guard confirms the same workspace/user/role and requires both `contracts.read` and `contracts.write` before opening the creation foundation.
- The temporary guard session is always closed in `finally`; the contract foundation keeps its own separately bound dialog session.
- Saved-contract and renewal paths continue through the existing guarded workspace opener.

## Verification contract

`tests/v267-contract-entry-routing.test.mjs` verifies canonical intent handling, fail-closed conflicts/unsafe hints, legacy-route behavior outside a browser, and the source contract for the double access read around lazy foundation loading. `scripts/verify-staging-runtime.mjs` syntax-checks the new guard as a bounded support overlay. The exact Vercel Preview build includes this focused suite through `scripts/build-vercel.mjs`; deployment/build results must be recorded separately and must not be treated as hosted-account acceptance.

## Release limits

Owner governance dated 13 Sep 2026 Kuwait time controls. This change does not satisfy 155/155, same-SHA GitHub CI, hosted real-account acceptance, physical iPhone/iPad acceptance, complete Database/Auth/Storage-byte backup, independent restore, transaction-preserving rollback, Production configuration, final owner practical testing, or later explicit Production approval of the exact candidate. Do not merge to `main`, deploy Production, change `myaqari.com`, alter historical V266, change hosting protection, or mutate Production data.
