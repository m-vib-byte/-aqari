import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {productionPatch} from './prepare-v267-production.mjs';

if(process.env.VERCEL_ENV==='production'){
  const target=JSON.parse(readFileSync(new URL('../config/production-target.json',import.meta.url),'utf8'));
  const changes=productionPatch(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),target);
  for(const [path,content] of changes)writeFileSync(new URL('../'+path,import.meta.url),content);
  console.log('Prepared V267 production configuration for the preserved domain data source.');
}

execFileSync(process.execPath,['scripts/verify-staging-runtime.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-access.test.cjs','tests/v267-employee-directory-runtime.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-circulars-runtime.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-financial-register.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-production-approval.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-mfa-enforcement.test.cjs','tests/v267-partner-access-mfa-guard.test.cjs','tests/v267-integration-public-metadata-guard.test.mjs'],{stdio:'inherit'});
execFileSync('python',['-m','unittest','tests.accounting_provider_maps_test'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-rent-due-schedule-contract.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-sensitive-delete-guard.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-cancellation-reason-audit.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-monthly-collection-report.test.mjs','tests/v267-monthly-collection-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-server-mutation-audit.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-collector-performance-report.test.mjs','tests/v267-collector-performance-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-operational-report-xlsx.test.mjs','tests/v267-operational-export-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-maintenance-category-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-periodic-maintenance-lifecycle-guard.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,[
  '--test','tests/v267-unit-handover-bundle.test.mjs','tests/v267-unit-handover-pdf-archive.test.mjs','tests/v267-unit-handover-renderer-contract.test.mjs','tests/v267-unit-handover-hosted-contract.test.mjs'
],{stdio:'inherit'});

const previewPython=mkdtempSync(join(tmpdir(),'aqari-v267-handover-python-'));
try{
  execFileSync('python',['-m','pip','install','--disable-pip-version-check','--no-input','--no-cache-dir','--target',previewPython,'-r','requirements.txt'],{stdio:'inherit'});
  execFileSync('python',['-m','unittest','tests.unit_handover_pdf_test','tests.unit_handover_export_test','tests.operational_report_export_test'],{
    stdio:'inherit',env:{...process.env,PYTHONPATH:[previewPython,process.env.PYTHONPATH].filter(Boolean).join(delimiter)}
  });
}finally{rmSync(previewPython,{recursive:true,force:true});}
await import('./check.mjs');
