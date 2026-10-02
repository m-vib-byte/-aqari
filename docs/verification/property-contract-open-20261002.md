# Saved property contract opening — 2026-10-02

The owner reported that a saved PDF in the برج شيخة property archive did not open. The screenshot matches `mountPropertyContractUpload`: the previous Open saved PDF handler only retrieved bytes and appended two links below the entire archive. It did not navigate to the PDF or move the visible view to those links.

The handler now reserves a viewer tab synchronously in the click, then authenticates, reloads and verifies the original stored PDF before navigating that tab. If the browser blocks the tab, closes it, or rejects navigation, a same-tab open link and original download are displayed directly under the selected contract. A failed retrieval closes the waiting tab and displays a retry message. Session disposal closes pending viewers and prevents later delivery. Existing property scope, checksum checks and private Storage access are unchanged.

Validation:
- Six new behavioral cases pass: opening before asynchronous session work, popup blocking, storage failure, session disposal, skipped busy task, and closed/blocked navigation.
- Existing archive, archive pagination/UI, PDF viewer and rental-template test files pass.
- Package check, runtime inventory verification, release freeze check and whitespace checks pass.
- The production browser currently shows the login screen. The owner's original PDF and physical iPhone have not been tested in this session.

No database migration, contract content changes, or writes to stored documents. Previous production revision: `7c79c0a0e6d58cf991caaa1847a55807a1bdbfcc`.
