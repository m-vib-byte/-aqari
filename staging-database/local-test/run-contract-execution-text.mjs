// Execute source SQL expressions in in-memory PostgreSQL; never connects to a server.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.AQARI_PGLITE_MODULE?pathToFileURL(process.env.AQARI_PGLITE_MODULE):'@electric-sql/pglite');
const db=new PGlite();
let cases=0;
try {
 for(const [file,variable,prefix] of [['contract-execution-settlement.sql','c',''],['contract-execution-package-atomic.sql','signed_c','canonical_']]) {
  const sql=readFileSync(new URL('../sql/'+file,import.meta.url),'utf8');
  const expressions=['title','body'].map(name=>{
   const line=sql.split('\n').find(x=>x.trimStart().startsWith(prefix+name+':='));
   assert.ok(line,'source '+name+' assignment exists');
   return line.trim().slice((prefix+name+':=').length,-1);
  });
  // Also exercise the actual official-series number expression from the settlement source.
  const serial=file==='contract-execution-settlement.sql'
   ? sql.match(/'rental_contract',(.+?),'lease',lease.id/)[1]
   : "'CT-'||(signed_c->>'contract_no')";
  for(const number of ['AQ-C-2026-000001','عقد-١٢٣','00101',"A'B",'مرجع/2026', 'AQ-C-2026-999999']) {
   const contract={contract_no:number,tenant:'مستأجر اختباري',property:'عقار اختباري',unit:'B1',start_date:'2026-10-01',end_date:'2027-09-30',contractRent:'350.125',discount:'0',deposit:'200',advance:'50',cleaningFee:'10'};
   const clauses='بند أول\nنص اختباري';
   const result=(await db.query(`select ${expressions[0]} as title, ${expressions[1]} as body, ${serial} as serial from (select $1::jsonb as ${variable},$2::text as clauses) source`,[contract,clauses])).rows[0];
   assert.equal(result.title,'عقد إيجار '+number);
   assert.equal(result.serial,'CT-'+number);
   assert.equal(result.body,`عقد إيجار رقم ${number}\nالمستأجر: مستأجر اختباري\nالعقار: عقار اختباري — الوحدة: B1\nمدة العقد: 2026-10-01 إلى 2027-09-30\nالإيجار الأصلي: 350.125 د.ك — الخصم: 0 د.ك\nالتأمين: 200 د.ك — العربون: 50 د.ك — الرسوم: 10 د.ك\n\n${clauses}`);
   cases++;
  }
 }
 console.log(`PASS ${cases} PostgreSQL contract title/body/number cases from source; no hosted writes.`);
} finally {await db.close();}
