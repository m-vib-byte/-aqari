import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {withPresentation} from '../src/v267/domain/property-presentation.js';

const source=readFileSync(process.env.AQARI_ONBOARDING_SOURCE||new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
const creation=source.slice(source.indexOf(' async function saveLegacyProperty('),source.indexOf(' async function createPreviewImages('));
const execute=source.slice(source.indexOf(' async function execute(){'),source.indexOf(' form.onsubmit='))
 .replace("await import('./property-hub.js')",'await loadHub()');
const prelude=source.slice(source.indexOf('const clone='),source.indexOf('export function openPropertyOnboarding'));

function fixture(options={}){
 let cloud={payload:{properties:[],audit:[]},revision:4},sends=0,prepares=0,reads=0,masterSaves=0,uploads=0,opened=0,freezes=0,queries=0,typedReads=0,revoked=false,closed=0,events=0,moduleLoads=0;
 const controls=[{disabled:false},{disabled:false},{disabled:false}],save={disabled:false};
 const draft={name:'Test property',owners:[],address:'Test address',statedIncome:'350.010',phone:'+96550000000',whatsapp:''};
 if(options.existingLegacy)cloud.payload.properties.push([draft.name,'','','']);
 const typed=()=>({id:'p',workspace_id:'w',name:draft.name,external_ref:draft.name,metadata:structuredClone(cloud.payload.properties[0])});
 const check=()=>{if(revoked)throw Error('session changed');};
 const scope={created:null,manifest:null,uploaded:new Map(),lockedDraft:null,access:{permissions:{properties:{write:true}}},creationAttempt:null,
  clone:structuredClone,withPresentation,crypto:{randomUUID:()=> 'd5c8e824-217c-4f52-9c37-df1c1bc140a9'},bound:()=>({userId:'u',workspaceId:'w'}),api:{primary:p=>p},
  form:{reportValidity:()=>true,querySelectorAll:()=>controls},save,translateStatic:x=>x,translateMessage:x=>x,CustomEvent:class{constructor(type){this.type=type;}},window:{dispatchEvent(){events++;}},loadHub:async()=>{moduleLoads++;if(options.failHub&&moduleLoads===1)throw Error('module unavailable');if(options.revokeDuringHub)revoked=true;return options.invalidHub?{}:{openPropertyHub(){assert.equal(closed,1);opened++;}};},
  freezeDraft:()=>{freezes++;return{draft:structuredClone(draft),entries:[]};},createPreviewImages:async()=>{prepares++;if(options.failPreview&&prepares===1)throw Error('image failed');return [];},
  uploadDocuments:async()=>{uploads++;},saveMaster:async()=>{masterSaves++;return {complete:options.missingCompleteness?null:{score:50}};},
  bridge:{loadAppState:async()=>{check();reads++;if(options.failInitialRead&&reads===1)throw Error('read failed');if(options.failReadback&&reads===2)throw Error('readback failed');const value=structuredClone(cloud);if(sends&&options.changeCloud)options.changeCloud(value);return value;},
   saveAppState:async(payload,revision,bound)=>{check();sends++;assert.equal(revision,4);assert.equal(bound.workspaceId,'w');if(!options.uncommitted)cloud={payload:structuredClone(payload),revision:5};if(options.revokeAfterSend)revoked=true;if(options.loseResponse)throw Error('response lost');}},
  d:{session:{bound:{user:'u',workspace:'w'},check,request:async x=>{check();return x;},client:{from(table){assert.equal(table,'aqari_properties');const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},limit(){check();queries++;assert.equal(filters.workspace_id,'w');assert.ok(filters.name===draft.name||filters.external_ref===draft.name);if(!sends)return options.existingTyped?[{...typed(),metadata:{source_only:true}}]:[];typedReads++;if(options.failTypedOnce&&typedReads===1)throw Error('typed read failed');let row=typed();if(options.wrappedMetadata)row.metadata={source_record:row.metadata};if(options.changeTyped)options.changeTyped(row);return options.duplicateTyped?[row,structuredClone(row)]:[row];}};}}},status:{},close(){closed++;}}};
 vm.createContext(scope);vm.runInContext(prelude+'\n'+creation+'\n'+execute,scope);
 return{run:()=>scope.execute(),stats:()=>({sends,prepares,reads,masterSaves,uploads,opened,freezes,closed,events,moduleLoads}),controls,draft,scope,cloud:()=>cloud};
}

