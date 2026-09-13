import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
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
// runtime, syntax-check reconciled overlays, then execute their focused suites
// in this exact Preview build. These are build safeguards only; they do not
// establish hosted, physical-device or Production acceptance.
execFileSync(process.execPath,['scripts/verify-staging-runtime.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-access.test.cjs','tests/v267-employee-directory-runtime.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-circulars-runtime.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-financial-register.test.cjs'],{stdio:'inherit'});

// The current PR #75 candidate already carries the Preview/Staging handover archive
// migration. Keep the runtime/export side fail-closed on the same Preview artifact:
// signed source bundle, immutable PDF archive contract, hosted API boundary, evidence
// byte verification and Storage-object anti-reuse must all pass before packaging.
execFileSync(process.execPath,[
  '--test',
  'tests/v267-unit-handover-bundle.test.mjs',
  'tests/v267-unit-handover-pdf-archive.test.mjs',
  'tests/v267-unit-handover-renderer-contract.test.mjs',
  'tests/v267-unit-handover-hosted-contract.test.mjs'
],{stdio:'inherit'});

// Vercel may prepare function wheels under a different interpreter than the build
// command. Install a throwaway interpreter-matched dependency set outside the
// deployment output, run the real Arabic renderer/export tests, then delete it.
const previewPython=mkdtempSync(join(tmpdir(),'aqari-v267-handover-python-'));
try{
  execFileSync('python',['-m','pip','install','--disable-pip-version-check','--no-input','--no-cache-dir','--target',previewPython,'-r','requirements.txt'],{stdio:'inherit'});
  execFileSync('python',['-m','unittest','tests.unit_handover_pdf_test','tests.unit_handover_export_test'],{
    stdio:'inherit',
    env:{...process.env,PYTHONPATH:[previewPython,process.env.PYTHONPATH].filter(Boolean).join(delimiter)}
  });
}finally{
  rmSync(previewPython,{recursive:true,force:true});
}

await import('./check.mjs');
