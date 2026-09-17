# AQARI V267 — Owner feedback batch — 2026-09-17

Base: `102f3d17fb25a0b460bde76eb984361682a4ba3e` on `main`.
Work branch: `work/v267-owner-feedback-20260917`.

This batch is additive. It does not delete business data, replace contract/accounting/maintenance workflows, or weaken the existing authentication/data/storage gates.

## Owner feedback addressed in this batch

1. **Navigation blocker** — a new capture-layer router handles all visible legacy main-section buttons and the new sidebar. It uses V205 first, falls back to the preserved base router only when needed, verifies the destination is actually visible, verifies V205 shell context for primary routes, and scrolls only after success. Failure shows an explicit status and does not perform a fake top-of-page jump.
2. **Reference design** — desktop now follows the supplied black/gold reference structure: right navigation rail, top account/search bar, large hero, six KPI cards, alerts/collections/portfolio panels, property cards and quick actions. iPad uses a compact icon rail; iPhone uses a bottom navigation bar. Existing pages receive a clear section header instead of being visually lost in the home context.
3. **Secure login / permissions** — the new shell mounts only after the authenticated membership, data gate and storage gate all match the same user/workspace. Existing server/RLS permissions remain authoritative.
4. **Generative assistant** — client and server integration added. The server re-verifies the JWT, workspace membership, allowed sections and manager-controlled assistant flag before contacting any AI provider. It is read-only and receives only allowed section names plus aggregate visible summaries. Provider credentials remain server-side and are not committed.
5. **Guest mode** — manager-controlled setting, default OFF. Anonymous login-page status reveals only enabled/disabled and always declares `data_access=false`. Guest preview cannot read business records.
6. **Automatic owner report** — manager-controlled channel/schedule/recipient settings plus a server-only delivery endpoint and service-role snapshot RPC are prepared. Delivery is fail-closed until server-side cron and notification-provider secrets are configured.

## Existing functions reused rather than duplicated

- Rental contracts, finance register, bank reconciliation, maintenance, original documents, operational reports, approvals, vacating review and final settlement remain the existing authoritative workflows.
- The existing owner report remains the interactive report source; scheduled delivery uses a bounded service snapshot and does not edit financial records.
- Staff permissions remain in the audited staff/property-scope workflow.

## External activation still required

- A generative AI provider endpoint/model/token must be configured server-side before the assistant can generate answers.
- Automatic report delivery needs a server cron secret plus a notification-provider endpoint/token. Until then it returns `*_NOT_CONFIGURED` rather than pretending delivery succeeded.

Final owner approval remains pending after personal testing and closure of notes.
