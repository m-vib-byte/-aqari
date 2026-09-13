import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {productionPatch} from './prepare-v267-production.mjs';

// Vercel starts from a fresh source checkout. Prepare the production artifact
// inside that build only; Git and every preview retain isolated configuration.
if(process.env.VERCEL_ENV==='production'){
  const target=JSON.parse(readFileSync(new URL('../config/production-target.json',import.meta.url),'utf8'));
  const changes=productionPatch(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),target);
  for(const [path,content] of changes)writeFileSync(new URL('../'+path,import.meta.url),content);
  console.log('Prepared V267 production configuration for the preserved domain data source.');
}

// Candidate-local support reconciliation: verify the unchanged inventoried
// runtime, syntax-check the two reconciled overlays, then execute their focused
// recovery/search suites in the exact Preview build. This is build evidence only
// and does not establish hosted, physical-device or Production acceptance.
execFileSync(process.execPath,['scripts/verify-staging-runtime.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-access.test.cjs','tests/v267-employee-directory-runtime.test.cjs'],{stdio:'inherit'});

await import('./check.mjs');
