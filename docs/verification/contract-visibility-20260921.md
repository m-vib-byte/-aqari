# Contract workspace visibility repair — 2026-09-21

## Reproduced on myaqari.com

After secure browser sign-in, the live contracts button opened the new `main.aq267-page`, but its measured width was only **860px** on a **1348px** viewport. Computed maximum height was **823.68px (88dvh)** on a 936px viewport. The deployed `luxury-warm-beige.css` modal selector applied important width and height restrictions to full document pages and outranked the page layout.

The live contracts home had no direct template-library action. The four starting drafts were present after selecting a property and opening its template manager. The A4 editor opened at actual 100%, but custom-field controls were behind the generic tools toggle. The legacy `contractTemplatePage` route also still opened the old static preview page instead of the guarded template library.

No server error was found during this investigation. The current source files were deployed; cache was not established as the cause of the reproduced size restriction.

## Repair

- Exclude full pages from the legacy modal size rule and give the full-page layout explicit precedence over theme styles.
- Expose a manager-only template library action directly on contracts home, with descriptions of A4, custom fields and the four starter drafts.
- Provide a visible custom-field action that reveals/focuses the existing editor tools without changing or saving document content.
- Route the legacy template entry through the existing manager-checked library callback. Preserve unrelated navigation and fail closed when access is denied.
- Add a guarded library link to the existing experimental reference without changing its text. Hide its floating shortcut while a full document page is open.
- Send `no-store` for mutable V267 assets on new requests. Preserve vendor caching, security headers, session storage and user data; do not force-reload an open editor.

Concurrent PR #275, main `62c8d8e6f784845d4bffeae39ab344b3a16d4df6`, is preserved in the combined source. This repair does not apply migrations or write hosted business records.

## Verification

Behavioral tests exercise contracts home → actual template page → starter library → A4 editor → custom-field entry, including role checks and zero business writes. Legacy navigation wrappers retain guarded routing and deny fallback to the old preview page. The reference text is unchanged. A CSS regression gate covers the modal/full-page conflict.

The full test suite is run after the normal build installers, because several existing tests require generated navigation code. The raw, pre-install source suite is not a release result.

The combined build and both owner-interface installers passed. The resulting JavaScript suite passed **1945/1945 tests**, with no failures or skips. The build's Python PDF/layout gate also passed **62 tests**. The targeted visibility/navigation/editor set passed **76 tests**.

Live pre-deployment checks opened the library and one static starter without editing, saving or approving it, then closed the workspace. Read-only data comparison confirmed no change: shop draft revision 7, 36 clauses, original-column digest `58e5c04bda8d0a533d6b3142244dfaeb`; app state revision 46, digest `2f9c0499975bcf2a3fccf37018ced100`; drafts 1, history entries 4, user-published templates 0, documents 2, archive entries 0, properties 7, units 170, tenants 44 and leases 43.
