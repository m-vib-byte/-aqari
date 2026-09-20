import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {productionPatch,domainTrialPatch} from './prepare-v267-production.mjs';

execFileSync(process.execPath,['--test','tests/v267-contract-admin-recovery.test.mjs','tests/v267-contract-archive.test.mjs','tests/operational-report-request.test.mjs','tests/v267-contract-view.test.mjs','tests/v267-more-navigation.test.mjs','tests/exact-navigation-events.test.mjs','tests/search-events.test.mjs','tests/assistant-request.test.mjs','tests/v267-hero-record-search.test.mjs','tests/v209-property-search.test.cjs','tests/touch-navigation.test.mjs'],{stdio:'inherit'});
if(process.env.VERCEL_ENV==='production'){
  const trial=JSON.parse(readFileSync(new URL('../config/domain-trial-target.json',import.meta.url),'utf8'));
  if(trial?.enabled===true){const changes=domainTrialPatch(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),trial);for(const [path,content]of changes)writeFileSync(new URL('../'+path,import.meta.url),content);console.log('Prepared myaqari.com trial configuration with the isolated V267 staging data source.');}
  else{const target=JSON.parse(readFileSync(new URL('../config/production-target.json',import.meta.url),'utf8'));const changes=productionPatch(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),target);for(const [path,content]of changes)writeFileSync(new URL('../'+path,import.meta.url),content);console.log('Prepared V267 production configuration for the preserved domain data source.');}
}
console.log('DIAGNOSTIC_INITIAL_TESTS_PASS');
