import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPaymentProof} from '../src/v267/components/payment-proof.js';
globalThis.crypto??=webcrypto;
function session(corrupt=false){
 let saved,hash;const calls=[];
 const s={bound:{workspace:'w'},check(){},calls,
 client:{rpc(name,args){calls.push(name);if(name==='aqari_reserve_document')return [{document_id:'d',storage_bucket:'aqari-documents',storage_path:'w/d.pdf'}];hash=args.p_checksum;return 'd';},from(){const q={select(){return q;},eq(){return q;},single(){return {id:'d',status:'uploaded',checksum_sha256:hash};}};return q;}},
 async request(q){return q;},async storage(method,path,blob){calls.push(method);if(method==='POST'){saved=blob;return {};}return corrupt?new Blob(['broken']):saved;}};return s;
}
const target={propertyRef:'p',invoice:'i',entryId:'e',meterId:'m'};
test('proof uploads once, rereads bytes, finalizes and reuses reservation',async()=>{
 const s=session(),save=createPaymentProof(s),f=new File(['%PDF-1.4\nproof'], 'proof.pdf',{type:'application/pdf'});
 assert.equal(await save(f,target),'d');assert.equal(await save(f,target),'d');
 assert.equal(s.calls.filter(x=>x==='POST').length,1);assert.equal(s.calls.filter(x=>x==='aqari_reserve_document').length,1);
 assert.ok(s.calls.indexOf('GET')<s.calls.indexOf('aqari_finalize_document'));
});
test('mismatched stored bytes never finalize',async()=>{
 const s=session(true);await assert.rejects(createPaymentProof(s)(new File(['%PDF-1.4'], 'x.pdf'),target));
 assert.ok(!s.calls.includes('aqari_finalize_document'));
});
test('HTML masquerading as PDF is rejected before reservation',async()=>{
 const s=session();await assert.rejects(createPaymentProof(s)(new File(['<script>alert(1)</script>'],'x.pdf',{type:'application/pdf'}),target));assert.equal(s.calls.length,0);
});
