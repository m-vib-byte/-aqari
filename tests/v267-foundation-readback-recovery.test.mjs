import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('src/v267/pages/contract-foundation.js','utf8');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fixture(){
 let server={contractPreparationDraftsV267:[{id:'qa-only',status:'preparation',contractNo:'QA-ONLY',rent:100}],unrelated:['keep']},revision=1,writes=0,failRead=false,failWrite=false,justWritten=false;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const context={copy:clone,same,Date,scope:()=>({userId:'qa',workspaceId:'qa'}),state:null,preparation:clone(server.contractPreparationDraftsV267[0]),unconfirmedPreparation:null,d:{session:{bound:{user:'qa'},check(){}}},api:{primary:x=>x},window:{AQARI_SUPABASE:{async loadAppState(){if(justWritten&&failRead){justWritten=false;failRead=false;throw Error('readback interrupted');}justWritten=false;return {payload:clone(server),revision};},async saveAppState(payload,expected){if(failWrite){failWrite=false;throw Error('write rejected');}assert.equal(expected,revision);server=clone(payload);revision++;writes++;justWritten=true;}}}};
 vm.createContext(context);
 const change=source.slice(source.indexOf(' async function changeState('),source.indexOf(' async function createPreparation('));
 const patch=source.slice(source.indexOf(' async function patchPreparation('),source.indexOf(' async function cancelPreparation('));
 vm.runInContext(change+patch+'\nthis.patch=patchPreparation;',context);
 return {patch:context.patch,interrupt(){failRead=true;},rejectWrite(){failWrite=true;},external(){server.contractPreparationDraftsV267[0].rent=999;revision++;},get data(){return server;},get writes(){return writes;}};
}
test('committed write with lost readback is reconciled before the next edit',async()=>{const f=fixture();f.interrupt();await assert.rejects(f.patch({rent:120}),/readback interrupted/);assert.equal(f.data.contractPreparationDraftsV267[0].rent,120);await f.patch({floor:'QA floor'});assert.equal(f.writes,2);assert.equal(f.data.contractPreparationDraftsV267[0].rent,120);assert.equal(f.data.contractPreparationDraftsV267[0].floor,'QA floor');assert.deepEqual(f.data.unrelated,['keep']);});
test('a different session change after lost readback stays rejected',async()=>{const f=fixture();f.interrupt();await assert.rejects(f.patch({rent:120}));f.external();await assert.rejects(f.patch({floor:'QA floor'}),/جلسة أخرى/);assert.equal(f.writes,1);assert.equal(f.data.contractPreparationDraftsV267[0].rent,999);});
test('an explicitly rejected write cannot falsely confirm a save',async()=>{const f=fixture();f.rejectWrite();await assert.rejects(f.patch({rent:120}),/write rejected/);assert.equal(f.writes,0);assert.equal(f.data.contractPreparationDraftsV267[0].rent,100);await f.patch({rent:130});assert.equal(f.writes,1);assert.equal(f.data.contractPreparationDraftsV267[0].rent,130);});
