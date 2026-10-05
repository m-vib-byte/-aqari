# Current hosted acceptance and release gaps — 5 October 2026 Kuwait

Base source: `794146f6eb7e2065ffdde0ac680cb499e4404bff` (#406). At 21:21 UTC on 4 October, the production domain returned this SHA, and its session module referenced `djkpkkgoibruaezdrchb`. Preview is `ofgmcsmxmdswlovsckqs`; the recovery clone is `nlqynpmilcdqztwrrvyu`.

## Completed in this review

- 2,405 JavaScript regressions and 198 Python tests passed against the base source.
- The existing in-memory SQL completion run passed 70 test-file executions (62 unique scenario files). This baseline alone did not establish current hosted acceptance.
- Eight of nine historical hosted tests initially failed while preparing outdated fixtures. New copies under `staging-database/hosted-test/completion-current` supply mandatory categories, maintenance before/after evidence, payment references, imported-source provenance and secondary-workspace app state. All original acceptance/rejection assertions remain. The nine scenarios passed on the isolated hosted Preview; vendor identity required no fixture change.
- Post-test readback: zero matching synthetic workspaces/accounts, 43 existing leases, six existing documents. No Production mutations were executed. Preview sequence counters may advance despite rollback.
- Owner acceptance of the contract experience remains valid within its previously recorded scope; it is not replaced by these tests.

## Production parity is not established

A bounded read-only comparison of 51 Preview functions related to maintenance, commercial collections, contact preferences, collection accounts and suppliers found 25 exact body/ACL matches, 13 names/signatures missing in Production and 13 text/ACL differences. A text difference alone is not proof of a behavioral bug; dependencies, triggers and data migrations need individual review. This is not an exhaustive database comparison.

| Function | Production comparison |
|---|---|
| `private.aqari_commercial_payment_allocations_register` | Missing matching signature |
| `private.aqari_commercial_payment_context_data` | Missing matching signature |
| `private.aqari_commercial_sale_reversal_allocation_guard` | Missing matching signature |
| `private.aqari_commercial_sales_register` | Definition/ACL differs; semantic review pending |
| `private.aqari_commercial_statement_data` | Missing matching signature |
| `private.aqari_effective_contact_profile` | Missing matching signature |
| `private.aqari_imported_tenant_read` | Definition/ACL differs; semantic review pending |
| `private.aqari_imported_tenant_save` | Definition/ACL differs; semantic review pending |
| `private.aqari_maintenance_attachment_immutable` | Missing matching signature |
| `private.aqari_maintenance_attachment_storage` | Definition/ACL differs; semantic review pending |
| `private.aqari_maintenance_attachments` | Definition/ACL differs; semantic review pending |
| `private.aqari_maintenance_audit_status` | Missing matching signature |
| `private.aqari_maintenance_locations` | Definition/ACL differs; semantic review pending |
| `private.aqari_maintenance_workflow` | Definition/ACL differs; semantic review pending |
| `private.aqari_preferred_delivery_channel` | Definition/ACL differs; semantic review pending |
| `private.aqari_record_contact_preference` | Missing matching signature |
| `private.aqari_work_order_execution_timestamps_guard` | Missing matching signature |
| `private.aqari_work_order_request_guard` | Missing matching signature |
| `public.aqari_commercial_payment_allocations` | Missing matching signature |
| `public.aqari_commercial_payment_context` | Missing matching signature |
| `public.aqari_commercial_statement` | Missing matching signature |
| `public.aqari_final_gap_register` | Definition/ACL differs; semantic review pending |
| `public.aqari_maintenance_evidence` | Definition/ACL differs; semantic review pending |
| `public.aqari_maintenance_executor_summary` | Definition/ACL differs; semantic review pending |
| `public.aqari_maintenance_report` | Definition/ACL differs; semantic review pending |
| `public.aqari_maintenance_sla` | Definition/ACL differs; semantic review pending |

## Concrete gates still open

- Production: 182 migration records, latest `20261004204804`, 24 Storage objects. Recovery clone: 169 migration records, latest `20261003171839`, 12 Storage objects; its two cron jobs remain disabled. Counts are not backup fingerprints. The October 1 restore report verified six canonical files and retained six duplicates; it cannot prove a current complete restore.
- Two complete recent DB/Auth/Storage backups, actual file hashes, restore configuration and data-preserving recovery remain unverified. The connected Supabase tools do not offer managed-backup listing/download or Storage object download. Do not substitute table metadata or two copies of one incomplete export for this gate.
- Production integration configs, property channels, integration outbox and delivery events each have zero rows. Vercel environment metadata exposes only an `OPENAI_API_KEY` entry targeted to Production. This does not rule out credentials elsewhere, but does not establish KNET/email/WhatsApp operation. No external send or payment was attempted.
- Missing original property/contact/location data, source-document reconciliation and actual iPad/Desktop/physical printing acceptance remain separate. Do not fabricate missing values or infer these from contract acceptance.

## Safe continuation

1. Use an authorized complete backup route; verify both recent snapshots and recover to an isolated target with sending/scheduling disabled. Preserve the existing clone until comparison is complete.
2. For each missing/different function, review its repository migration and dependencies against the actual Production schema. Prepare a reviewed, data-preserving migration set; do not blindly replay Preview migration history or weaken guards.
3. Run the same current acceptance scenarios in the recovered isolated target, verify real file bytes and business-record fingerprints, then carry out any authorized Production migration.
4. Complete approved provider configuration and an explicitly authorized delivery/payment acceptance separately. Record CI, deployment, migrations and owner/device acceptance independently.

The fixture/CI change is prepared locally; it does not deploy or migrate the application. No secrets, Production records or backup payloads are included in the repository.

