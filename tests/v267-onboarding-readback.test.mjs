import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {propertyMasterReadbackMatches} from '../src/v267/domain/property-master-readback.js';

const page=readFileSync(new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
const saveSource=page.slice(page.indexOf(' async function saveMaster(){'),page.indexOf(' async function execute(){'));
function fixture({change,loseResponse=false,uncommitted=false,loseRead=false}={}){
 const draft={name:'Test',address:'Address',description:'Description',type:'building',status:'active',statedIncome:'350.010',email:'owner@example.test',phone:'+96550000000',whatsapp:'+96550000001',locationUrl:'https://example.test/map',propertyAutomaticRef:'001',owners:[{name:'Owner',role:'مالك',bps:10000,email:'owner@example.test',phone:'',whatsapp:''}],tenantVisibility:{name:true,phone:false,officeHours:false},tenantInfo:{instructions:'Instructions',officeHours:'9–5',emergency:'Contact',services:'Services'},reason:'Test'};
 const assets={logo:null,mainPhoto:null,photos:[],titleDeed:'doc',plans:[],licenses:[],certificates:[],insurances:[],documents:[]};
 const calls=[];let committed=null,reads=0,writes=0;
 const scope={lockedDraft:draft,created:{id:'p'},uploaded:new Map([['deed',{id:'doc'}]]),masterAttempt:null,assets:()=>structuredClone(assets),propertyMasterReadbackMatches,d:{session:{bound:{workspace:'w'}}},rpc:async(name,args)=>{
  calls.push(name);
  if(name==='aqari_property_master_save'){
   writes++;assert.equal(args.p_expected_revision,4);assert.equal(args.p_property_id,'p');
   if(!uncommitted)committed={...structuredClone(args.p_data),id:'p',revision:5,statedIncome:350.01,tenantVisibility:{...args.p_data.tenantVisibility,office_hours:false}};
   if(loseResponse)throw Error('save response lost');
   return {property:{id:'p',revision:5}};
  }
  if(name==='aqari_property_full_file'){
   reads++;
   if(reads===2&&loseRead)throw Error('read unavailable');
   const file={property:committed?structuredClone(committed):{...structuredClone(draft),assets:structuredClone(assets),id:'p',revision:4},documents:[{id:'doc'}]};
   if(reads>1&&change)change(file);
   return file;
  }
  if(name==='aqari_property_completeness')return {property_id:'p',score:75};
  throw Error('unexpected RPC '+name);
 }};
 vm.createContext(scope);vm.runInContext(saveSource,scope);
 return {save:()=>scope.saveMaster(),writes:()=>writes,calls};
}

test('onboarding accepts complete readback with server decimal normalization',async()=>{
 const f=fixture();const result=await f.save();assert.equal(result.complete.score,75);assert.equal(f.writes(),1);
});
for(const key of ['type','status','statedIncome','email','phone','whatsapp','locationUrl','propertyAutomaticRef','tenantVisibility','tenantInfo','assets']){
 test('onboarding refuses incomplete or altered '+key,async()=>{
  const f=fixture({change:file=>{file.property[key]=null;}});
  await assert.rejects(f.save(),/لا يطابق/);
 });
}
for(const key of ['name','role','bps','email','phone','whatsapp']){
 test('onboarding refuses altered owner '+key,async()=>{
  const f=fixture({change:file=>{file.property.owners[0][key]=key==='bps'?9999:'changed';}});
  await assert.rejects(f.save(),/لا يطابق/);
 });
}
for(const [label,change] of [['missing owners',f=>{f.property.owners=[];}],['wrong property',f=>{f.property.id='other';}],['stale revision',f=>{f.property.revision=4;}],['concurrent revision',f=>{f.property.revision=6;}]]){
 test('onboarding refuses '+label,async()=>{await assert.rejects(fixture({change}).save(),/لا يطابق/);});
}
test('onboarding still requires every uploaded document in readback',async()=>{
 await assert.rejects(fixture({change:file=>{file.documents=[];}}).save(),/مستند مرفوع/);
});
test('lost save response is recovered by readback without a second write',async()=>{
 const f=fixture({loseResponse:true});await assert.rejects(f.save(),/save response lost/);
 const result=await f.save();assert.equal(result.verify.property.id,'p');assert.equal(f.writes(),1);
});
test('uncommitted save remains unconfirmed without blind resend',async()=>{
 const f=fixture({loseResponse:true,uncommitted:true});await assert.rejects(f.save());await assert.rejects(f.save(),/لا يطابق/);assert.equal(f.writes(),1);
});
test('temporary read failure retries confirmation without resaving master',async()=>{
 const f=fixture({loseRead:true});await assert.rejects(f.save(),/read unavailable/);await f.save();assert.equal(f.writes(),1);
});
test('mismatched readback never causes a second master write',async()=>{
 const f=fixture({change:file=>{file.property.owners=[];}});await assert.rejects(f.save());await assert.rejects(f.save());assert.equal(f.writes(),1);
});
