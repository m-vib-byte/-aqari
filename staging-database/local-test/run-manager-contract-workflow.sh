#!/usr/bin/env bash
# Synthetic in-memory PostgreSQL only; accepts no hosted connection or credential.
set -euo pipefail
aqari_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd -- "$aqari_repo"
node staging-database/local-test/run-isolated.mjs \
 staging-database/sql/mfa-enforcement.sql \
 staging-database/sql/staff-property-scope.sql \
 staging-database/sql/operations-completion.sql \
 staging-database/sql/unit-readiness.sql \
 staging-database/sql/manager-contract-workflow.sql \
 staging-database/tests/manager_contract_workflow.sql
