# Bank ingest recovery across same-tab reload — 2026-10-07

Ingest now stores a version-2 pending marker before sending. It contains hashes of source/external identity and the expected unmatched transfer fields, plus the acknowledged opaque ID when available. Plaintext amount, bank/source/external reference, sender, account hint, memo and reason are not persisted. Existing version-1 matching/reopen markers remain readable.

After dialog recreation or same-tab reload, read-only recovery requires exactly one transfer with the identity digest, matching full payload/state/revision digest and any acknowledged ID. Missing, duplicate-identity or contradictory results stay blocked. No resend is introduced. Storage failure prevents the initial write; successful verification or recognized definite rejection clears the marker.

Validation: 68 bank/financial tests pass, including four new cases covering lost reply recreation, changed/duplicate/missing rows, storage failure before sending and successful cleanup, and acknowledged ID mismatch after reload. Runtime verification and diff checks pass. These are DOM/RPC/shared-storage simulations, not hosted device acceptance.

Limitations: sessionStorage is confined to the same tab session. Closing the tab, clearing browser data, cross-device recovery and manual resolution of permanently uncertain/changed operations remain open. Hashes minimize stored plaintext but are not encryption or authorization. Full bank settlement/provider integration and hosted acceptance remain incomplete. No database, actual financial action or production change. R12.09 remains partial; counts stay 16/106/152.
