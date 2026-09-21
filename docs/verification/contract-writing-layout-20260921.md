# Contract writing workspace — 2026-09-21

## Scope and preservation

The editor controls shown in the user's iPad screenshot occupied a large sticky header and footer over the document. The existing source was continued from main `970044494af2cf2b6b1487e3573732af25d6c0ce`, retaining all concurrent property fixes through PR280.

The new editor places compact actions and writing controls above the A4 surface, in normal document flow. It supports font size, line spacing, logical alignment, symmetric margins, fit-to-width and 100–150% display zoom. Clause movement remains available in a collapsed menu. Display zoom, pagination and opening an existing template do not write data. Formatting choices are optional presentation metadata; they never rewrite legal text. Final preview and download use the same PDF artifact. Existing PDFs without typography remain byte-identical.

No existing template, contract, archive or draft was modified, approved or issued by this work. The shop draft's 36 numbered provisions remain in its original single text block. At the baseline it was revision10, text length15662, fields8, full-row MD5 `019db12063669e227bd9f6e284cef5f5`, clause MD5 `7c83a1e3e737d9a4b3564e56696dbba6`.

## Save diagnosis

Successful saves were recorded after the screenshot; the exact screenshot error is not attributed to an unverified cause. A separate reproduced bug retained a rejected validation payload even after the user corrected it. Confirmed pre-write validation failures can now retry the corrected content; ambiguous network, conflict and read-back failures retain their original idempotency key. A specific inline explanation accompanies save failures.

## Verification completed

- Standard Vercel build and both owner-interface installers passed in an isolated checkout.
- Full JavaScript suite:1964 passed,0 failed,0 skipped.
- Focused writing, preservation, pagination, read-only and autosave tests:58 passed.
- Python PDF/release suite:67 passed, including optional typography and canonical JS/Python digest parity.
- SQL library/typography roundtrip tests passed locally on PGlite, including repeated migration, absent metadata compatibility, original36-clause content, copy/history/publish snapshot isolation and permissions.
- Only additive validator migration `20260921123822_v267_template_typography.sql` was applied to the existing production database. It has no record INSERT/UPDATE/DELETE. Production read-only validation accepted both old and formatted presentation. Shop revision10 and full-row hash remained identical immediately afterward.
- Supabase security-advisor findings were identical before/after, excluding observation timestamps. No new grants were introduced.
- Three pre-existing test failures reproduced on exact baseline6064c04 were stale selectors for the renamed optional imported-tenant correction-reason field. Only those three test selectors were updated; no unrelated product behavior was changed.

## UI check boundary

Authenticated cloud-browser access to myaqari.com was verified. Before deployment the old action footer was measured at90px high with position sticky. The user's screenshot is iPad evidence; this environment is cloud Chrome, not a physical iPad or iPhone. Post-deployment layout measurements and data-hash comparison belong to the release PR verification update.
