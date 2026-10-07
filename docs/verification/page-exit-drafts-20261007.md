# Pending edits on page exit — 2026-10-07

Requirement R01.07 remains partial. Existing dialog close prompts did not cover browser refresh/navigation in several editing surfaces. Added an explicit synchronous page-exit guard owned by the dialog lifecycle and used it for expense drafts/pending writes, scanner files/pending finalization, rental template autosave, employee profile edits, employee grants, and staff access/account preparation edits.

The guard requests the browser's native confirmation only while its predicate reports pending edits or cannot determine the state. It never sends a write during page exit, never serializes private drafts, and does not block authentication revocation. It is removed on dialog disposal and employee screen transitions. Existing PDF-editor exit handling remains unchanged.

Validation: the lifecycle test covers clean, dirty, saved, unknown, reset, access-revoked and already-disposed states. The full prepared JavaScript regression suite passes 2,709 tests with no failures or skips. This is not physical-device acceptance. Browsers control whether native exit prompts are shown; force-closing a mobile app is not guaranteed to emit beforeunload. Cross-session recovery and other editing surfaces remain separate work.
