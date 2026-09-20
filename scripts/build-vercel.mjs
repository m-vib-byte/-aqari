import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/v267-contract-admin-recovery.test.mjs'],{stdio:'inherit'});
