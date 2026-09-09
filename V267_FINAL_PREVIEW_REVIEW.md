# AQARI V267 — preview review

Status: preview only; production domain and V266 are unchanged.

Implemented:
- Shared first-paint styling for login, session restoration, recovery and authenticated sections; new login layout.
- Legacy standalone HTML entrances route to the authenticated V267 app.
- iPhone safe-area styling and five fixed navigation destinations remain in the requested order.
- Dashboard mutation work skips its own output and property/menu interactions; partner engine loads on demand.
- Optional property partners with Arabic-digit input, exact 100% validation, stable partner IDs, cloud persistence using workspace authorization and revision conflict checks.
- Cumulative recorded cash income/expense allocations in fils; delta-only distribution; historical ownership snapshots; partner statements and recorded payments bounded by payable balance.
- Prior distributions remain unchanged after ownership edits. Later financial corrections are recorded as new allocation events.

Validation:
- 416 Node tests pass, including new allocation, rounding, ownership, duplicate-distribution, payment-limit and correction tests.
- Existing authentication and session implementation unchanged.
- A successful real iPhone/Safari login, navigation and visual review has NOT been established. The cloud browser is waiting at GitHub sign-in for Vercel preview access. The current browser interface does not expose iPhone/Safari device emulation.
- Protected imported property contexts intentionally omit expense records. Allocation is disabled for those properties until complete expense sources are available; zero expenses must not be inferred. Ownership setup and historical statements remain available.
- No live ownership/distribution records were created during testing.
- The audit list records before/after ownership and actor/time in the existing workspace state. It is not a separate tamper-proof accounting journal.
- Requires authenticated visual review across phone, tablet and desktop before final approval.
