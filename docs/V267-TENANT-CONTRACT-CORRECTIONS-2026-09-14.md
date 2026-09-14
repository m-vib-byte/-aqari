# V267 tenant and contract corrections

Preview continuation of PR 116 after c689c4373e536f849304c9655f804d9e411ce551.
Implements the recovered September 13 tenant and contract instructions in part.

## Implemented in this slice

- A new contract has an inline tenant editor. A blank selection creates a new
  tenant; selecting a saved tenant allows correction. Save verifies both profile
  and tenant-row linkage before selection, preserves the contract draft, and
  requires a saved matching profile before the contract can be submitted.
- Unsaved tenant edits block switching tenants; an explicit discard control is
  provided. Source-imported tenants remain on their existing review path.
- New completed profiles and new contracts require email, passport and English
  nationality in addition to the existing identity fields. Preparation drafts
  remain permissive. Existing contract transitions retain compatibility with
  profiles created under the old validation rules.
- Arabic and English nationality persist into directory data and the annex.
  Optional tenant address is removed from editable controls; historic stored
  address values are retained. Property/floor/unit fields remain separate.
- Main contract display uses Arabic state labels and the requested Kuwait
  weekday/date opening. English tenant names remain in the bilingual annex,
  rather than the main contract. Existing clause wording is not rewritten.
- Main contract displays original rent, excluding discount/current-net rows;
  saved financial calculations and the existing adjustment annex are unchanged.
- New-contract form includes the full first-party name. Approved rendering has
  first-party name/signature and second-party name/civil ID/signature/fingerprint
  blanks. No signature is synthesized. Older missing first-party names remain
  blank for review rather than invented.
- Both approved sets still come from one authoritative saved revision.

## Verification

49 focused tests passed: rental records, print, workspace runtime, scanner entry
and dialog boundary/progress. New tests cover inline profile save/readback,
linkage, preserving existing contracts, lost acknowledgements blocking replay,
inline draft retention, required identity fields and original-rent display.
No hosted tenant or contract write is claimed. No SQL/schema/Production changes.

## Remaining request checklist — not complete

- Three independent owner-editable house/apartment/commercial draft templates.
- Approved full clause text and final Arabic document layout acceptance.
- Separate signed undertaking-to-vacate and unit-receipt documents.
- Official building/premises identifiers and their source-backed entry workflow.
- Owner-set apartment template rent and separate per-commercial-contract rent.
- Automatic serial allocation, end-date calculation and accrual-month workflow.
- Electronic-signature integration; actual device/PDF/physical print acceptance.
- Optional configurable logo/title settings and the separate document composer.

The shared new tenant editor saves a profile separately from the later contract;
it is not an atomic combined save. Lost write replies use the existing guarded
store and require reload/review. Profile edits do not rewrite historical
contract snapshots or uploaded signed originals. Full-155 gate remains HOLD.
