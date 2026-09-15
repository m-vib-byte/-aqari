import fs from 'node:fs';
import {verifyDeploymentTarget} from './verify-deployment-target.mjs';
import './install-v267-official-exit-notice.mjs';

// Run before a Vercel build can publish an artifact with the wrong data source.
verifyDeploymentTarget();

const requiredFiles = [
  'index.html',
  'vercel.json',
  'api/health.js',
  'api/release.js',
  'api/config-status.js',
  '.env.example',
  'staging-database/sql/official-commercial-statement-20260915.sql',
  'src/v267/components/official-extra-forms.js',
  'src/v267/support/official-exit-notice-patch.js',
  'staging-database/supabase/migrations/20260915094500_v267_official_exit_notice_source.sql',
  'staging-database/supabase/migrations/20260915094600_v267_official_exit_notice_context.sql',
  'staging-database/supabase/migrations/20260915094700_v267_official_discount_approval_source.sql',
  'staging-database/supabase/migrations/20260915094800_v267_official_discount_approval_context.sql',
  'staging-database/supabase/migrations/20260915094900_v267_official_extra_forms_source_fix.sql'
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    failed = true;
  }
}

const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('V198')) {
  console.error('index.html does not contain V198 release marker');
  failed = true;
}

const commercialStatement = fs.readFileSync('staging-database/sql/official-commercial-statement-20260915.sql','utf8');
for (const marker of ['aqari_commercial_collections','aqari_commercial_collection_reversals','aqari_assert_commercial_collections','commercialCollectionsIncluded','camIncluded']) {
  if (!commercialStatement.includes(marker)) {
    console.error(`Unified commercial statement missing: ${marker}`);
    failed = true;
  }
}
if (commercialStatement.includes('DOCUMENT_COMMERCIAL_RECONCILIATION_REQUIRED')) {
  console.error('Unified commercial statement regressed to blanket commercial rejection');
  failed = true;
}

const officialCenter=fs.readFileSync('src/v267/pages/official-document-center.js','utf8');
for(const marker of ['AQARI_V267_EXIT_NOTICE_FORM','EXTRA_OFFICIAL_FORM_TEMPLATES','renderExtraOfficialForm']){
  if(!officialCenter.includes(marker)){console.error(`Official extra form overlay missing: ${marker}`);failed=true;}
}
const extraForms=fs.readFileSync('src/v267/components/official-extra-forms.js','utf8');
for(const marker of ['exit_notice','discount_approval','اعتماد خصم','فترة الخصم']){
  if(!extraForms.includes(marker)){console.error(`Official extra form definition missing: ${marker}`);failed=true;}
}
const exitSource=fs.readFileSync('staging-database/supabase/migrations/20260915094500_v267_official_exit_notice_source.sql','utf8');
const exitContext=fs.readFileSync('staging-database/supabase/migrations/20260915094600_v267_official_exit_notice_context.sql','utf8');
for(const marker of ["k='exit_notice'",'DOCUMENT_VACATING_RECORD_REQUIRED','aqari_vacating_settlements','vacateDate']){
  if(!exitSource.includes(marker)){console.error(`Official exit notice source missing: ${marker}`);failed=true;}
}
for(const marker of ["p_kind<>'exit_notice'",'source_required',"'entity_type','lease'",'aqari_official_source']){
  if(!exitContext.includes(marker)){console.error(`Official exit notice context missing: ${marker}`);failed=true;}
}
const discountSource=fs.readFileSync('staging-database/supabase/migrations/20260915094700_v267_official_discount_approval_source.sql','utf8');
const discountFix=fs.readFileSync('staging-database/supabase/migrations/20260915094900_v267_official_extra_forms_source_fix.sql','utf8');
for(const marker of ['discount_approval','DOCUMENT_NO_SAVED_DISCOUNT','aqari_rent_period_breakdown','approvedBy']){
  if(!discountSource.includes(marker)){console.error(`Discount approval source missing: ${marker}`);failed=true;}
}
for(const marker of ['lease_row','DOCUMENT_NO_SAVED_DISCOUNT','rentAdjustments']){
  if(!discountFix.includes(marker)){console.error(`Discount approval source fix missing: ${marker}`);failed=true;}
}

if (failed) process.exit(1);
console.log('AQARI V198 package check: PASS');
