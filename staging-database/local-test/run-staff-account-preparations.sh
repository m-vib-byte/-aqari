#!/usr/bin/env bash
# Synthetic in-memory PostgreSQL only; accepts no hosted connection or credential.
set -euo pipefail
aqari_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd -- "$aqari_repo"
node staging-database/local-test/run-isolated.mjs \
 staging-database/sql/staff-property-scope.sql \
 staging-database/sql/mfa-enforcement.sql \
 supabase/migrations/20260922134356_v267_staff_membership_ceiling.sql \
 supabase/migrations/20260922134358_v267_staff_account_preparations.sql \
 supabase/migrations/20260922134358_v267_staff_account_preparations.sql \
 staging-database/tests/staff_account_preparations.sql
