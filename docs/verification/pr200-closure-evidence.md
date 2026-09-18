# PR 200 candidate evidence — 2026-09-18

Continues parent 4f384b9f1bef8bb4f6ea7a5e3bf27497b82aae07. No new business features, database migration, authentication bypass, production promotion or owner acceptance.

## Reviewed translation scope

`node scripts/audit-v267-reviewed-locales.mjs` freezes the manually classified inventory: 3,841 classified occurrences, 3,767 visible occurrences, 74 excluded technical/persisted occurrences, plus 65 generated salary document sources. After deduplication the required total is **3,181 visible source messages**, with **0 missing translated values** across English, Hindi, Urdu and Malayalam (Arabic source language).

The earlier 1,581 regex candidates were a diagnostic estimate, not a required-message count. The reviewed inventory includes already translated messages and generated document labels. Do not add these totals to the original 911. The broad scanner remains available but does not distinguish all technical strings.

Stored names, references, enums, audit reasons and record text remain literal. Translated initial form defaults return their original canonical value when untouched. Saved account preferences override the anonymous login preference; Arabic and Urdu use RTL. Both salary templates select one display language while preserving records and calculations.

## Rendering and design implementation

Reference-derived hero, six metrics, three-column workspace, compact rail, consistent SVG icons and warm beige/brown/gold surfaces. Decorative hero artwork is not a verification screenshot or property record photo. Internal forms/dialogs share responsive styling.

Fixed a legacy CSS selector hiding the replacement home, delayed home mounting/remounting, premature hiding of fallback content, and the contract follow-up destination. Root lifecycle tests execute these scenarios with DOM mocks.

## Verification and remaining release gates

341 build-stage Node tests pass. Additionally, 37 targeted locale/render tests pass, including locale persistence, translation parameters, provider error sanitization, generated salary documents and dashboard mounting. These are unit/source/mocked tests, not real-device or live-database certification. Partner-access save/readback was exercised with mocked RPC; this does not establish live save/readback.

Actual candidate screenshots, authenticated navigation, live save/readback, session/permission flows and Desktop/iPhone/iPad verification remain unverified. Candidate sign-in was previously rejected by automatic approval review; no session transfer or bypass was attempted. Available browser interface does not provide device viewport emulation.

GitHub runtime-contract run 35273932887 attempt 2, job 105381452212, failed with no steps and runner_id 0; log retrieval returned BlobNotFound. Main baseline run 35260566018/job 105334934093 has the same pre-runner failure. This establishes failure before application tests; it does not establish the account-level cause. Annotation access is unavailable through the connected API. No application rewrite or weakening of checks is justified by this evidence.

Production publication is blocked until required checks and actual verification are complete. myaqari.com remains the sole final owner testing URL; final acceptance belongs to the owner.

## Build compatibility follow-up

Updated existing build-time UI installers for translated anchors without removing strict mismatch failures; all injected labels now use locale dictionaries. Refreshed file integrity hashes for the reviewed modifications. Test harnesses now supply the real locale/error helpers that their stripped-import fixtures require; security/readback assertions remain. The production promotion gate remains closed.
