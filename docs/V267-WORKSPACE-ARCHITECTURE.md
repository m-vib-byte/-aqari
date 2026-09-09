# AQARI V267 Staging structure

This work is scoped to PR #69 and design/v267-premium-workspace. No production project, domain, user or data is migrated.

| Responsibility | Location |
| --- | --- |
| Entry, lazy integration, display labels | src/v267/workspace.js |
| Pages | src/v267/pages/ |
| Shared components and image processing | src/v267/components/ |
| Session-bound database and Storage requests | src/v267/api/session.js |
| White/gold responsive styling | src/v267/styles/workspace.css |
| Auth and compatibility state adapter | supabase-adapter.js |
| Staging schema and RLS | staging-database/supabase/migrations/ |
| Rolled-back SQL verification | staging-database/tests/ |
| Unit and isolated browser verification | tests/v267-workspace-*.test.cjs and tests/v267-workspace-tools.e2e.mjs |

The existing root entry pages and versioned components retain their URLs and load order. They are still referenced by the application and regression tests. They have not been deleted or moved wholesale. This is a modular boundary for new work, not a claim that the large legacy entry file has already been decomposed.

Controls are persisted per workspace. A general manager can set section availability, role/member read/write overrides, and display labels for Arabic, English, Hindi, Urdu and Malayalam. Role ceilings remain enforced: a viewer is not a writer, and an accountant cannot edit contracts or shares. Manager control access cannot be removed here.

Bulk state is readable directly only by the general manager. Other staff use a server-filtered allowlist of state keys and a merge RPC which preserves hidden keys. Unknown legacy keys are manager-only until explicitly mapped and reviewed. Contract and receipt projections require the related tenant/property read permissions. Direct table policies also enforce section permissions. Tenant ownership policies remain separate.

These controls govern section data and its write path; they are not row-level partner-property assignments. Fine-grained access to a specific partner's properties still needs the independent partner-account model. The five-language editor covers navigation/section labels, not translation of all legacy forms or legal documents.

Scanner requests start from a persisted property, tenant or lease. Image decode/re-encode strips image metadata and creates a compressed JPEG. The browser offers capture, manual crop and rotation; it does not perform OCR, automatic edge detection or malware scanning. Storage is private; originals use generated paths and upsert is forbidden. The caller uploads only their own reserved draft. The saved bytes are downloaded and hashed before finalization, then the document row is read again.

Document metadata and Storage policies are both checked by the server. Direct document finalization through table REST is revoked. Uploaded documents cannot be changed or deleted. The digest records the client's round-trip verification; it is not a server malware-scan certificate. Interrupted drafts remain visible and are never automatically deleted.

No periodic polling, realtime subscription or document-level mutation observer is added. Requests have deadlines and abort on dialog close/auth boundary. Image processing is bounded to 2,400 pixels on its longest output edge; record selectors and audit/document lists are paginated.
