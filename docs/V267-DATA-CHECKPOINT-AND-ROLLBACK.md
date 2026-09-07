# Staging checkpoint and data-source gate

Checkpoint made on 2026-09-07 before the workspace-control migrations:

- Staging project: djkpkkgoibruaezdrchb.
- Existing preview code: 501e755edbb489b99cdcbc3d3d12a0381b952769.
- Independent JSON checkpoint retained privately outside the repository.
- Public business tables, current app-state payload, memberships/profiles/workspace, policies and startup definition were captured.
- The existing migration files provide the prior schema. Password hashes, access tokens and service keys are not in the checkpoint.
- Properties, units, tenants, leases, collections, documents, maintenance and audit tables were empty. One authorized account and workspace were present.
- This is an application-data checkpoint, not a full managed PostgreSQL or Auth backup. A full restore has not been tested.

No approved independent export has been identified. Search found older spreadsheet and HTML artifacts, but these are not assumed to be the authoritative dataset. No data has been imported, manually fabricated, or copied from Production. No Production connection was opened.

Before an import:

1. The owner identifies or provides the independent authoritative export and confirms its scope.
2. Preserve that original unchanged and record a SHA-256 digest; rerun the Staging checkpoint.
3. Use lib/v267/migration-preflight.js to inspect links, duplicates, civil IDs, contract dates, receipts and historical payments. Report deficiencies; do not invent missing fields or relabel historical contracts as new cloud contracts.
4. Approve an explicit mapping and preserve historical receipts/attachments. Import only into this isolated Staging project, in a transaction where supported, with count/link/total readback.
5. Verify the real account and device flow before acceptance. Production is outside this procedure.

Rollback:

- Stop new Staging writes during investigation and capture any records added since this checkpoint.
- Revert the optional workspace/scanner UI changes on the same preview branch if needed; keep the filtered-state adapter and security policies together. Do not roll back the UI adapter alone to a version that expects bulk reads for all roles.
- Prefer a forward correction to the additive schema. Do not drop audit, documents, ACL tables, or reopen bulk access to recover a UI issue.
- Original metadata and files are immutable; rollback never deletes them. Any data restoration requires reconciliation against the newer checkpoint and explicit review of new records.
- V266, its database and myaqari.com are not rollback targets and remain outside this work.
