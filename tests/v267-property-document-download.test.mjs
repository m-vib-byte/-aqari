import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readPropertyDocument} from '../src/v267/components/property-document-download.js';
function fixture(change={}){
 const bytes=Buffer.from('%PDF-1.4\nsynthetic only');
 const property={id:'p',workspace_id:'w',external_ref:'legacy-p',...change.property};
 const doc={id:'d',workspace_id:'w',entity_type:'property',entity_ref:'p',status:'uploaded',storage_bucket:'aqari-documents',storage_path:'w/d.pdf',mime_type:'application/pdf',document_no:'DOC-1',size_bytes:bytes.length,checksum_sha256:createHash('sha256').update(bytes).digest('hex'),...change.doc};
 let checked=0,downloads=0,reads=0;const calls=[];
 const session={bound:{workspace:'w'},check(){if(++checked===change.scopeLossAt)throw Error('SESSION_CHANGED');},client:{from(table){const q={table,filters:[],select(){return this;},eq(k,v){this.filters.push([k,v]);return this;},single(){return this;}};return q;}},async request(q){calls.push(q);reads++;return q.table==='aqari_properties'?property:{...doc,...(reads===3?change.readback:{})};},async storage(method,path){downloads++;assert.equal(method,'GET');assert.equal(path,doc.storage_path);return new Blob([change.bytes??bytes]);}};
 return {session,calls,downloads:()=>downloads};
}
for(const ref of ['p','legacy-p'])test('verified download accepts exact property identity '+ref,async()=>{const f=fixture({doc:{entity_ref:ref}}),r=await readPropertyDocument(f.session,'p','d');assert.equal(r.verified,true);assert.equal(r.name,'DOC-1.pdf');assert.equal(f.downloads(),1);for(const call of f.calls)assert.ok(call.filters.some(([k,v])=>k==='workspace_id'&&v==='w'));});
for(const change of [{property:{workspace_id:'other'}},{property:{id:'other'}},{doc:{workspace_id:'other'}},{doc:{entity_type:'tenant'}},{doc:{entity_ref:'other'}},{doc:{status:'reserved'}},{doc:{storage_path:'other/d.pdf'}},{readback:{entity_ref:'other'}}])test('unrelated or changed document never downloads '+JSON.stringify(change),async()=>{const f=fixture(change);await assert.rejects(readPropertyDocument(f.session,'p','d'));assert.equal(f.downloads(),0);});
for(const change of [{bytes:Buffer.from('wrong size')},{doc:{checksum_sha256:'0'.repeat(64)}}])test('invalid bytes are not delivered '+JSON.stringify(change),async()=>{const f=fixture(change);await assert.rejects(readPropertyDocument(f.session,'p','d'));});
test('legacy file without checksum reports unverified instead of inventing proof',async()=>{const f=fixture({doc:{checksum_sha256:null}}),r=await readPropertyDocument(f.session,'p','d');assert.equal(r.verified,false);assert.match(r.note,/بلا بصمة/);});
test('session changes stop document reads before storage',async()=>{const f=fixture({scopeLossAt:3});await assert.rejects(readPropertyDocument(f.session,'p','d'),/SESSION_CHANGED/);assert.equal(f.downloads(),0);});
