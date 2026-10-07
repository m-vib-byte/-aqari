# Deposit contract read boundary — 2026-10-07 Kuwait

Reviewing deposit references exposed a concrete scope defect: changing the picker
set selectedId before the new list read succeeded. A transport failure rerendered
old entries under the newly selected contract and discarded the previous draft.

The picker now passes the requested contract into read without changing the current
selection. The response must have both expected arrays, every entry's lease_id and
snapshot.lease_id must match the requested contract, and nonempty entries must have
a corresponding readable lease option. Only then are the selection and rows committed
together. A successful switch clears the previous draft and prepared receipt URL;
a temporary failed switch keeps the previous verified scope and its draft together.
Access denial still clears private data instead of restoring the old view. Pending
operation recovery continues to use its original contract and retained payload.

## Verification

- Four added runtime cases: failed switch/draft preservation, successful switch and
  receipt disposal, foreign/inconsistent list entries, and denied switch clearing.
- Before fix: 26 passed, 2 failed. After fix: all 28 deposit tests passed.
- Existing lost-reply recovery, exact write readback, refunds, permissions, print
  snapshots and five-language coverage continue to pass.
- The tests run actual page code with DOM/RPC substitutes. The suite is now explicitly
  included in Runtime contracts CI. Runtime inventory and diff checks pass.

No hosted business records, amounts, SQL or grants were changed. No production
publication. Hosted authenticated acceptance and physical-device acceptance remain;
this fix is not completion of deposit quality reporting or the whole deposit feature.
Draft stacked on PR446.
