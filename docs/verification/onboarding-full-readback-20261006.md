# Property onboarding: complete readback and uncertain-save recovery

Date: 6 October 2026. Stacked on PR435 head `ab5dddce2132c5a160b1dd59ddabdd542673ff17`.

The onboarding save path previously compared only property name, address and
description after writing the master record. It could report success with changed
owners, contact details, income, tenant visibility or attachment references. A retry
after an uncertain result would issue another master write.

The path now compares every submitted master field through the existing shared
comparator, along with property identity and the exact expected revision. Every
uploaded document must still appear in the file's archive readback. A remembered
attempt is installed before sending the write. Further retries perform readback
only, so a lost write response or temporary read error can be recovered without
another master mutation. If the write did not commit, data differs, or a concurrent
revision exists, the operation stays unconfirmed rather than resending blindly.
This attempt state is scoped to the open dialog; it is not durable idempotency
across page reloads and does not change legacy property creation or upload logic.

The shared comparator normalizes the documented `office_hours` / `officeHours`
visibility alias from `property-batch-a2-visibility-key-fix.sql`. Both aliases must
agree when present. Different values, additional visibility keys and other field
differences remain mismatches.

## Evidence

- 27 new tests execute the actual nested onboarding save function with isolated
  RPC responses. Before the fix: 2 passed, 25 failed. After the fix all 27 passed.
- A server-shaped fixture includes the office-hours alias returned by the SQL
  snapshot. Before alias normalization, the two-file suite had 5 failures; those
  are resolved. The new comparator test covers enabled/disabled settings, alias
  agreement, conflicting aliases and unexpected visibility fields.
- Combined ownership/onboarding/master suite: **113 passed, 0 failed, 0 skipped**.
- Added the same seven-file suite to the Runtime contracts CI workflow.

```sh
node --test tests/v267-onboarding-readback.test.mjs tests/v267-owner-entry-consistency.test.mjs tests/v267-master-owner-readback.test.mjs tests/v267-ownership-readback.test.mjs tests/v267-property-ownership-area.test.mjs tests/v267-property-onboarding.test.mjs tests/v267-property-master-runtime.test.mjs
```

## Limits

No hosted property was created for this change. No SQL migration, production
deployment or business-record edit is included. PR435's hosted optional-owner
acceptance belongs to its exact earlier head, not to this new change. Hosted
onboarding end-to-end acceptance and physical-device/owner acceptance remain open.
The separately published optional completeness-service fix in PR423 must be
preserved when integrating the stack; this patch does not replace that fix.
The requirement register remains 16 complete / 104 partial / 154 needing verification.
