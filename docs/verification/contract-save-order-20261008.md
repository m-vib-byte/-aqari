# Contract foundation save ordering — 8 October 2026

An explicit review, draft transition or promotion could overtake the foundation form's pending 500 ms autosave. The foundation writer also left the rental-record store's local sections behind its confirmed cloud write, causing the next lease transition to report an avoidable conflict.

This independent change extracts the save-order and confirmed-cache repair from `45fa2f1298757dfcbbe745f42b2fa1fac13a6202`, onto Production main `bcf7b0960fd801275f22280ea6bf7b0e60b5ee4d`. It includes no archive transport, schema, credentials, role or business-record changes.

The autosave queue serializes writes. Explicit actions flush pending edits and wait for the in-flight save before continuing; a rejected save blocks review/promotion. Disposing the draft cancels unsent work. Each confirmed cloud write may update only the local sections it changed, under the same account/workspace, provided no local edits, active store operation or uncertain write would be overwritten. The existing uncertain-write lock remains intact.

Validation: 40 focused foundation, autosave and rental-record tests passed with zero failures/skips. They cover latest-edit flushing, in-flight ordering, failed-save blocking, disposal, confirmed-cache synchronization, atomic rejection of local conflicts/account changes and uncertain-write protection. The complete release regression and CI results are recorded in the associated pull request and execution register.

Hosted signed-in contract acceptance and owner iPhone/iPad acceptance remain unverified. The browser's native credential protection blocks resuming that session. This code-level repair does not close the archive acceptance requirement or mark the full contract workflow complete.
