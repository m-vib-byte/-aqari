# V267 server mutation audit — 14 Sep 2026

Scope: Preview/Staging only. This advances G07-01 by adding a central immutable server-side metadata trail across the core business write surfaces without duplicating raw sensitive row contents.

## Audit record

`private.aqari_server_mutation_audit` records:

- workspace;
- schema/table and stable entity identity;
- INSERT / UPDATE / DELETE;
- authenticated actor id/name/role, or explicit `system` actor kind;
- names of fields changed by an UPDATE;
- SHA-256 of the before and after row JSON rather than raw row contents;
- transaction id and server timestamp.

The table has RLS enabled, direct access revoked from public/anon/authenticated/service_role, and an immutable UPDATE/DELETE trigger. A manager-only RPC exposes only audit metadata, field names and hashes.

## Bound write surfaces

The trigger is installed on the currently available core tables:

- memberships / permissions;
- leases;
- rent payments;
- uploaded document records;
- maintenance requests;
- financial expenses;
- official-document series;
- work orders.

Cancellation/void reasons remain additionally preserved by the dedicated cancellation audit.

## Hosted isolated-Preview verification

Applied only to `v267-isolated-test` (`ofgmcsmxmdswlovsckqs`) as migration `v267_server_mutation_audit`.

A transaction-scoped acceptance check then:

1. reserved a temporary document against an existing lease through the real document RPC and verified one server audit INSERT row with authenticated actor identity and a 64-character after-hash;
2. executed a membership UPDATE under the same authenticated identity and verified a server audit UPDATE row for that permission surface;
3. rolled the complete transaction back, leaving no test document or membership mutation.

This proves the database trigger path on two distinct write classes. It does not yet prove every historical/optional module write path or full 155/155 acceptance.

`tests/v267-server-mutation-audit.test.mjs` pins the table, privacy, hashes, manager readback and all eight trigger bindings and runs inside the exact Preview build.
