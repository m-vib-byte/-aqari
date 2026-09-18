# PR 200 continued closure verification — 2026-09-18

Continues exactly `41e5d0cfeb12c7b053fe125a8b88cb9f81724ac8`. No restart, production promotion, data migration or permission change. This is a repair checkpoint, not final delivery or owner approval.

## Repairs

- Ordinary management logout, rejected-login cleanup and tenant-portal logout now revoke only the current Supabase session. Idle lock already used local scope. Explicit `scope: 'global'` is the only broad-revocation path; a failed broad request cannot be reported successful after merely clearing local authentication. Existing identity guards and fail-closed behavior remain.
- Restored the reference header's account button to the existing V199 account menu. The design had routed it to owner-report preferences, leaving the original logout/backup/account actions without their normal entry point. The original delegated handlers are reused. The menu uses the warm beige/brown/gold skin and its six previously hidden captions are translated in all five languages. The stored account label is excluded from translation.
- Repaired the production-preparation tool's exact imported-tenant anchor after localization changed the source. Its database restrictions, immutable file handling, unsupported-field exclusion and source-drift rejection remain enforced. Trial mode is unchanged.

## Verification

An existing local checkout was matched against all 1,042 blobs of the exact base tree before applying this change. The existing Vercel build stages completed locally. On their generated output, `node --test tests/*.test.cjs tests/*.test.mjs` passes **1,632 / 1,632**, with no skipped tests. This includes authorization boundaries, saved-record workflows, navigation, portal handling, catalogs and documents. It does not replace GitHub Actions or physical-device evidence.

The initial pre-build all-files run had 21 failures. Some tests require generated navigation and ownership installers; those pass at their correct build stage. Remaining old assertions were reconciled with the current implementation: current-router-first navigation with preserved fallback; recursive secret-metadata rejection; imported module bindings in VM fixtures; and separate production/trial preparation. The complete generated login budget is explicitly 19 KB (18,026 bytes observed), replacing the earlier 17 KB budget for the smaller shell. Only a fixed allowlist of same-origin reference styles may augment the mandatory inline core. No production authorization or business assertion was removed to mask the Actions block.

The original local-only staff/property isolation SQL suite also passes against in-memory PostgreSQL with the real current MFA guard and schema. Its synthetic manager fixture now carries an explicit recent second-factor timestamp. General manager, collector, accountant, maintenance, viewer, unassigned staff, partner restrictions, foreign-property rejection, revision readback and preservation assertions run without any hosted database writes. The full SQL completion chain is not certified by this narrower run; its first attempt stopped at the old timestamp-free MFA fixture before this repair.

## Live browser observations

At 17:06 UTC the previous connected Chrome session was absent while the separate Safari session from 16:06 remained. This is consistent with current-session idle expiry preserving the other device; there is no caller trace attributing the exact expiry event. Secure login authenticated the same QA tab again at 17:09:43. At 17:27:43 Chrome and Safari still coexisted after navigation and all five language changes.

Actual Desktop Chrome checks on the base deployment covered the English staff directory, saved collections (2 payments / KWD 200), documents, Hindi maintenance, Urdu documents with RTL, Malayalam property list/edit form with LTR, and return to Arabic. Stored Arabic names were retained. Forms inspected in this continuation were closed without business-data changes. The earlier saved-address/readback/restore evidence remains bounded to e344fed3. The connected browser provides neither a physical iPhone/iPad nor a device-emulation capability. Device-width fixtures are simulations, not real-device certification.

Reviewed source inventory: **3,409** unique visible messages, **0** missing catalog translations; six restored account-menu captions account for the increase from 3,403. This is source coverage, not proof of zero untranslated text throughout every running page, role, modal and generated document.

## GitHub gate and release limits

Runtime run 35370342701/job 105682550830: `steps=[]`, `runner_id=0`, no runner name. The saved owner-provided annotation says an Actions budget prevents further use. The connector rejects check-annotation and billing reads. The actual GitHub browser sign-in returned: “This account does not support password sign-in, please try another sign-in method or account recovery.” The password attempt was not repeated. Current budget settings and the current annotation still need authenticated owner access. No workflow rerun, budget change or bypass was performed.

Complete reference-design matching across all pages/portals, complete live visible-language coverage, hosted all-role/save coverage, real iPhone/iPad tests, the full 176-item acceptance and a green GitHub gate are not established. Do not promote this checkpoint to myaqari.com. The owner's sole final trial URL and explicit personal approval remain mandatory.
