import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {productionPatch} from './prepare-v267-production.mjs';

function runNode(args,label){
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});
  if(result.status!==0)throw new Error(`${label} failed with exit ${result.status??'unknown'}`);
}

// Vercel starts from a fresh source checkout. Prepare the production artifact
// inside that build only; Git and every preview retain isolated configuration.
if(process.env.VERCEL_ENV==='production'){
  const target=JSON.parse(readFileSync(new URL('../config/production-target.json',import.meta.url),'utf8'));
  const changes=productionPatch(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),target);
  for(const [path,content] of changes)writeFileSync(new URL('../'+path,import.meta.url),content);
  console.log('Prepared V267 production configuration for the preserved domain data source.');
}

// Keep audited finance guards and recent-MFA enforcement executable on the
// exact hosted artifact. These checks are code/static contracts only; they do
// not replace real-account, physical-device, backup/restore, rollback, or final
// owner acceptance gates.
runNode(['--check','src/v267/pages/operations-center.js'],'operations-center syntax check');
runNode(['--test','tests/v267-petty-cash-close.test.cjs'],'petty-cash close contract test');
runNode(['--test','tests/v267-petty-cash-invoice-guard.test.cjs'],'petty-cash invoice guard contract test');
runNode(['--test','tests/v267-mfa-enforcement.test.cjs'],'recent MFA contract test');
await import('./check.mjs');
