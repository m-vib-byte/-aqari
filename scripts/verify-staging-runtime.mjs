import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const inventory=JSON.parse(readFileSync(new URL('../FILE_INVENTORY.json',import.meta.url),'utf8')).files;
const paths=['src/v267/components/document-catalog.js','src/v267/components/original-document-upload.js','src/v267/pages/original-documents.js','src/v267/pages/exit-review.js','src/v267/domain/exit-review.js','src/v267/components/exit-translations.js','v202-property-os.js','v206-rent-ledger.js','v267-rental-records.js','src/v267/api/session.js','src/v267/components/verified-upload.js','src/v267/components/tenant-attachment-upload.js','src/v267/components/payment-proof.js','src/v267/pages/document-scanner.js','src/v267/pages/employees.js','src/v267/pages/rental-contracts.js','src/v267/domain/payroll.js','src/v267/domain/salary-slip.js','src/v267/pages/property-notices.js','src/v267/pages/staff-access.js','src/v267/pages/financial-register.js','src/v267/pages/vacating-review.js','src/v267/domain/vacating-review.js','src/v267/pages/deposit-ledger.js','src/v267/domain/deposit-ledger.js','src/v267/components/deposit-translations.js','src/v267/pages/vacating-settlement.js','src/v267/workspace.js','v267-tenant-portal.js','v267-service-desk.js','src/v267/components/translations.js'];
paths.push('src/v267/components/contract-workspace.js','src/v267/components/service-directory.js','src/v267/components/dialog.js');
for(const path of paths){
 const url=new URL('../'+path,import.meta.url),bytes=readFileSync(url),expected=inventory.find(x=>x.path===path);
 if(!expected||bytes.length!==expected.size||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Incomplete or mismatched Staging source: '+path);
 const parsed=spawnSync(process.execPath,['--check',url.pathname],{encoding:'utf8'});
 if(parsed.status!==0)throw Error('Staging syntax check failed: '+path+'\n'+parsed.stderr);
 console.log('VERIFIED '+path+' ('+bytes.length+' bytes)');
}
