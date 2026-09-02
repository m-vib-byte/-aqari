# Aqari V168 — Supabase Cloud

V168 replaces the demo PIN gates with one Supabase Auth session and stores the core Aqari state in a workspace-scoped JSONB row protected by Row Level Security (RLS).

## First sign-in

1. Open the deployed Aqari site.
2. Enter the authorized manager email and choose a password of at least 10 characters.
3. Select **Create manager account for the first time**.
4. If Supabase sends a confirmation email, confirm it, return to Aqari, and sign in.

Only addresses provisioned out-of-band in the private allowlist can create an account. Email addresses and secret/service-role keys are intentionally not committed to this repository.

## One-time data move

After sign-in, the cloud row is intentionally empty.

- **Upload this device's data** copies the current `aqari_v30` core snapshot to Supabase.
- **Restore cloud** replaces the device's core snapshot with the current cloud version.
- Either successful choice enables automatic sync.
- Every cloud write uses an expected revision and verifies the returned payload before reporting success.
- A revision conflict stops automatic sync instead of overwriting newer cloud data.

The existing local snapshot remains as a recovery cache. Feature-specific `aqari_*` stores and document vault data are not yet part of this core migration.

## Authorization model

- `general_manager`, `property_manager`, and `accountant` may update the workspace state.
- `viewer` is read-only.
- Membership and role are read from PostgreSQL, never from client metadata or a local role selector.
- Anonymous access is denied.
- Clients cannot change workspace IDs, roles, memberships, revisions, or audit fields.
- The browser contains only Supabase's public publishable key. No service-role or secret key is used.

## Migrations

- `20260902214925_v168_supabase_cloud_core.sql`
- `20260902215319_v168_supabase_privilege_hardening.sql`

Authorized users are seeded separately in the private schema so personal account identifiers do not enter Git history.
