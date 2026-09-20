import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['--test','tests/v267-contract-admin-recovery.test.mjs','tests/v267-contract-archive.test.mjs','tests/operational-report-request.test.mjs','tests/v267-contract-view.test.mjs','tests/v267-more-navigation.test.mjs','tests/exact-navigation-events.test.mjs'],{stdio:'inherit'});
