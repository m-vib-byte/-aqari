import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('public packaging retains browser assets and fonts but excludes private build inputs',()=>{
 const dest=mkdtempSync(join(tmpdir(),'aqari-public-'));
 try{
  for(const name of ['scripts','src','lib','docs'])cpSync(name,join(dest,name),{recursive:true});
  for(const name of readdirSync('.'))if(/\.(js|css|html|svg|webmanifest)$/.test(name))cpSync(name,join(dest,name));
  writeFileSync(join(dest,'.env'),'SYNTHETIC_SECRET=never-public');
  writeFileSync(join(dest,'package.json'),'{}');
  execFileSync(process.execPath,[join(dest,'scripts/prepare-public-output.mjs')]);
  const out=join(dest,'public-build');
  for(const name of ['index.html','login.html','startup-trace-worker.js','src/v267/components/pdf-local-ocr.js','src/v267/components/rental-templates.js','lib/pdf_fonts/AqariSans.ttf','lib/pdf_fonts/LICENSE.txt'])assert.ok(existsSync(join(out,name)),name);
  for(const name of ['.env','package.json','middleware.js','scripts','tests','staging-database','api','supabase','lib/contract_print.py','demo-v211.html'])assert.equal(existsSync(join(out,name)),false,name);
  assert.equal(readFileSync(join(out,'lib/pdf_fonts/AqariSans.ttf')).compare(readFileSync('lib/pdf_fonts/AqariSans.ttf')),0);
  writeFileSync(join(out,'stale-secret.sql'),'synthetic');
  execFileSync(process.execPath,[join(dest,'scripts/prepare-public-output.mjs')]);
  assert.equal(existsSync(join(out,'stale-secret.sql')),false);
 }finally{rmSync(dest,{recursive:true,force:true});}
});
