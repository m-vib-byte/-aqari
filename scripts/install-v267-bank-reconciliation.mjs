import {readFileSync,writeFileSync} from 'node:fs';

const url=new URL('../src/v267/pages/financial-register.js',import.meta.url);
let source=readFileSync(url,'utf8');
const ui=text=>source.includes("t as translateStatic")?"translateStatic('"+text+"')":"'"+text+"'";
const marker="toolbar.append(field("+ui('الفترة المالية')+",month),reload,add);";
if(!source.includes('openBankReconciliation')){
 if(!source.includes(marker))throw Error('V267 bank reconciliation integration anchor not found.');
 source=source.replace(marker,`const bankReconciliation=node('button',${ui('مطابقة التحويلات البنكية')});\n bankReconciliation.type='button';\n bankReconciliation.onclick=()=>d.run(async()=>{const m=await import('./bank-reconciliation.js');d.close();return m.openBankReconciliation();});\n toolbar.append(field(${ui('الفترة المالية')},month),reload,add,bankReconciliation);`);
 writeFileSync(url,source);
 console.log('Installed bounded V267 bank-reconciliation entry in financial register for this build.');
}else console.log('V267 bank-reconciliation entry already present.');

