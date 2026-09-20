# AQARI V267 continuation — 20 September 2026

Verified/tested source base: `3eaf725fa8851c58d904dc534f9fbb6c60b86c62`. Final parent: `58fa5762387096dbd5047982813fa57195c7b5c2`. Main advanced during verification by one added civil-ID SQL migration only; no tested JavaScript, styles or tests changed. The new migration is preserved from the parent and was not applied or certified by this work. This contains the merged PR #200 and its idle-activity repair. The 1,075 source blobs were reconstructed and verified against their GitHub Git blob hashes before changes. No new branch, PR, merge, deployment, hosted database write, permission change or auth-policy change is included in this continuation.

## Reproduced and repaired

- Shared dialog loading previously overwrote every pre-existing control's final `disabled` state with its pre-request state. The new behavioral test failed on the unchanged source: an action enabled by a verified read remained disabled. Conversely, task validation could not leave a previously enabled control disabled. Loading now uses `inert` on the dialog body, retaining field values and page-owned validation states, covering dynamically added controls, and leaving the external close control available. Duplicate run protection and auth-boundary disposal are retained.
- The rental-template picker and manager displayed fixed Arabic interface labels in other locales. Static captions, messages, type choices, version labels and confirmation states now use the existing five-language catalog. All 45 interface/error sources checked have values for English, Hindi, Urdu and Malayalam in addition to Arabic. Saved template titles, draft content and legal clauses remain literal. Rendering translations does not publish a template.
- The contract-load regression fixture lacked the already-used query `.or()` operation. The fixture now models it and asserts the source-only-property exclusion explicitly, retaining the parallel-read and closed-session rejection assertions.
- The existing browser test did not serve current locale dependencies. Its local-only dependency allowance and regression cases were updated. It is prepared, not reported as executed.

## Verification actually completed

An isolated copy ran all three commands from the repository's Vercel buildCommand successfully:

```
node scripts/build-vercel.mjs
node scripts/install-v267-owner-reference-package.mjs
node scripts/install-v267-owner-feedback.mjs
node --test tests/*.test.cjs tests/*.test.mjs
```

Full generated-output result: **1,806 tests passed, 0 failed, 0 skipped**. The build also ran its existing Python checks. Focused dialog/auth/idle checks passed 31 tests. The template tests include five-language rendering, unchanged saved legal text, role restrictions, and same-request retry after lost publication/readback replies. These are local synthetic tests, not hosted account or device acceptance.

## Remaining delivery blockers

- No physical iPhone/iPad or live authenticated Desktop acceptance was performed. No callable cloud-browser capability was exposed. Local Chromium/WebKit binaries were absent and the browser download timed out; no visual pass is claimed.
- Complete site design matching, every live language surface, hosted save/readback, all roles/data isolation and sustained session stability remain unaccepted.
- Seven check runs on current main reported failure. Runtime job: https://github.com/m-vib-byte/-aqari/actions/runs/35497043126/job/106041830109 . Reading its annotations was rejected by the connector's endpoint allowlist. No current budget diagnosis, CI pass, rerun or gate bypass is asserted.
- Backup/restore/rollback and exact deployed revision acceptance remain separate release requirements. This patch does not change myaqari.com.

Status: implemented and locally verified repair checkpoint; **not full platform delivery or release approval**.
