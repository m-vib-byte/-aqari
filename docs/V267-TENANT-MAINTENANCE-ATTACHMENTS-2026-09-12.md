# V267 — tenant maintenance request attachments

Date: 2026-09-12. Scope: implementation evidence for maintenance/photo portions of requirements 73, 81, 109 and 114; this does not close those full requirements or the 155-item release gate.

## Confirmed gap and implemented flow

The isolated tenant portal previously saved a maintenance description only. The existing `tenant-attachment-upload.js` is a staff tenant-profile document uploader and is not a safe substitute for tenant-owned maintenance uploads.

- `v267-tenant-portal.js` now puts **صور البلاغ ومرفقاته** on each saved request and explains the entry point after a request is saved. The request/workspace/account come from the verified tenant snapshot; the file panel has no editable tenant, request or workspace selector.
- `v267-service-desk.js` opens the same attachment panel for the exact saved request. It also exposes **أمر الشغل المرتبط بالبلاغ** to the general manager only, delegating to the independently implemented `openOperationsCenter({requestId})` after closing the current dialog.
- `src/v267/components/maintenance-attachment-panel.js` accepts camera JPEG, multiple selected JPEG/PNG/WebP photos and PDF originals. The maximum is eight reserved/uploaded originals per request, ten MiB each. A partially interrupted batch retains only unconfirmed selections for retry. Uploaded originals can be retrieved again from the request.
- `src/v267/components/maintenance-attachments.js` uses a client-generated reservation ID retained across a lost reply, insert-only upload, full byte readback and SHA-256 comparison, finalization, and an independent authoritative list readback. After a reload or selecting a new `File` object, the RPC recovers the authenticated user's exact prior request/name/MIME/size/hash reservation before counting the limit. The client accepts the canonical ID only with explicit `reservation_reused` plus full binding validation and always reads that existing path before considering another insert. Retrieval rechecks request access and the stored hash before creating a local private blob URL. No public/signed download links are created; URLs and file selections are cleared on disposal, refresh, sign-out or detected access revocation.

## Database access contract

`staging-database/sql/maintenance-attachments.sql` must follow `staff-property-scope.sql` on an independently verified preview database. It adds a private table, a private storage bucket and a small public `SECURITY INVOKER` RPC wrapper. The narrowly scoped implementation is in the non-exposed `private` schema with explicit `auth.uid()`, workspace, request, tenant ownership or property-level maintenance ACL checks and revoked default execution privileges.

`aqari_maintenance_attachments(p_workspace_id, p_request_id, p_action, p_data)` supports:

- `list`: uploaded records and `can_upload`, only for the owning active verified tenant account or a staff user with maintenance access to the request's property.
- `reserve`: only an open request; tenants may add to requests they created for their own tenant account. Filename, media type, size, hash, uploader and immutable path are bound to an idempotent reservation. Concurrent reservations serialize on the request row. A matching reserved or uploaded original for the same authenticated user is reused before enforcing the eight-file limit; another tenant, request or employee cannot inherit that reservation.
- `finalize`: only the reservation's authenticated creator, exact request/workspace/hash, and a stored object whose metadata confirms size and media type. The client additionally confirms the actual complete bytes before calling this operation. A retry for an already finalized original remains read-only/idempotent after request completion, while new reservations and finalization of pending files stay blocked.

Bucket `aqari-maintenance-private` is private, has a ten MiB/media type limit, and uses separate authenticated SELECT/INSERT policies. Draft bytes are readable only by their uploader; finalized bytes also become readable to staff with the request's property permission. No UPDATE/DELETE policy is added. Tenant accounts gain no staff membership, no general document upload permission, and no direct private-table access. Completed/cancelled requests retain readable history and reject new uploads.

The staff HTTP storage adapter in `src/v267/api/session.js` now includes this bucket in its existing whitelist. The parent integrator explicitly assigned that one-line shared change to this subtask. Its existing workspace/path/GET/POST checks, insert-only header, authenticated download endpoint, bounded body reading and account checks are retained and tested.

## Verification completed

The following command passed **66 tests, zero failures/skips**:

