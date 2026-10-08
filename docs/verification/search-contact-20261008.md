# Authorized contact search — 8 October 2026

R01.05: the authorized rent-office response already includes phone and civil ID, but global search discarded both. The search candidate now matches phone numbers with Arabic/Persian digits and common phone separators (at least eight digits), and exact twelve-digit civil IDs. Matching occurs transiently inside the authorized snapshot; only a boolean match is retained in results. Raw phone/civil values are not copied into the search index, added to result markup, or persisted. Existing account/workspace binding and record revalidation remain intact. Unit directory behavior is unchanged.

Scope: records available in the selected rent-office period. This does not implement a separate complete tenant/contract directory and does not close R01.05 or constitute hosted device acceptance. No SQL, financial records, or archive candidate changes.

Focused tests cover formatted and localized identifiers, rejected short/incorrect IDs, no identifier display, and account changes alongside existing search/unit cases. Browser acceptance is blocked by the previously observed browser security restriction.
