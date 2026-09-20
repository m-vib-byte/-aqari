import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/v267-contract-admin-recovery.test.mjs','tests/v267-contract-archive.test.mjs','tests/operational-report-request.test.mjs'],{stdio:'inherit'});
