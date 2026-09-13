import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveUnitHandoverPdf,reopenUnitHandoverPdf} from '../src/v267/components/unit-handover-pdf-archive.js';

function bundle(){
  return Object.freeze({
    kind:'unit_handover',
    source:Object.freeze({inspection_id:'inspection-1',lease_id:'lease-1',unit_id:'unit-1',inspection_revision:2})
  });
}
function pdf(extra='AQARI handover'){
  return new TextEncoder().encode(`%PDF-1.4\n1 0 obj\n<<>>\nendobj\n% ${extra}\n%%EOF\n`);
}
function storage(){
  const rows=new Map();
  const api={
    rows,
    getCalls:0,
    async put(key,{bytes,contentType,metadata,ifNoneMatch}){
      if(ifNoneMatch==='*'&&rows.has(key))throw new Error('PRECONDITION_FAILED');
      rows.set(key,{bytes:new Uint8Array(bytes),contentType,metadata:{...metadata}});
    },
    async get(key){
      api.getCalls+=1;
      const value=rows.get(key);
      return value?{bytes:new Uint8Array(value.bytes),contentType:value.contentType,metadata:{...value.metadata}}:null;
    }
  };
  return api;
}

test('archives actual PDF bytes with immutable source identity and verified reopen',async()=>{
  const target=storage();
  const archived=await archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target,archivedAt:'2026-09-13T09:30:00Z'});
  assert.equal(archived.kind,'unit_handover_pdf_archive');
  assert.equal(archived.content_type,'application/pdf');
  assert.match(archived.pdf_sha256,/^[a-f0-9]{64}$/);
  assert.match(archived.manifest_sha256,/^[a-f0-9]{64}$/);
  assert.match(archived.storage_key,/^unit-handover\/lease-1\/inspection-1\/r2\//);
  assert.ok(Object.isFrozen(archived));
  assert.ok(Object.isFrozen(archived.source));
  const reopened=await reopenUnitHandoverPdf({archive:archived,storage:target});
  assert.deepEqual(Array.from(reopened.bytes),Array.from(pdf()));
});

test('uses create-only storage semantics for the same signed source and PDF',async()=>{
  const target=storage();
  await archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target});
  await assert.rejects(()=>archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target}),/PRECONDITION_FAILED/);
  assert.equal(target.rows.size,1);
});

test('refuses non-PDF bytes before storage mutation',async()=>{
  const target=storage();
  await assert.rejects(()=>archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:new TextEncoder().encode('not pdf'),storage:target}),/PDF_INVALID/);
  assert.equal(target.rows.size,0);
});

test('detects stored byte tampering on reopen',async()=>{
  const target=storage();
  const archived=await archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target});
  const row=target.rows.get(archived.storage_key);
  row.bytes=new Uint8Array(row.bytes);
  row.bytes[row.bytes.length-2]^=1;
  await assert.rejects(()=>reopenUnitHandoverPdf({archive:archived,storage:target}),/STORED_DIGEST_MISMATCH/);
});

test('detects stored metadata or MIME tampering on reopen',async()=>{
  let target=storage();let archived=await archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target});
  target.rows.get(archived.storage_key).metadata.lease_id='other';
  await assert.rejects(()=>reopenUnitHandoverPdf({archive:archived,storage:target}),/METADATA_MISMATCH/);

  target=storage();archived=await archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target});
  target.rows.get(archived.storage_key).contentType='text/plain';
  await assert.rejects(()=>reopenUnitHandoverPdf({archive:archived,storage:target}),/STORED_MIME_MISMATCH/);
});

test('detects archive identity tampering before reading storage',async()=>{
  const target=storage();
  const archived=await archiveUnitHandoverPdf({bundle:bundle(),pdfBytes:pdf(),storage:target});
  const tampered={...archived,source:{...archived.source,unit_id:'unit-9'}};
  await assert.rejects(()=>reopenUnitHandoverPdf({archive:tampered,storage:target}),/MANIFEST_MISMATCH/);
  assert.equal(target.getCalls,0);
});