```sh
node --test tests/v267-maintenance-storage-session.test.mjs tests/v267-maintenance-attachments.test.mjs tests/v267-maintenance-attachment-panel.test.mjs tests/v267-tenant-portal.test.cjs tests/v267-service-desk.test.cjs
```

Twenty-seven new tests cover real module execution with synthetic bytes and DOM controls: multi-file upload/retrieval, lost reserve/upload/finalize replies, interrupted second upload, no duplicate original, corrupted same-size readback, wrong request/account/path/hash, denied reads, malformed or oversized files, session disposal, URL revocation, exact portal/staff binding and manager-only work-order navigation. Recovery tests explicitly discard the uploader/panel and select new `File` objects after reservation, storage, finalization or readback failure; the same persisted reservation and bytes are recovered without consuming another slot. The staff storage tests additionally prove authenticated GET/insert-only POST, preserved existing buckets, rejection of cross-workspace/traversal/other buckets and PUT/PATCH/DELETE/HEAD, and account changes before or during body retrieval. The existing 39 portal/service-desk regression tests remain intact and passed. JavaScript syntax and `git diff --check` passed.

An in-memory PostgreSQL run restored the existing schema catalog and successfully applied:

1. `staging-database/sql/mfa-enforcement.sql`
2. `staging-database/sql/staff-property-scope.sql`
3. `staging-database/sql/unit-readiness.sql`
4. `staging-database/local-test/fixtures/maintenance-attachment-storage.sql`
5. `staging-database/sql/maintenance-attachments.sql` **twice**
6. `staging-database/tests/maintenance_attachments.sql`

The attachment fixture records synthetic unit readiness through the authorized `aqari_unit_readiness_register` RPC before inserting each signed lease. It does not disable guards or insert directly into immutable readiness history.

The combined `npm run test:completion` run also passed both applications of the attachment upgrade and `maintenance_attachments.sql` after the readiness upgrade and its acceptance tests. That combined run subsequently stopped at the separate work-order fixture with `UNIT_NOT_READY`; this subtask does not claim that full combined run passed.

The transactional SQL fixture proves: tenant insert and metadata finalization/readback; two tenants within the same property remain isolated; other workspace/request IDs are denied; assigned maintenance staff can read finalized photos without tenant/lease table access; another property, accountant and anon are denied; reservations/finalization retry idempotently; newly generated client IDs recover the original pending/uploaded file, including recovery when all eight slots are occupied; identical content for another tenant/request or employee receives its own separate reservation; unsupported MIME, excessive size, filename paths, invalid hash and a ninth distinct reservation fail; missing/mismatched storage metadata cannot finalize; direct table reads, replacement and deletion fail; revoked accounts immediately lose metadata/object access; completed requests retain history and allow confirmation of an already finalized original while blocking new writes. All fixture business/auth writes roll back.

`maintenance-attachment-storage.sql` is exclusively a local harness fixture that supplies columns/RLS/grants already provided by Supabase Storage. **Never apply that fixture to a hosted database.** The SQL test uses storage metadata rows; it is not proof of actual hosted Storage file transport. Node tests exercise complete byte transport against an in-memory adapter.

## Remaining acceptance

No hosted schema changes, Git commits, deployment or production mutation were performed by this subtask. Hosted preview upload/download with authorized tenant and assigned staff accounts, browser layout/camera behavior on physical iPhone/iPad, and integration CI remain parent acceptance work. Newly added panel wording is Arabic; full five-language translation of those additions is not claimed. No OCR, image editing, antivirus service, automatic supplier transmission or full-platform completion is claimed by these changes.

Outstanding reservation-management limit: eight *different* pending reservations can exhaust the request quota if their original files become unavailable. Reload/reselection recovery handles the same original content, including at a full quota, but this release does not expose audited abandonment of an unuploaded reservation. Such a future action must retain the audit record and deny the abandoned storage path; deleting or replacing saved originals is not an acceptable workaround.

Current Supabase Storage/RLS documentation reviewed: https://supabase.com/docs/guides/storage/security/access-control . The changelog index was fetched and reviewed; relevant code uses existing pinned client APIs and explicit RLS ownership rather than JWT user metadata.
