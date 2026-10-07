# Independent official-document kind counters

Candidate only; production unchanged. Existing globally shared numbering is split by kind while retaining global scope across properties/workspaces and never resetting by year. A different scope per property/workspace remains an explicit acceptance decision under R08.08, not an implicit change here.

The private counter uses an atomic INSERT ON CONFLICT UPDATE RETURNING, serializing allocations of each kind. New numbers include the exact uppercase kind to keep different counters distinct under the existing global document-number uniqueness constraint. Existing reservations, issued documents and their numbers are unchanged. Replaying an existing request returns its original number under the existing workspace lock, identity, entity and MFA checks. The UI accepts both legacy and typed numbers, and refuses a typed number from a different kind. Deploy UI with the SQL; old UI cannot accept newly typed numbers.

The migration v267_official_document_kind_counters was applied to isolated Preview only. A rollback transaction exercised interleaved allocations of two kinds, monotonic same-kind allocation, prefix binding, invalid-kind rejection, unchanged historical reservation hash, and denied direct browser-role execution of the private allocator. Test counter writes were rolled back. The actual form tests cover lost replies with one reservation, exact stored readback, wrong-kind rejection, and old-number compatibility.

Remaining: authenticated end-to-end issuance through the exact candidate; real concurrent connections; final numbering-scope acceptance; physical-device acceptance. No production deployment, business document issuance, new accounts, public grants or paid resources were performed.
