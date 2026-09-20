import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/v267-contract-archive.test.mjs'],{stdio:'inherit'});
