import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf(' async function saveLegacyProperty('),source.indexOf(' async function createPreviewImages('));
for(const mode of ['rejected','lost','empty','empty-conflict'])test('property create '+mode+' response retains safe retry boundary',async()=>{
 let writes=0,cloud=mode.startsWith('empty')?null:{revision:1,payload:{properties:[]}},stored=[];
 const controls=[{value:'Synthetic',disabled:false}],save={};
 const query={select(){return this;},eq(){return this;},limit:async()=>stored};
 const ctx={creationAttempt:null,lockedDraft:{name:'Synthetic',owners:[],address:'Address'},bound:()=>({}),d:{session:{bound:{workspace:'w',user:'u'},check(){},request:async x=>x,client:{from:()=>query}}},form:{querySelectorAll:()=>controls},save,translateStatic:x=>x,clone:structuredClone,api:{primary:x=>x},crypto:{randomUUID:()=>String(writes)},sameRecord:(a,b)=>JSON.stringify(a)===JSON.stringify(b),withPresentation:row=>[...row,{aqariPropertyPresentation:1}],bridge:{loadAppState:async()=>structuredClone(cloud),saveAppState:async (payload,revision)=>{writes++;assert.equal(revision,mode.startsWith('empty')?0:1);if((mode==='rejected'||mode==='empty-conflict')&&writes===1)throw Object.assign(Error('revision'),{code:'AQARI_REVISION_CONFLICT'});cloud={revision:2,payload:structuredClone(payload)};stored=[{id:'p',workspace_id:'w',name:'Synthetic',external_ref:'Synthetic',metadata:payload.properties[0]}];if(mode==='lost')throw Error('lost');}}};
 vm.createContext(ctx);vm.runInContext(fn+'\nthis.saveProperty=saveLegacyProperty;',ctx);
 if(mode==='empty'){const result=await ctx.saveProperty([]);assert.equal(result.id,'p');assert.equal(writes,1);assert.deepEqual(Object.keys(cloud.payload).sort(),['audit','properties']);return;}
 await assert.rejects(ctx.saveProperty([]));assert.equal(controls[0].disabled,mode==='lost');assert.equal(controls[0].value,'Synthetic');
 const result=await ctx.saveProperty([]);assert.equal(result.id,'p');assert.equal(cloud.payload.properties.length,1);assert.equal(writes,mode==='lost'?1:2);
});
