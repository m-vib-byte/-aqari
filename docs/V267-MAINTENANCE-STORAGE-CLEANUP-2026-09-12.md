# AQARI V267 — Maintenance failed-upload cleanup — 12 Sep 2026

Scope: isolated AQARI-V267-Staging and review branch only. Production, main and V266 were not modified.

A hosted acceptance attempt reproduced the current Supabase Storage safeguard: direct SQL deletion from `storage.objects` is rejected with `Direct deletion from storage tables is not allowed. Use the Storage API instead.` The previous cleanup RPC therefore could not safely remove an uploaded object after a later finalize failure.

The repair moves byte deletion to the authenticated Supabase Storage `remove()` API, adds a DELETE RLS policy limited to the creator's draft maintenance attachment and the same authorized maintenance request, and changes the metadata cancellation RPC to refuse cancellation while Storage bytes still exist. If Storage cleanup fails, draft metadata remains instead of falsely claiming cleanup. The original upload/finalize error is still rethrown to the caller.

Hosted Staging verification after the database repair:
- cancellation of a reserved draft with no stored object passed and the transaction was rolled back;
- cancellation while a matching stored object still existed was rejected with `STORAGE_OBJECT_STILL_PRESENT`, the metadata stayed `draft`, and the transaction was rolled back;
- `anon` has no execute permission on the cancellation RPC; authenticated execution remains guarded by creator identity and request access.

The browser regression now requires Storage removal before metadata cancellation and proves a failed Storage removal does not invoke the cancellation RPC. Full browser Storage API acceptance still depends on the matching Preview and authenticated session; it is not claimed by the SQL checks above.
