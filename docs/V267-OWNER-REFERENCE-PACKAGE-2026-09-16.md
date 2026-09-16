# AQARI V267 — owner visual/workflow package — 16 Sep 2026

This package starts from the owner-tested navigation repair SHA `e35e3fb13cbde5bb8df5f669f41fe99c46626151`. It is additive: no business data, contract, receipt, maintenance record, permission row, or existing workflow is deleted or replaced by this package.

## Official visual reference

The owner-supplied dashboard image in the active conversation is the visual reference for this slice. Recorded dimensions: **1672 × 941**. Recorded SHA-256: `64d172bd2cbacff945de421c7251c15c3a09723e7a1e7205de1f267bc287921c`.

The implemented visual language follows the reference rather than copying mock data: near-black canvas, warm dark-gold borders, bright-gold emphasis, a fixed right management rail on desktop, compact top search/account controls, dense KPI panels, and responsive iPad/mobile layouts. Existing live values remain the source of displayed numbers.

## Reconciliation before implementation

| Requested area | Existing state found | Package action |
| --- | --- | --- |
| Primary navigation | Fixed on the base SHA by destination verification + section alignment | Preserved unchanged; owner package installs only after the navigation repair installer. |
| New black/gold design | Existing premium layer is light/white-gold | Added a scoped black/gold visual layer and desktop right rail; no routes/data keys changed. |
| Login and permissions | Supabase auth boundary, workspace roles and per-section permissions already exist | Preserved. Login is restyled. Added optional **no-data guest preview** only; no private guest role or data access was invented. |
| Smart assistant | No operational assistant found | Added an in-app command assistant that searches/navigates only currently available workflows and visible KPI summaries. No external AI provider receives property/tenant data. |
| Alerts and tasks | Lease expiry, maintenance plans, notices, follow-up and counters exist separately | Added one task center that reads authorized counters and delegates to the original workflows. |
| Archive and search | Global search and document/financial/original archives already exist | Added one launcher that reuses those surfaces rather than creating a second archive. |
| Reports | KPI dashboard and management counters exist | Added an automatically generated owner report using the same authoritative KPI RPC + counters, with print/PDF path. |
| Approval center | Contract, expense, partner and vacating approvals exist separately; dashboard had only a route placeholder | Added an approval hub that delegates to the existing audited approval workflows. |
| Financial reconciliation | Bank reconciliation already exists and explicitly forbids automatic matching | Preserved; surfaced from the owner package without duplicate matching logic. |
| Tenant timeline | Historical data exists across tenant, lease, payment, maintenance and document records | Added a read-only RLS/session-scoped unified timeline. No mutation API is used. |
| Vacating/final settlement | Existing settlement/release/MFA/audit flow | Preserved and surfaced; no duplicate settlement engine was created. |

## Added files

- `src/v267/owner-reference-runtime.js`
- `src/v267/styles/owner-reference.css`
- `src/v267/pages/owner-task-center.js`
- `src/v267/pages/owner-report.js`
- `src/v267/pages/approval-center.js`
- `src/v267/pages/tenant-timeline.js`
- `scripts/install-v267-owner-reference-package.mjs`
- `tests/v267-owner-reference-package.test.mjs`

The Vercel build command runs the owner package installer only after the existing `scripts/build-vercel.mjs`; that existing build already runs the navigation repair before the package is layered on top.

## Guardrails

- The data-bearing application still requires the existing authenticated boundary and active membership.
- Guest mode is a static feature preview only; it performs no Supabase reads and exposes no tenant/property/financial data.
- Tenant timeline is read-only and respects the existing section permissions and RLS-scoped tables.
- Approval center never approves by itself; it opens the existing audited approval workflows.
- Bank reconciliation remains explicit/manual; this package does not add automatic matching.
- Owner report separates expected from actual values by reusing `aqari_kpi_dashboard`.
- Final AQARI V267 approval remains blocked until the owner completes personal testing and explicitly approves.
