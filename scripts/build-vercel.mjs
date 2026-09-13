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

// Candidate-local operational recovery from the latest PR #75-based support line.
execFileSync(process.execPath,['scripts/verify-staging-runtime.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-access.test.cjs','tests/v267-employee-directory-runtime.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-circulars-runtime.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-financial-register.test.cjs'],{stdio:'inherit'});

// Owner governance dated 13 Sep 2026 remains fail-closed.
execFileSync(process.execPath,['--test','tests/v267-owner-production-approval.test.mjs'],{stdio:'inherit'});

// Security/integration reconciliation: recent MFA, partner grants, nested-secret
// protection and provider-neutral accounting journal maps. Passing these is code
// evidence only and does not constitute hosted/provider or Production acceptance.
execFileSync(process.execPath,['--test','tests/v267-mfa-enforcement.test.cjs','tests/v267-partner-access-mfa-guard.test.cjs','tests/v267-integration-public-metadata-guard.test.mjs'],{stdio:'inherit'});
execFileSync('python',['-m','unittest','tests.accounting_provider_maps_test'],{stdio:'inherit'});

// Lock the authoritative monthly rent-due ledger contract into the exact Preview
// build. This proves source/runtime structure only; hosted real-account acceptance
// and database migration evidence remain separate release-gate requirements.
execFileSync(process.execPath,['--test','tests/v267-rent-due-schedule-contract.test.cjs'],{stdio:'inherit'});

// Sensitive business rows are cancellation/reversal-only. The exact Preview build
// must fail if the database source stops rejecting direct DELETE for any protected
// contract, payment, document, expense or official-document series.
execFileSync(process.execPath,['--test','tests/v267-sensitive-delete-guard.test.mjs'],{stdio:'inherit'});

// Every cancellation/void must preserve a reason, actor and timestamp in the
// immutable cancellation audit; direct document cancellation without the reason-
// backed RPC is rejected.
execFileSync(process.execPath,['--test','tests/v267-cancellation-reason-audit.test.mjs'],{stdio:'inherit'});

// Monthly property collection statements use the persisted due schedule as the
// denominator, cap the percentage numerator at due and expose discounts,
// remaining balance and overpayment separately in the user-facing report.
execFileSync(process.execPath,['--test','tests/v267-monthly-collection-report.test.mjs','tests/v267-monthly-collection-ui.test.mjs'],{stdio:'inherit'});

// Core business writes, approvals and permission mutations must leave immutable
// server-side metadata with actor, operation, changed field names and before/after
// hashes without duplicating raw sensitive row contents.
execFileSync(process.execPath,['--test','tests/v267-server-mutation-audit.test.mjs'],{stdio:'inherit'});

// Collector performance uses authenticated actor attribution for new payments,
// preserves legacy names as unmatched until a manager performs a recent-MFA alias
// mapping, excludes cancelled receipts, and separates explicitly classified
// settlements from ordinary collection operations.
execFileSync(process.execPath,['--test','tests/v267-collector-performance-report.test.mjs','tests/v267-collector-performance-ui.test.mjs'],{stdio:'inherit'});

// Signed unit-handover runtime and archive boundary.
execFileSync(process.execPath,[
  '--test',
  'tests/v267-unit-handover-bundle.test.mjs',
  'tests/v267-unit-handover-pdf-archive.test.mjs',
  'tests/v267-unit-handover-renderer-contract.test.mjs',
  'tests/v267-unit-handover-hosted-contract.test.mjs'
],{stdio:'inherit'});

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
