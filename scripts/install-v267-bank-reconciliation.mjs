import {readFileSync,writeFileSync} from 'node:fs';

const url=new URL('../src/v267/pages/financial-register.js',import.meta.url);
let source=readFileSync(url,'utf8');
const marker="toolbar.append(field('الفترة المالية',month),reload,add);";
if(!source.includes('openBankReconciliation')){
 if(!source.includes(marker))throw Error('V267 bank reconciliation integration anchor not found.');
 source=source.replace(marker,`const bankReconciliation=node('button','مطابقة التحويلات البنكية');\n bankReconciliation.type='button';\n bankReconciliation.onclick=()=>import('./bank-reconciliation.js').then(m=>m.openBankReconciliation()).catch(error=>d.status.textContent=error?.message||'تعذر فتح المطابقة البنكية.');\n toolbar.append(field('الفترة المالية',month),reload,add,bankReconciliation);`);
 writeFileSync(url,source);
 console.log('Installed bounded V267 bank-reconciliation entry in financial register for this build.');
}else console.log('V267 bank-reconciliation entry already present.');
