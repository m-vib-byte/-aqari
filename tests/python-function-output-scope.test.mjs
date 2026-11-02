import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {matchesGlob} from 'node:path';
const config=JSON.parse(readFileSync('vercel.json','utf8'));
test('Python bundle omits build inputs and duplicate dependencies while keeping server assets',()=>{
 const pattern=config.functions['api/*.py'].excludeFiles;
 for(const path of ['public-build/index.html','.vercel_python_packages/reportlab/__init__.py','tests/rent_pdf_test.py','scripts/build-vercel.mjs','docs/report.md','staging-database/sql/follow-up-cloud-compat.sql','supabase/migrations/example.sql','.github/workflows/test.yml','src/v267/main.js'])assert.equal(matchesGlob(path,pattern),true,path);
 for(const path of ['api/rent-receipt.py','lib/rent_pdf.py','lib/release-config.js','lib/pdf_fonts/AqariSans.ttf','lib/official_form_catalog.json','_vendor/reportlab/__init__.py'])assert.equal(matchesGlob(path,pattern),false,path);
 assert.equal(config.outputDirectory,'public-build');
 for(const dir of ['api','lib'])for(const file of readdirSync(dir))if(file.endsWith('.py'))assert.doesNotMatch(readFileSync(dir+'/'+file,'utf8'),/public-build/);
});
test('PDF assets continue to resolve from original server paths',()=>{
 for(const file of ['rent_pdf.py','salary_voucher_pdf.py','official_document_pdf.py'])assert.match(readFileSync('lib/'+file,'utf8'),/pdf_fonts/);
 assert.match(readFileSync('lib/official_document_pdf.py','utf8'),/official_form_catalog\.json/);
 assert.ok(readFileSync('lib/pdf_fonts/AqariSans.ttf').length>0);
 assert.doesNotThrow(()=>JSON.parse(readFileSync('lib/official_form_catalog.json','utf8')));
});
