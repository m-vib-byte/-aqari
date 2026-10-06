import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readPropertyCompleteness} from '../src/v267/components/property-completeness.js';

const missing={code:'PGRST202',status:404,message:'Could not find the function public.aqari_property_completeness(p_property_id, p_workspace_id) in the schema cache'};
function session(result,error) {
 const calls=[];
 return {calls,bound:{workspace:'workspace'},check(){},request:async p=>p,
 client:{rpc(name,args){calls.push({name,args});return error?Promise.reject(error):Promise.resolve(result);}}};
}
test('absent advisory RPC does not reject a confirmed property save',async()=>{
 const s=session(null,missing);
 assert.equal(await readPropertyCompleteness(s,'property'),null);
 assert.deepEqual(s.calls,[{name:'aqari_property_completeness',args:{p_workspace_id:'workspace',p_property_id:'property'}}]);
});
test('available score must belong to the exact property and workspace',async()=>{
 const value={workspace_id:'workspace',property_id:'property',score:75};
 assert.equal(await readPropertyCompleteness(session(value),'property'),value);
 for(const invalid of [{...value,workspace_id:'other'},{...value,property_id:'other'},{...value,score:101},{...value,score:'75'},null])
  await assert.rejects(readPropertyCompleteness(session(invalid),'property'),/نسبة اكتمال/);
});
test('access denial, network failures and missing dependencies are not hidden',async()=>{
 for(const error of [
 {code:'42501',message:'ACCESS_DENIED'},
 {status:401,message:'expired session'},
 {code:'PGRST000',message:'connection failed'},
 {code:'42883',message:'function private.aqari_property_master_snapshot does not exist'},
 {code:'PGRST202',message:'Could not find the function public.aqari_property_completeness_extra()'},
 {code:'PGRST202',message:'Could not find the function private.aqari_property_completeness()'}
 ]) await assert.rejects(readPropertyCompleteness(session(null,error),'property'),e=>e===error);
});
test('session loss takes priority over unavailable advisory service',async()=>{
 const s=session(null,missing),boundary=Error('session changed');let checks=0;
 s.check=()=>{if(++checks>1)throw boundary;};
 await assert.rejects(readPropertyCompleteness(s,'property'),e=>e===boundary);
});
test('session change also rejects successful late score response',async()=>{
 const s=session({workspace_id:'workspace',property_id:'property',score:75}),boundary=Error('session changed');let checks=0;
 s.check=()=>{if(++checks>1)throw boundary;};
 await assert.rejects(readPropertyCompleteness(s,'property'),e=>e===boundary);
});

function masterFixture({badField=false,missingDocument=false}={}) {
 const source=readFileSync(new URL('../src/v267/pages/property-onboarding.js',import.meta.url),'utf8');
 const start=source.indexOf('async function saveMaster(){'),end=source.indexOf('async function execute(){',start);
 const calls=[],s=session(null,missing);
 const context={created:{id:'property'},d:{session:s},lockedDraft:{name:'Saved property',address:'Address',description:'Description'},
 uploaded:new Map([['document',{id:'document'}]]),assets:()=>({}),readPropertyCompleteness,Date,
 rpc:async(name,args)=>{
 calls.push(name);
 if(name==='aqari_property_master_save')return {property:{id:'property',revision:2}};
 const afterSave=calls.includes('aqari_property_master_save');
 return {property:{id:'property',revision:1,name:badField&&afterSave?'Wrong':'Saved property',address:'Address',description:'Description'},
 documents:missingDocument&&afterSave?[]:[{id:'document'}]};
 }};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.save=saveMaster;',context);
 return {context,calls,s};
}
test('post-save readback succeeds when only advisory score is unavailable',async()=>{
 const f=masterFixture(),result=await f.context.save();
 assert.equal(result.complete,null);
 assert.equal(result.verify.property.name,'Saved property');
 assert.deepEqual(f.calls,['aqari_property_full_file','aqari_property_master_save','aqari_property_full_file']);
 assert.equal(f.s.calls.length,1);
});
test('missing uploaded document fails before requesting the advisory score',async()=>{
 const f=masterFixture({missingDocument:true});
 await assert.rejects(f.context.save(),/مستند مرفوع/);
 assert.equal(f.s.calls.length,0);
});
test('changed property readback fails before requesting the advisory score',async()=>{
 const f=masterFixture({badField:true});
 await assert.rejects(f.context.save(),/لا يطابق/);
 assert.equal(f.s.calls.length,0);
});
