import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
test('generated migration matches canonical source and rejects drift in either file without altering originals',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aqari-archive-parity-'));
 const source='staging-database/sql/rental-archive-receipt-permission.sql';
 const migration='staging-database/supabase/migrations/20261026012044_v267_rental_archive_receipt_permission.sql';
 const builder='scripts/build-rental-archive-receipt-migration.mjs';
 try{
  for(const file of [source,migration,builder]){
   fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});
   fs.copyFileSync(path.join(root,file),path.join(temp,file));
  }
  const run=()=>spawnSync(process.execPath,[path.join(temp,builder),'--check'],{encoding:'utf8'});
  assert.equal(run().status,0);
  fs.appendFileSync(path.join(temp,migration),'-- synthetic migration drift\n');
  let result=run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RECEIPT_ARCHIVE_MIGRATION_SOURCE_DRIFT/);
  fs.copyFileSync(path.join(root,migration),path.join(temp,migration));
  fs.appendFileSync(path.join(temp,source),'-- synthetic canonical drift\n');
  result=run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RECEIPT_ARCHIVE_MIGRATION_SOURCE_DRIFT/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
