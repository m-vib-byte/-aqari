import {execFileSync} from 'node:child_process';

const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit',env:process.env});
run(process.execPath,['--test','tests/v267-exact-preview-target.test.mjs']);
run(process.execPath,['--test','tests/v267-owner-production-approval.test.mjs']);
run(process.execPath,['--test','tests/v267-runtime-release-contract.test.mjs']);
run(process.execPath,['--test','tests/v267-requirements-155-evidence.test.mjs']);
run(process.execPath,['--test','tests/v267-production-config-gate.test.mjs']);
run(process.execPath,['--test','tests/v267-stage-c-release-bundle-gate.test.mjs']);
run(process.execPath,['--test','tests/v267-payment-cycle-prepaid.test.mjs']);
run(process.execPath,['--test','tests/v267-prepaid-period-canonical.test.mjs']);
run(process.execPath,['scripts/check-v267-integration-readiness.mjs']);
run('python',['-m','unittest','tests.mfa_selftest_test']);
run('python',['-m','unittest','tests.property_statement_source_charge_totals_test']);
run('python',['-m','unittest','tests.storage_byte_manifest_test']);
run('python',['-m','unittest','tests.backup_set_manifest_test']);
run('python',['-m','unittest','tests.restore_equivalence_test']);
run('python',['-m','unittest','tests.rollback_rehearsal_test']);
run('python',['-m','unittest','tests.stage_c_evidence_bundle_test']);
