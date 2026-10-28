import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOriginalDocument} from '../src/v267/components/original-document-upload.js';

// Synthetic local file bytes; no Storage, RPC, account, or property creation.
const pdf=new Blob([new TextEncoder().encode('%PDF-1.4\n')],{type:'application/pdf'});
const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'application/octet-stream'});
const target={type:'property',category:'property_logo',title:'شعار العقار'};

test('preflight accepts genuine image signature regardless of declared MIME',async()=>{
 const result=await validateOriginalDocument(png,target);
 assert.equal(result.blob.type,'image/png');
 assert.equal(result.spec.documentType,'supporting_document');
});
test('preflight rejects PDF disguised as property logo',async()=>{
 await assert.rejects(validateOriginalDocument(pdf,target),/شعار وصور العقار/);
});
test('preflight rejects empty file, missing title, and wrong entity category',async()=>{
 await assert.rejects(validateOriginalDocument(new Blob([]),target),/اختر صورة أو PDF/);
 await assert.rejects(validateOriginalDocument(png,{...target,title:' '}),/حدد السجل وعنوان المستند/);
 await assert.rejects(validateOriginalDocument(png,{...target,type:'tenant'}),/فئة مرفق العقار/);
});
test('preflight permits genuine PDF for property contract',async()=>{
 const result=await validateOriginalDocument(pdf,{type:'property',category:'property_contract',title:'عقد العقار'});
 assert.equal(result.blob.type,'application/pdf');
});
