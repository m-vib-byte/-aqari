# Maintenance reconciliation — review only

The captured Production application schema lacks `category_code`, which current
maintenance pages select and submit, and the request/work-order link upgrade.
This candidate is outside automatic migration directories. It is not installed.

It reuses the category and work-order canonical SQL with one adaptation: a
constant default adds the category column without a blanket UPDATE of historical
requests. Existing `request_type`, timestamps, revisions and business fields are
preserved. Historical category remains explicitly `legacy_unclassified`.
No mapping between the two different category vocabularies is invented.

Exact function fingerprints and absent-object checks reject unexpected schema
shapes and repeat installation. The canonical link checks refuse inconsistent
historical links; they never rewrite them. Existing request snapshots remain NULL.
The original operations entry body is retained privately, including the petty-cash
invoice guard; it remains inaccessible directly to clients.

Run from the repository root:

```
python3 scripts/build-production-maintenance-reconciliation.py
node scripts/verify-production-maintenance-reconciliation.mjs
```

The rehearsal uses synthetic records in local PGlite against the captured application
catalog. It tests request/property/unit/revision checks, role isolation, immutable
links, and historical row preservation. It does not represent hosted Storage,
physical iPhone/iPad/Desktop use, or a current complete database backup.
The local runner optionally restores the ten captured Production Storage SQL
policies and client DML ACL on its object metadata stub. The attachment suite now
passes with these exact policies, including same-property tenant isolation, staff
read scope, revoked tenant denial, and refusal to overwrite/delete originals.
This fixes a missing local test layer; it changes no hosted permissions. Provider
triggers, HTTP uploads, file bytes and real devices remain outside this model.

Before installation: refresh catalog fingerprints, verify complete backup/restore,
rehearse on the isolated hosted database, review security advisors, generate the
formal migration, and verify runtime behavior on the approved deployment.
