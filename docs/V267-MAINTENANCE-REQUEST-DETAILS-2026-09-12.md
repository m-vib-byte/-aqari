# AQARI V267 — maintenance request categories and private photos

Date: 2026-09-12

This follow-up is scoped to the V267 development/Staging line only. It does not target `main`, Production, the production database, the production domain, or historical V266.

## Implemented

- Saved maintenance request category (`general`, electrical, plumbing, air conditioning, elevator, fire safety, other).
- Tenant portal input and readback for the saved category.
- Up to four private maintenance photos per request, with JPEG/PNG/WebP/HEIC/HEIF validation and a 10 MiB per-photo limit.
- Request-scoped private Storage paths in the existing `aqari-documents` bucket.
- Server-side reserve/finalize RPCs with creator, workspace/request access checks, saved-object size/MIME confirmation, SHA-256 readback and immutable uploaded state.
- RLS-backed attachment listing for the authorized tenant or maintenance scope only; no direct authenticated INSERT grant on the metadata table.
- Staff service-desk category display.
- Rollback-only PostgreSQL/PGlite coverage and JavaScript validation/upload tests.

## Staging application performed in this verification run

The additive SQL was applied only to Supabase project `AQARI-V267-Staging` (`djkpkkgoibruaezdrchb`). Post-application readback confirmed:

- `request_type` exists on `public.aqari_maintenance_requests`;
- `public.aqari_maintenance_attachments` exists with RLS enabled;
- reserve/finalize RPCs exist;
- the private maintenance attachment access predicate exists;
- authenticated users have SELECT but no direct INSERT privilege on the attachment metadata table;
- one attachment-table SELECT policy and two Storage policies are installed;
- the existing V267 MFA guard is present;
- there were zero maintenance attachment rows and zero maintenance request rows at the time of structural verification, so no project request records were altered by this schema application.

The source SQL is repeatable for the named policies by dropping/recreating only those V267 maintenance policies inside its transaction. No Production SQL was executed.

## Acceptance boundary

This closes a concrete code/schema gap for requirement G08-01 and advances G07-04, but it is **not** release acceptance by itself. No real tenant/maintenance account was used to create a request or upload a real photo in this run. Physical iPhone/iPad acceptance, the complete 155-item gate, and the full Database/Auth/Storage backup + isolated restore + transaction-preserving rollback gates remain separate and mandatory before Production.
