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

// Keep the editable-contract support artifact fail-closed: the exact source
// Vercel is packaging must pass its focused domain/RLS contract tests.
execFileSync(process.execPath,['--test','tests/contract-template-drafts.test.mjs'],{stdio:'inherit'});

// The same Preview artifact must also preserve the signed move-out handover
// bundle, PDF archive integrity rules and Arabic renderer contract. These are
// focused build-time safeguards only; hosted authenticated/device acceptance
// remains a separate owner gate.
execFileSync(process.execPath,[
  '--test',
  'tests/v267-unit-handover-bundle.test.mjs',
  'tests/v267-unit-handover-pdf-archive.test.mjs',
  'tests/v267-unit-handover-renderer-contract.test.mjs'
],{stdio:'inherit'});

// Exercise the real ReportLab/Arabic shaping renderer in the exact Vercel
// build, not only its static source contract. This produces no hosted writes.
execFileSync('python',['-m','unittest','tests.unit_handover_pdf_test'],{stdio:'inherit'});

await import('./check.mjs');
