# V267 document Storage visual-review gate — 2026-09-14

Scope: Preview/support only. This change strengthens requirement G12-23 (document quality preservation) without claiming final acceptance.

## Implemented

- The document scanner no longer finalizes a newly uploaded document immediately after byte verification.
- After the existing verified upload completes, AQARI downloads the actual private Storage object again and checks its exact byte size and SHA-256 against the generated/uploaded source.
- The user is shown a review surface sourced from those downloaded Storage bytes: image preview for supported image types, inline PDF review, or an explicit open/download action for DOCX.
- Finalization requires an unchecked-by-default human confirmation that all pages, text and images were reviewed and that no quality loss is visible.
- DOCX cannot be confirmed until the downloaded stored copy has been opened or downloaded.
- Source/target/file controls are locked while that stored copy is under review so the reviewed object cannot silently diverge from the pending document.
- Immediately before approval resolves, AQARI downloads the Storage object a second time and re-verifies size and SHA-256. Only after that second verification does the scanner call `aqari_finalize_document` and perform the existing database readback.
- Closing the review without confirmation rejects the save path and leaves the document unfinalized rather than silently accepting quality.

## Exact-build regression contract

`tests/v267-document-stored-visual-review.test.mjs` is executed by the Vercel Preview build. It proves source-level fail-closed ordering and guards around Storage readback, byte/hash verification, explicit human confirmation, DOCX open/download, control locking, second readback and finalize ordering.

These automated checks are not visual acceptance and must not be counted as such.

## Remaining acceptance

G12-23 remains **Partial** until the exact hosted candidate is inspected with real authenticated accounts and the stored files are visually reviewed through the actual application on Desktop, physical iPhone and physical iPad. The owner-wide gate also still requires the complete 155-item evidence set, same-SHA green CI, all mandated real-account flows, current complete Database/Auth/Storage-byte backup, independent restore, tested transaction-preserving rollback, correct Production configuration, final owner practical testing, and later explicit approval of that exact SHA.

No `main` merge, Production deployment, `myaqari.com` change, historical V266 mutation, hosting-protection change or Production-data mutation is part of this change.