test('image preparation failure can be corrected and retried before any write',async()=>{
 const f=fixture({failPreview:true});await assert.rejects(f.run(),/image failed/);assert.equal(f.stats().sends,0);assert.ok(f.controls.every(c=>!c.disabled));f.draft.name='Corrected property';await f.run();assert.equal(f.stats().sends,1);assert.equal(f.stats().opened,1);assert.equal(f.cloud().payload.properties[0][0],'Corrected property');
});
test('initial cloud read failure can retry without a stranded manifest',async()=>{
 const f=fixture({failInitialRead:true});await assert.rejects(f.run());await f.run();assert.equal(f.stats().sends,1);assert.equal(f.stats().opened,1);
});
for(const mode of ['loseResponse','failReadback','failTypedOnce'])test('creation resumes after '+mode+' with one write only',async()=>{
 const f=fixture({[mode]:true});await assert.rejects(f.run());assert.ok(f.controls.every(c=>c.disabled),'draft including owner controls stays locked after send');assert.equal(f.scope.save.textContent,'التحقق ومتابعة الملف');await f.run();assert.equal(f.stats().sends,1);assert.equal(f.stats().masterSaves,1);assert.equal(f.stats().opened,1);
});
test('an uncommitted creation is not blindly resent or advanced',async()=>{
 const f=fixture({loseResponse:true,uncommitted:true});await assert.rejects(f.run());await assert.rejects(f.run());assert.equal(f.stats().sends,1);assert.equal(f.stats().masterSaves,0);
});
for(const mode of ['existingLegacy','existingTyped'])test(mode+' property cannot be adopted or overwritten',async()=>{
 const f=fixture({[mode]:true});await assert.rejects(f.run());assert.equal(f.stats().sends,0);assert.equal(f.stats().masterSaves,0);
});
for(const [label,changeCloud] of [
 ['missing attempt marker',c=>{for(const x of c.payload.properties[0])if(x&&typeof x==='object')delete x.onboardingRequestId;}],
 ['changed row',c=>{c.payload.properties[0][1]='another owner';}],
 ['duplicate rows',c=>{c.payload.properties.push(structuredClone(c.payload.properties[0]));}],
 ['stale revision',c=>{c.revision=4;}]
])test('creation refuses '+label+' before uploads or master write',async()=>{
 const f=fixture({changeCloud});await assert.rejects(f.run());assert.equal(f.stats().uploads,0);assert.equal(f.stats().masterSaves,0);
});
for(const [label,changeTyped] of [
 ['wrong workspace',r=>{r.workspace_id='other';}],['wrong reference',r=>{r.external_ref='other';}],['missing ID',r=>{r.id='';}],['different creation',r=>{r.metadata=[];}]
])test('creation refuses typed '+label,async()=>{
 const f=fixture({changeTyped});await assert.rejects(f.run());assert.equal(f.stats().uploads,0);
});
test('ambiguous typed identities are never adopted',async()=>{
 const f=fixture({duplicateTyped:true});await assert.rejects(f.run());assert.equal(f.stats().masterSaves,0);
});
test('metadata wrapper and JSONB object key order preserve identity',async()=>{
 const f=fixture({wrappedMetadata:true,changeCloud:c=>{c.payload.properties=c.payload.properties.map(row=>row.map(v=>v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse()):v));}});await f.run();assert.equal(f.stats().opened,1);
});
test('revoked session stops creation recovery before attachment or master writes',async()=>{
 const f=fixture({loseResponse:true,revokeAfterSend:true});await assert.rejects(f.run());await assert.rejects(f.run());assert.equal(f.stats().sends,1);assert.equal(f.stats().uploads,0);
});

test('failed hub loading leaves the saved onboarding dialog open for recovery',async()=>{
 const f=fixture({failHub:true});await assert.rejects(f.run(),/تم حفظ العقار/);
 assert.equal(f.stats().closed,0);assert.equal(f.stats().events,0);assert.equal(f.stats().opened,0);assert.equal(f.stats().sends,1);
 await f.run();assert.equal(f.stats().sends,1);assert.equal(f.stats().closed,1);assert.equal(f.stats().events,1);assert.equal(f.stats().opened,1);
});
test('missing advisory completeness still opens the confirmed property once',async()=>{
 const f=fixture({missingCompleteness:true});await f.run();
 assert.equal(f.stats().sends,1);assert.equal(f.stats().closed,1);assert.equal(f.stats().opened,1);
});
test('invalid hub export cannot close the saved dialog',async()=>{
 const f=fixture({invalidHub:true});await assert.rejects(f.run(),/تم حفظ العقار/);
 assert.equal(f.stats().closed,0);assert.equal(f.stats().events,0);assert.equal(f.stats().sends,1);
});
test('session change during hub loading prevents the saved event and navigation',async()=>{
 const f=fixture({revokeDuringHub:true});await assert.rejects(f.run(),/session changed/);
 assert.equal(f.stats().closed,0);assert.equal(f.stats().events,0);assert.equal(f.stats().opened,0);
});
