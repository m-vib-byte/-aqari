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
execFileSync(process.execPath,['scripts/verify-staging-runtime.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-contract-entry-routing.test.mjs','tests/v267-contract-template-legacy-entry.test.mjs','tests/v267-mutable-asset-delivery.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-property-portfolio-additions.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/pages/property-portfolio-additions.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-rental-document-cycle.test.mjs','tests/v267-rental-document-layout.test.mjs','tests/v267-rental-template-starters.test.mjs','tests/v267-saved-contract-viewer.test.mjs','tests/v267-rental-document-composer.test.mjs','tests/v267-contract-template-prefill.test.mjs','tests/v267-rental-templates.test.mjs','tests/v267-rental-records.test.cjs','tests/v267-full-page-workspace.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-session-activity-routing.test.cjs','tests/v267-session-idle-restore.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/install-v267-property-ownership.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/install-v267-maintenance-evidence.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/install-v267-bank-reconciliation.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/install-v267-partner-owner-fields.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/install-v267-partner-property-finance.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/pages/property-ownership.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/pages/maintenance-evidence.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/pages/bank-reconciliation.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/api/partner-session.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','v267-partner-portal.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/components/partner-property-finance-view.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-document-stored-visual-review.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-access.test.cjs','tests/v267-employee-directory-runtime.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-staff-circulars-runtime.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-financial-register.test.cjs','tests/v267-bank-reconciliation-current.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-partner-current-authorization.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-production-approval.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-mfa-enforcement.test.cjs','tests/v267-partner-access-mfa-guard.test.cjs','tests/v267-integration-public-metadata-guard.test.mjs','tests/v267-recent-mfa-hosted-evidence.test.mjs'],{stdio:'inherit'});
execFileSync('python',['-m','unittest','tests.accounting_provider_maps_test'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-rent-due-schedule-contract.test.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-sensitive-delete-guard.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-cancellation-reason-audit.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-rent-receipt-pdf-archive.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-monthly-collection-report.test.mjs','tests/v267-monthly-collection-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-server-mutation-audit.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-collector-performance-report.test.mjs','tests/v267-collector-performance-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-operational-report-xlsx.test.mjs','tests/v267-operational-export-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-maintenance-category-ui.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-periodic-maintenance-lifecycle-guard.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-service-directory.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-navigation-matrix.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/install-v267-section-target-navigation.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-contract-entry-routing.test.mjs','tests/v267-contract-foundation.test.mjs','tests/v267-contract-finalization.test.mjs','tests/v267-system-rental-template-source.test.mjs','tests/v267-property-master-file.test.mjs','tests/v267-property-onboarding.test.mjs','tests/v267-property-cost-allocation.test.mjs','tests/v267-property-asset-categories.test.mjs','tests/v267-property-controls.test.mjs','tests/v267-property-controls-sql-fix.test.mjs','tests/v267-property-batch-a2.test.mjs','tests/v267-unit-create-validation.test.mjs','tests/v267-property-shortcuts.test.mjs','tests/v267-quick-tenant-entry.test.mjs','tests/v267-maintenance-request-create.test.mjs','tests/v267-finance-owner-b3.test.mjs','tests/v267-tenant-property-technicians.test.mjs','tests/v267-property-ownership-area.test.mjs','tests/v267-maintenance-sla-current.test.mjs','tests/v267-domain-trial-target.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-dialog-progress.test.mjs','tests/v267-management-counters.test.mjs','tests/v267-management-counters-runtime.test.mjs','tests/v267-kpi-dashboard.test.cjs','tests/v267-utility-history-runtime.test.mjs','tests/v267-unit-meter-runtime.test.mjs','tests/payment-proof.test.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-unit-handover-bundle.test.mjs','tests/v267-unit-handover-pdf-archive.test.mjs','tests/v267-unit-handover-renderer-contract.test.mjs','tests/v267-unit-handover-hosted-contract.test.mjs'],{stdio:'inherit'});
const previewPython=mkdtempSync(join(tmpdir(),'aqari-v267-handover-python-'));
try{execFileSync('python',['-m','pip','install','--disable-pip-version-check','--no-input','--no-cache-dir','--target',previewPython,'-r','requirements.txt'],{stdio:'inherit'});execFileSync('python',['-m','unittest','tests.unit_handover_pdf_test','tests.unit_handover_export_test','tests.operational_report_export_test','tests.contract_template_pdf_test','tests.contract_template_preview_test','tests.rental_document_layout_test','tests.rental_document_issue_test'],{stdio:'inherit',env:{...process.env,PYTHONPATH:[previewPython,process.env.PYTHONPATH].filter(Boolean).join(delimiter)}});}finally{rmSync(previewPython,{recursive:true,force:true});}
await import('./check.mjs');
