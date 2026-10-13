# Archive candidate with published voice and MFA recovery

On 10 October 2026, integrate archive head `75742179f8a1bcc0eaaa18c306a23d92a5e486c3` with published main `af3c7c290b69013bb57d1c3c39ff24ea04cd503a` as a true merge.

The merge initially conflicted in the runtime workflow, file inventory, dialog error handling and operational translations. Preserve both workflow groups and both translation entries. Keep main's MFA guidance and the archive's pending-navigation cancellation: rejected step-up must retain the draft without automatically navigating or replaying a save. Update the dialog regression to assert the current recovery guidance while retaining its no-retry and no-navigation assertions.

The candidate carries published changes #473, #475, #476 and #477 alongside archive guards #474 and #478. No new database migration or business-record change is made by this integration.

Validation on the integrated tree:
- `node scripts/test-release-regressions.mjs`: 2,854 passing JavaScript tests, zero failures/skips.
- Package, release-freeze and diff whitespace checks pass.
- Compared with main, dialog runtime differs only by retaining `pendingNavigation=null` on exact MFA rejection.
- The first regression run caught the old message assertion; the new guidance assertion passes without weakening write/navigation checks.

This remains Preview-only. Hosted actual contract finalization, original PDFs/receipt reopening, duplicate-settlement acceptance and owner-device acceptance remain open. No fabricated payment or signing attestation was submitted; the earlier automatic-review block is not bypassed. Build/CI evidence does not replace that acceptance.
