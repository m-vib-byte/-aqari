# Maintenance reservation recovery and audited cancellation

This change frees abandoned reservation slots without deleting a Storage object or an attachment record. It is local code and synthetic acceptance evidence; this task did not modify a hosted database, publish code, or use real accounts.

## Applied history and upgrade order

The actual deployed `20260912181410_maintenance_attachment_reservation_abandonment.sql` differs from the concurrent branch's base SQL and JavaScript. The deployed migration uses `abandoned`, `abandoned_at`, `abandoned_by`, `abandon_reason`, and action `abandon`. The concurrent base instead used `cancelled` and attempted direct deletion from `storage.objects`.

The deployed migration is preserved byte-for-byte with SHA-256 `eb1212cfb6411a3b51afbdfd08aa032da6fdf9422bc204687c9bc36afaa3f1ba`. It is historical input, not a script to rewrite or reapply against existing records. The concurrent base `maintenance-attachments.sql` has been retained with its pending-reservation contract, while the direct Storage deletion was removed. Its legacy cancellation entry requires the independent audited upgrade for any new cancellation.

Two later deployed convergence migrations, `20260912181849` and `20260912182407`, use `cancelled` with `cancelled_at`, `cancelled_by`, and `cancel_reason`. Their actual deployed files are also immutable historical input. Their SHA-256 values are respectively `ce6326de6484e07061dae05099643188a9b44950f45c92872fa5ea5f86d79146` and `ae180d265e141be65fa94ff351a04899604ef8c3cc83497c4a4514f28f140cdb`.

Apply **`staging-database/sql/maintenance-attachments-cancellation.sql` after the installed attachment schema, `20260912181410`, `20260912181849`, and `20260912182407`, in that order**. New cancellations use the latest deployed `cancelled` state and fields, with both `cancel` and `abandon` action names accepted. The upgrade explicitly reconciles both status/audit constraints. Existing `abandoned` and `cancelled` rows retain their original states and values; no history rows are backfilled or converted. Real actor/reason/time values from either spelling are displayed unchanged. Only old `cancelled` history without recorded actor/reason is marked `audit_incomplete`; an audited convergence record is never labeled incomplete.

## Resulting behavior

- Only `reserved` and `uploaded` rows count toward the shared limit of eight active attachments per request. An archived row remains stored and cannot reuse its UUID/path, finalize, or receive a new Storage POST. A new file selection may obtain a new UUID after a slot is freed.
- `list.attachments` remains the existing uploaded-only contract. Optional `pending` and compatible `pending_reservations` contain only the current uploader's reservations; `cancelled` returns that uploader's latest 50 archived records. Scoped staff do not see another uploader's pending or archived metadata, even on a request they can otherwise read.
- A cancellation requires the uploader, current request write permission, an open request, and a reason of 6–240 characters. Sensitive staff accounts must satisfy the existing AAL2 helper. Tenants retain their existing account/tenant ownership check and gain no staff membership or broader document permissions.
- Uploaded originals cannot be cancelled. A pending upload whose bytes reached Storage may be archived; those bytes remain physically stored and become unavailable through the attachment access policy. No DELETE or UPDATE access to Storage was added.
- Repeating the same cancellation returns the same actor, reason and timestamp. A different reason is a conflict. Confirmation of an already archived record can be read after request closure; closure prevents any new cancellation or upload.
- Reservation, cancellation, finalization and Storage insertion acquire the same request lock. Storage insertion rechecks the active reservation after obtaining the lock. The private attachment trigger rejects deletion and rewriting of uploaded/archived records or original attachment metadata.
- The panel shows pending filenames, a file chooser to resume with exactly the same name/type/size/SHA-256, and a reason field for cancellation. Completed requests display pending history without resume/cancel controls. Cancellation clears stale selections; archived history remains available after reopening.
- The client confirms cancellation with an independent `inspect` plus list readback, checking file metadata and the immutable cancellation fields. A lost mutation reply triggers reads, not another mutation. A mismatch, unavailable readback or revoked authority cannot be reported as confirmed success.

## Evidence

The following direct Node command passed **81 tests, zero failures/skips**, including original portal/session/staff checks, six new client cancellation/recovery checks, five new panel checks, and the four concurrent reservation tests adapted to the deployed audited contract. The concurrent fixture's object deletion was removed, and its invalid `map(structuredClone)` callback was corrected.

```sh
node --test tests/v267-maintenance-storage-session.test.mjs tests/v267-maintenance-attachments.test.mjs tests/v267-maintenance-attachment-panel.test.mjs tests/v267-maintenance-reservation-cancel.test.mjs tests/v267-tenant-portal.test.cjs tests/v267-service-desk.test.cjs
```

The initial PGlite run passed 116 steps against the 110-step baseline and abandonment migration. After discovering the later convergence migrations, the expanded baseline was rerun through all three actual historical migrations, two applications of the revised upgrade, and both original/new attachment tests; those attachment steps passed. A later unrelated vacating compatibility test stopped the complete expanded suite and is reported separately by its owning agent. The final bounded attachment run also reapplies the revised upgrade over synthetic `abandoned`, fully audited `cancelled`, and older incomplete `cancelled` history, comparing every attachment row's complete JSON before/after. The bounded run and full-row comparison passed with exit code 0. The comparison verifies preservation of the original actor, reason, time, metadata and archived spelling; it does not convert or repair historical records.

The new normal SQL test is independently suitable for hosted preview acceptance: one `BEGIN`/`ROLLBACK`, unique synthetic workspace `77ca0000-0000-4000-8000-000000000090` / `maintenance-cancellation-rollback-test`, synthetic account IDs and `.invalid` emails, no DDL/grants/trigger or RLS disabling, and all direct UPDATE/DELETE attempts restricted to that workspace. It tests the eight-slot boundary, freeing a slot, denial of archived POST/finalize/reuse, preservation of already stored originals, audit idempotency/conflicts, uploaded protection, closed request behavior, MFA, tenant isolation, scoped staff isolation, and historical compatibility. The DDL-containing derived upgrade-preservation transaction is **local-only** and is not the normal hosted test.

Final local logs: `/workspace/scratch/2a0f46b6cc21/maintenance-cancellation-node-convergence-final.log` and `/workspace/scratch/2a0f46b6cc21/maintenance-cancellation-convergence-preservation.log`. The complete expanded suite's separate vacating failure is retained in `maintenance-cancellation-convergence-final.log`. Runtime syntax checks and `git diff --check` also passed.

## Acceptance limits

SQL identity claims and AAL2 are synthetic; they are not real sign-in/MFA challenges. SQL Storage rows represent metadata, while the Node tests use synthetic bytes and the actual client modules. No hosted upload, physical device/camera, browser transport, or concurrent independent PostgreSQL sessions were exercised in this task. The shared request lock is implemented and exercised by SQL operations, but a parallel transaction load test is separate. The new panel text remains Arabic. Archived history is never deleted; only its latest 50 records are rendered in this panel.
