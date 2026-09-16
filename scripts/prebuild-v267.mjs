import {execFileSync} from 'node:child_process';

const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit',env:process.env});
run(process.execPath,['--test','tests/v267-exact-preview-target.test.mjs']);
run(process.execPath,['scripts/check-v267-integration-readiness.mjs']);
run('python',['-m','unittest','tests.mfa_selftest_test']);
