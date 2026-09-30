# Kuwait accounting month boundary repair

## Reproduced in authenticated production

Production SHA `62c916562ea162634719e59dac93577254a73dca` displayed the owner
header date as 1 October 2026 (Kuwait), while the commercial sales month default
was August 2026. The UTC date was still 30 September. The previous-month helper
used UTC and therefore selected August instead of the last completed Kuwait
month, September. Partner distributions used the same calculation. Property
statements also used a UTC default when no explicit/source period was available.

## Change

Use a shared calendar helper with the explicit `Asia/Kuwait` time zone for the
current month and the last completed month. Preserve explicit user selections,
saved statement periods, source isolation, approval requirements and all write
and readback behavior. This patch does not change ledger values or database schema.

## Validation

- 57 focused tests passed: calendar boundaries, commercial sales, partner
  distributions, commercial collections, statement navigation and report exports.
- Regression cases cover Kuwait midnight while UTC remains in the old month,
  year rollover, leap day and three device time zones.
- Mounted sales and partner forms are tested at the month/year boundary.
- Current production sidebar destinations for activity/audit, compliance and
  settings opened successfully during authenticated read-only inspection.
- The five database setup blockers identified in `service-audit-2026-10-01.md`
  were rechecked after PR #354. All showed the intended setup message and recovery
  controls rather than an untranslated database error. They remain blocked;
  these observations do not establish successful writes or complete acceptance.

No production records, approvals, payment transactions, settings or SQL were
changed during the inspection. Physical iPhone/iPad acceptance remains separate
from automated browser tests. Backup/restore gate #197 and the Preview E2E
Deployment Protection authorization blocker remain open.

## Concurrent release integration

PR #356 removed the global experimental contract shortcut while this repair was
being verified. Its main SHA `03f0e9331be7732972c02332460459b1563b886e` failed
Follow-up Center Gate run `36789401897` because `FILE_INVENTORY.json` still held
the previous checksum for `src/v267/components/contract-routing.js`.
This branch incorporates that removal and refreshes its inventory entry; it
does not restore the shortcut or weaken checksum validation. The combined
revision is subject to the same release and authenticated browser checks.
The combined local revision passed release-freeze checksum validation and all
62 targeted calendar, financial-form, export and guarded contract-route tests.
