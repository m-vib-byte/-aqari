import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {listPropertyContractArchive,readPropertyContractArchive} from '../src/v267/components/property-contract-archive.js';

const property={id:'88888888-8888-4888-8888-888888888888',externalRef:'property-ref'};
const docId='99999999-9999-4999-9999-999999999999';
const bytes=new Blob(['%PDF-1.7\nverified']);
const digest=createHash('sha256').update('%PDF-1.7\nverified').digest('hex');
const original={id:docId,title:'ملف عقد العقار',created_at:'2026-09-26T00:00:00Z',status:'uploaded',entity_type:'property',entity_ref:property.externalRef,
 document_type:'supporting_document',metadata:{category:'property_other',asset_role:'property_contract',property_id:property.id},
 storage_bucket:'aqari-documents',storage_path:'workspace/verified.pdf',mime_type:'application/pdf',size_bytes:bytes.size,checksum_sha256:digest};

function fixture(rows=[original],blob=bytes){
 const calls=[];const session={bound:{workspace:'workspace'},check(){},request:async q=>q,
  client:{from(table){assert.equal(table,'aqari_documents');return {select(columns){assert.match(columns,/checksum_sha256/);return this;},eq(key,value){calls.push([key,value]);return this;},order(){return this;},limit(){return rows;},single(){return rows[0];}};}},
  async storage(method,path){calls.push([method,path]);return blob;}};
 return {session,calls};
}

test('archive list omits unrelated documents and keeps workspace and property filters',async()=>{
 const f=fixture([original,{...original,id:'other',metadata:{...original.metadata,property_id:'another'}},{...original,id:'not-a-contract',metadata:{...original.metadata,asset_role:'property_photo'}}]);
 assert.deepEqual((await listPropertyContractArchive(f.session,property)).map(x=>x.id),[docId]);
 assert.deepEqual(f.calls.slice(0,3),[['workspace_id','workspace'],['entity_type','property'],['entity_ref',property.externalRef]]);
});

test('opening archive rechecks record scope and exact private bytes',async()=>{
 const f=fixture();const pdf=await readPropertyContractArchive(f.session,property,docId);
 assert.equal(pdf.type,'application/pdf');assert.equal(await pdf.text(),await bytes.text());
 assert.deepEqual(f.calls.at(-1),['GET','workspace/verified.pdf']);
 for(const changed of [{metadata:{...original.metadata,property_id:'another'}},{storage_path:'other-workspace/verified.pdf'},{status:'reserved'}]){
  const wrong=fixture([{...original,...changed}]);await assert.rejects(readPropertyContractArchive(wrong.session,property,docId));
  assert.equal(wrong.calls.some(([method])=>method==='GET'),false);
 }
 await assert.rejects(readPropertyContractArchive(fixture().session,property,'bad-id'));
 const tampered=fixture([original],new Blob(['%PDF-1.7\ntampered']));
 await assert.rejects(readPropertyContractArchive(tampered.session,property,docId),/بصمة/);
});
