#!/usr/bin/env bash
# PostgreSQL in memory only. Never accepts a hosted URL or database credential.
# Requires @electric-sql/pglite@0.5.8 (local-test/package-lock.json), or set
# AQARI_PGLITE_MODULE to the installed package's absolute dist/index.js.
set -euo pipefail
aqari_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd -- "$aqari_repo"
node staging-database/local-test/run-isolated.mjs \
 staging-database/tests/template_library_setup.sql \
 staging-database/sql/mfa-enforcement.sql \
 staging-database/sql/staff-property-scope.sql \
 staging-database/sql/operations-completion.sql \
 staging-database/sql/final-gap-register.sql \
 staging-database/supabase/migrations/20260913095018_v267_contract_template_drafts.sql \
 staging-database/sql/rental-contract-templates.sql \
 staging-database/sql/system-rental-template-source.sql \
 staging-database/sql/property-master-file.sql \
 staging-database/supabase/migrations/20260920193000_v267_contract_template_studio.sql \
 staging-database/tests/template_library_legacy_fixture.sql \
 staging-database/supabase/migrations/20260921090251_v267_template_families_a4_archive.sql \
 staging-database/tests/template_library_archive.sql
