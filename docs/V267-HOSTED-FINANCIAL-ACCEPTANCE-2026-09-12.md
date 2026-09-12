# Hosted financial acceptance — 12 September 2026

Release gate: **HOLD**. Authorization to finish and publish is already granted; full acceptance remains conditional on all 155 requirements, authenticated workflows, physical devices, complete Database/Auth/Storage-byte backup, isolated restoration, and transaction-preserving V266 rollback.

## Verified target and actual changes

The browser and server configuration at source commit `29f643fd6430387c58239e3a241252915899e2b9` targets the independent Supabase branch `ofgmcsmxmdswlovsckqs` (`v267-isolated-test`, parent `djkpkkgoibruaezdrchb`). The protected parent and V266 database were not modified.

| Hosted migration | Effect |
|---|---|
| `20260912121436_v267_hosted_financial_close_cancellations` | Excludes native and registered cancellations from future financial closes and KPIs. |
| `20260912121543_v267_hosted_final_gap_readback_hardening` | Restores saved posting/allocation/cancellation readback and serializes financial writes with the existing period-close lock. |
| `20260912121938_v267_native_cancelled_receipt_guards` | Rejects posting a natively cancelled receipt or creating another reversal from it; excludes it from payment choices, collector totals and rating payment evidence. |

The third migration changes source code in `staging-database/sql/final-gap-readback-hardening.sql`. Its regression is included in the existing `staging-database/tests/financial_close_cancellations.sql`. All three migrations preserve existing records and snapshots. Ownership, empty search_path and the existing manager/AAL2 checks remain; anonymous execution is denied.

## Actual hosted regression results

The self-contained SQL files under `staging-database/hosted-test/` create a separate temporary workspace inside a transaction. They neither reuse the owner's workspace nor create password-bearing login credentials. Every fixture rolls back; no external notification is sent.

1. Before the close fix, the hosted regression failed: expected **50.125 KWD**, got **225.125 KWD**; KPI returned **150.125 KWD**.
2. After the total fix, the same test exposed **CLOSED_PAYMENT_CANCELLATION_ACCEPTED**. Applying the readback/period-lock upgrade corrected this second defect.
3. An added negative test exposed **NATIVE_CANCELLED_PAYMENT_POSTED**. The third migration now rejects that posting with **CANCELLED_PAYMENT_POSTING**, rejects another reversal with **ALREADY_CANCELLED_RECEIPT**, and removes the cancelled receipt from the visible payment selection.
4. The final close suite passed against hosted PostgreSQL: 50.125 KWD and one valid January receipt; 950.125 KWD collector total including February's 900 KWD; native and registered cancellations excluded; immutable prior/current snapshots; audited close; manager/accountant and closed-period guards; original payment evidence preserved.
5. The separate hosted register suite passed: bank-account/save/readback, posting, reserve over-release refusal, credit allocation and over-allocation refusal, tenant/lease/month scope, cancellation/readback, tenant feed and role isolation.

Post-test inspection found **zero fixture users and zero fixture workspaces**. The original account and stored attachment remain.

| Preserved relation | MD5 before and after |
|---|---|
| Workspaces | `e607b6b13585d95048358485e0321ea0` |
| Rent payments | `7d96b8df6e03a1b99473400ab9f302df` |
| Financial periods | `d751713988987e9331980363e24189ce` |
| Document metadata | `2d8e77b852cc01b7b362b5e30e83cfb4` |

These fingerprints compare sorted row representations; they are integrity comparisons, **not a data backup or restoration test**. Auth-user count stayed 1 and Storage-object count stayed 1. Private/RLS tables intentionally deny direct access; the advisor still reports informational no-policy findings and authenticated SECURITY DEFINER notices. No zero-advisory claim is made.

## Remaining work and specific access limits

- Preview protection access was already repaired with short-lived GitHub OIDC. [Verified hosted CI run](https://github.com/m-vib-byte/-aqari/actions/runs/34692363054), attempt 2, matched the source SHA above. This is signed-out hosted/browser-engine evidence, not real-user acceptance.
- The current server `codex-bold-flint-5569` (droplet 599379085) is active. Opening its existing Web Console access page returned **Site Unavailable**. `/root/workspace/aqari` could not be inspected and was not modified; no server was created, deleted, rebuilt or accessed over external SSH.
- The independent branch still lacks the code's unit-readiness, financial-archive and PDF-byte-archive migrations. Their application and hosted workflows remain open.
- An existing `v267_staging_backup_20260912` schema contains in-database application table copies. It is not an external complete backup, excludes the necessary Auth/Storage-byte proof, and does not prove isolated restoration.
- Opening the Supabase project dashboard reached its sign-in page. The connected SQL tools work, but they do not provide managed backup export/restore or attachment-byte export. Secure dashboard authentication is needed to investigate that provider path; passwords/codes must not be put in chat.
- Authenticated owner/collector/accountant/tenant/partner journeys, physical iPhone/iPad/desktop use, provider delivery/K-Net, source discrepancies, complete backups/restoration and V266 rollback remain unaccepted. No production/domain change was made.

The requirements matrix now links the financial subset to this hosted evidence. All 155 requirements remain in the acceptance register; this report does not declare any full-platform acceptance.
