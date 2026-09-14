# V267 contract-entry guard — 2026-09-14

Scope: Preview/support only, stacked linearly on the exact PR #160 head `459df87a4e91d29b86b7e6d6a1ae32f8e26854b2`. No existing branch is merged, rewritten or force-updated.

## Change

- Canonicalize contract-route intent and drop unknown route fields.
- Reject conflicting create/open/renew intents instead of choosing one implicitly.
- Reject control characters, oversized references and non-scalar contract/renewal/property references.
- Permit an initial property hint only for explicit new-contract creation.
- New-contract entry now performs a fresh `aqari_workspace_access` read before and after lazy-loading the contract foundation.
- The guard requires the same workspace/user/role plus both `contracts.read` and `contracts.write` before opening the creation foundation.
- The guard closes its temporary session in `finally`; the contract foundation keeps its own separately bound dialog session.
- Saved-contract and renewal paths continue through the existing guarded workspace opener.

## Verification contract

`tests/v267-contract-entry-routing.test.mjs` verifies canonical intent handling, fail-closed conflicts/unsafe hints, saved-contract routing through the guarded opener, and the source contract for the double access read around lazy foundation loading. `scripts/verify-staging-runtime.mjs` syntax-checks the new guard as a bounded support overlay. The exact Vercel Preview build already includes this focused suite through `scripts/build-vercel.mjs`; deployment/build results must be recorded separately and must not be treated as hosted-account acceptance.

## Release limits

Owner governance dated 13 Sep 2026 Kuwait time controls. This change does not satisfy 155/155, same-SHA GitHub CI, hosted real-account acceptance, physical iPhone/iPad acceptance, complete Database/Auth/Storage-byte backup, independent restore, transaction-preserving rollback, Production configuration, final owner practical testing, or later explicit Production approval of the exact candidate. Do not merge to `main`, deploy Production, change `myaqari.com`, alter historical V266, change hosting protection, or mutate Production data.
