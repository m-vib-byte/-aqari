import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/v267-contract-view.test.mjs','tests/v267-more-navigation.test.mjs','tests/exact-navigation-events.test.mjs'],{stdio:'inherit'});
