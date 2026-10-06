import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createOriginalDocumentUpload} from '../src/v267/components/original-document-upload.js';

const source=readFileSync(process.env.AQARI_ONBOARDING_SOURCE||new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
const state=source.slice(source.indexOf(' let created='),source.indexOf(" const form=node('form')"));
const uploads=source.slice(source.indexOf(' async function uploadDocuments('),source.indexOf(' async function saveMaster('));
const execute=source.slice(source.indexOf(' async function execute(){'),source.indexOf(' form.onsubmit='))
 .replace("await import('./property-hub.js')",'({openPropertyHub:openHub})');

// Execute the dialog's actual retry loop with the real archive and byte verifier.
// Only the transport and the later master-save/UI boundary are substituted.
function fixture(mode,count=3){
 const rows=new Map(),objects=new Map(),calls=[];let active=true,armed=true,masters=0,closed=0,opened=0;
 const fail=stage=>{if(armed&&mode===stage){armed=false;throw Error(stage);}};
 const session={bound:{workspace:'w',user:'u'},check(){if(!active)throw Error('session changed');},request:async q=>q,
  client:{rpc(name,args){
   calls.push({name,args});
   if(name==='aqari_reserve_document'){
    const id='d'+(rows.size+1),path='w/'+id;
    rows.set(id,{id,status:'reserved',entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,document_type:args.p_document_type,metadata:args.p_metadata,created_by:'u'});
    return {document_id:id,storage_bucket:'aqari-documents',storage_path:path};
   }
   const row=rows.get(args.p_document_id);row.status='uploaded';row.checksum_sha256=args.p_checksum;
   if(row.id==='d2')fail('finalize-response');return row.id;
  },from(){let id;const q={select(){return q;},eq(key,value){if(key==='id')id=value;return q;},single(){
   const row=structuredClone(rows.get(id));if(id==='d2'){
    fail('readback-response');
    if(armed&&mode==='wrong-category')row.metadata.category='property_license';
    if(armed&&mode==='wrong-checksum')row.checksum_sha256='wrong';
    if(armed&&mode==='session-revoked')active=false;
   }return row;
  }};return q;}},
  async storage(method,path,blob){calls.push({name:method,path});
   if(method==='POST'){
    if(path==='w/d2')fail('storage-before-commit');
    assert.ok(!objects.has(path),'never upload twice to an existing immutable object');objects.set(path,blob);
   }else{
    if(path==='w/d2')fail('storage-readback');
    if(path==='w/d2'&&armed&&mode==='wrong-bytes')return new Blob(['%PDF-1.7\nwrong']);
    if(!objects.has(path))throw Object.assign(Error('missing'),{status:404});return objects.get(path);
   }
  }};
 const entries=Array.from({length:count},(_,i)=>({key:'document:'+i,asset:'documents',category:'property_other',title:'Attachment '+i,file:new File(['%PDF-1.7\noriginal '+i],'file-'+i+'.pdf')}));
 const scope={createOriginalDocumentUpload,d:{session,status:{},close(){closed++;}},translateStatic:s=>s,translateMessage:s=>s,
  window:{dispatchEvent(){}},CustomEvent:class{},openHub(){opened++;},saveMaster:async()=>{masters++;return {complete:{score:100}};},entries};
 vm.createContext(scope);vm.runInContext(state+uploads+execute+"\nmanifest={entries,draft:{name:'Test'}};lockedDraft=manifest.draft;created={id:'p',external_ref:'Test'};access={};globalThis.run=execute;globalThis.links=()=>[...uploaded.values()].map(x=>x.id);globalThis.assets=assets;",scope);
 return {run:()=>scope.run(),recover(){armed=false;active=true;},links:()=>Array.from(scope.links()),assets:()=>scope.assets(),calls,rows,stats:()=>({masters,closed,opened})};
}

for(const mode of ['storage-before-commit','storage-readback','finalize-response','readback-response','wrong-category','wrong-checksum','wrong-bytes'])test('onboarding resumes '+mode+' using the same reserved document',async()=>{
 const f=fixture(mode);
 await assert.rejects(f.run());assert.deepEqual(f.links(),['d1']);assert.deepEqual(f.stats(),{masters:0,closed:0,opened:0});
 f.recover();await f.run();
 assert.equal(f.rows.size,3,'one reservation per manifest entry');
 assert.deepEqual(f.links(),['d1','d2','d3']);assert.deepEqual(Array.from(f.assets().documents),['d1','d2','d3']);
 assert.deepEqual(f.stats(),{masters:1,closed:1,opened:1});
 assert.equal(f.calls.filter(x=>x.name==='POST'&&x.path==='w/d1').length,1,'confirmed first attachment is skipped');
 assert.equal(f.calls.filter(x=>x.name==='POST'&&x.path==='w/d2').length,mode==='storage-before-commit'?2:1);
});

test('persistent unconfirmed attachment cannot complete onboarding or reserve again',async()=>{
 const f=fixture('wrong-checksum');await assert.rejects(f.run());await assert.rejects(f.run());
 assert.equal(f.rows.size,2);assert.deepEqual(f.links(),['d1']);assert.deepEqual(f.stats(),{masters:0,closed:0,opened:0});
});
test('onboarding without attachments advances without archive requests',async()=>{
 const f=fixture('',0);await f.run();assert.equal(f.calls.length,0);assert.deepEqual(f.stats(),{masters:1,closed:1,opened:1});
});

test('revoked session stops all subsequent upload and completion work',async()=>{
 const f=fixture('session-revoked');await assert.rejects(f.run());const before=f.calls.length;
 await assert.rejects(f.run());assert.equal(f.calls.length,before);
 assert.deepEqual(f.links(),['d1']);assert.deepEqual(f.stats(),{masters:0,closed:0,opened:0});
});
