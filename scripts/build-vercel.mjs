import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const result=spawnSync(process.execPath,['--test','tests/v267-contract-view.test.mjs'],{encoding:'utf8'});
writeFileSync('contract-view-build-diagnostic.txt',[
  'status='+result.status,
  'error='+(result.error?.stack||''),
  result.stdout||'',
  result.stderr||''
].join('\n'));
console.log('Temporary contract-view diagnostic captured.');
