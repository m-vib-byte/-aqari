import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/v267-contract-view.test.mjs'],{stdio:'inherit'});
