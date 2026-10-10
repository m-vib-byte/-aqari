import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/v267/pages/property-unit-create.js',import.meta.url),'utf8');
const savedResponse=data=>({workspace_id:'workspace',user_id:'user',unit:{...data,id:'unit',propertyId:'property',revision:1}});
const fileResponse=unit=>({workspace_id:'workspace',user_id:'user',property:{id:'property'},units:[unit]});
function fixture(options={}){
 const controls=new Map(),calls=[];
 const node=(tag,text='')=>({tag,textContent:text,value:'',children:[],append(...items){this.children.push(...items);}});
 const d={beforeClose:()=>true,beforeUnload:()=>false,setBeforeClose(fn){this.beforeClose=fn;},setBeforeUnload(fn){this.beforeUnload=fn;},body:node('section'),status:node('p'),session:{bound:{workspace:'workspace',user:'user'},check(){},client:{rpc(name,args){calls.push({name,args});return {name,args};}},async request(q){
  if(options.request)return options.request(q);
  if(q.name==='aqari_unit_readiness_register')return {id:q.args.p_data.id,unit_id:'unit',revision:1};
  return savedResponse(q.args.p_data);
 }},close(){this.closed=true;},run(work){this.body.inert=true;this.pending=Promise.resolve().then(work).catch(e=>{this.error=e;}).finally(()=>{this.body.inert=false;});return this.pending;}};
 const source=raw.replace(/^import .*;$/gm,'').replace(/\bexport /g,'').replace("const hub=await import('./property-hub.js');return hub.openPropertyHub(propertyId);","return true;");
 const prompts=[];let discard=false,requestNumber=0;
 const context={window:{confirm(message){prompts.push(message);return discard;}},node,field(label,c){controls.set(label,c);return c;},createDialog:()=>d,translateStatic:v=>v,visibleText:v=>v,Intl,Date,crypto:{randomUUID:()=> 'request-'+(++requestNumber)}};
 vm.createContext(context);vm.runInContext(source+'\nopenPropertyUnitCreate("property");',context);
 controls.get('رقم الوحدة').value='١٠١';controls.get('الدور').value='1';controls.get('نوع الوحدة').value='apartment';controls.get('مرجع المعاينة').value='inspection';
 return {calls,controls,d,prompts,allowDiscard(value){discard=value;},async submit(){d.body.children[0].onsubmit({preventDefault(){}});await d.pending;}};
}
test('Arabic and Persian decimals reach both saved unit fields without losing fils',async()=>{
 const f=fixture();f.controls.get('المساحة م²').value='۱۲۵٫۵';f.controls.get('الإيجار المعلن').value='٣٥٠٫١٢٥';await f.submit();
 assert.equal(f.d.error,undefined);assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].args.p_data.unit_no,'101');
 assert.equal(f.calls[1].args.p_data.areaSqm,'125.500');assert.equal(f.calls[1].args.p_data.statedRent,'350.125');
});
test('invalid rent is rejected before creating a unit or a readiness entry',async()=>{
 for(const value of ['-1','١٫١٢٣٤','NaN','Infinity','1e3','1,250','1.2.3']){
  const f=fixture();f.controls.get('الإيجار المعلن').value=value;await f.submit();assert.ok(f.d.error,value);assert.deepEqual(f.calls,[],value);
 }
});
test('invalid or out-of-range area creates no records even when rent is valid',async()=>{
 for(const value of ['0','-1','100000000.001','٢٫١٢٣٤','NaN']){
  const f=fixture();f.controls.get('المساحة م²').value=value;f.controls.get('الإيجار المعلن').value='350';await f.submit();assert.ok(f.d.error,value);assert.deepEqual(f.calls,[],value);
 }
});
test('optional unknown numbers stay null and a stated zero rent stays explicit',async()=>{
 const blank=fixture();await blank.submit();assert.equal(blank.d.error,undefined);assert.equal(blank.calls[1].args.p_data.areaSqm,null);assert.equal(blank.calls[1].args.p_data.statedRent,null);
 const zero=fixture();zero.controls.get('الإيجار المعلن').value='٠';zero.controls.get('المساحة م²').value='100000000';await zero.submit();assert.equal(zero.d.error,undefined);assert.equal(zero.calls[1].args.p_data.statedRent,'0.000');assert.equal(zero.calls[1].args.p_data.areaSqm,'100000000.000');
});


test('add-unit chooser bounds the property editor module load before closing its dialog',()=>{
 const source=readFileSync(new URL('../src/v267/pages/unit-entry.js',import.meta.url),'utf8');
 assert.match(source,/guardPageImport\(\(\)=>import\('\.\/property-unit-create\.js'\)\)/);
 assert.match(source,/guardPageImport[\s\S]*d\.session\.check\(\)[\s\S]*d\.close\(\)[\s\S]*openPropertyUnitCreate/);
});

test('pristine unit form closes without warning; editing every field warns before departure',()=>{
 const f=fixture();
 // Fixture pre-fills three required fields after the real form takes its baseline.
 for(const label of ['رقم الوحدة','الدور','نوع الوحدة','مرجع المعاينة'])f.controls.get(label).value='';
 assert.equal(f.d.beforeUnload(),false);assert.equal(f.d.beforeClose(),true);assert.equal(f.prompts.length,0);
 for(const control of f.controls.values()){
  const original=control.value;control.value='changed';
  assert.equal(f.d.beforeUnload(),true);assert.equal(f.d.beforeClose(),false);
  assert.equal(control.value,'changed');control.value=original;
 }
 assert.equal(f.d.beforeUnload(),false);
});
test('cancelled departure keeps entered unit values; explicit discard permits closing',()=>{
 const f=fixture();assert.equal(f.d.beforeClose(),false);assert.equal(f.controls.get('رقم الوحدة').value,'١٠١');
 f.allowDiscard(true);assert.equal(f.d.beforeClose(),true);assert.equal(f.calls.length,0);
});
test('unit save blocks ordinary departure while the first request is in flight',async()=>{
 let finish;const f=fixture({request:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=f.submit();await new Promise(setImmediate);
 f.allowDiscard(true);assert.equal(f.d.beforeClose(),false);assert.equal(f.d.beforeUnload(),true);assert.equal(f.prompts.length,0);
 finish({id:'wrong'});await pending;
 assert.equal(f.d.closed,undefined);assert.equal(f.d.beforeUnload(),true);
});
test('failed save retains values and warns about checking existing records before leaving',async()=>{
 const f=fixture({request:async()=>{throw Error('network unavailable');}});
 await f.submit();assert.equal(f.d.beforeClose(),false);assert.match(f.prompts.at(-1),/راجع ملف العقار/);
 assert.equal(f.controls.get('رقم الوحدة').value,'١٠١');assert.equal(f.d.beforeUnload(),true);
 // Actual session disposal bypasses user departure checks.
 f.d.close();assert.equal(f.d.closed,true);
});
test('verified unit save clears departure warning and closes without asking to discard',async()=>{
 const f=fixture();await f.submit();assert.equal(f.d.error,undefined);assert.equal(f.d.closed,true);
 assert.equal(f.d.beforeUnload(),false);assert.equal(f.d.beforeClose(),true);assert.equal(f.prompts.length,0);
});


test('lost readiness response reuses its exact identity and payload before saving master',async()=>{
 let first;
 const f=fixture({request:async q=>{
  if(q.name==='aqari_unit_readiness_register'){
   if(!first){first=structuredClone(q.args.p_data);throw Error('response lost after commit');}
   assert.deepEqual(JSON.parse(JSON.stringify(q.args.p_data)),JSON.parse(JSON.stringify(first)));
   return {id:first.id,unit_id:'unit',revision:1};
  }
  return savedResponse(q.args.p_data);
 }});
 await f.submit();assert.equal(f.d.closed,undefined);
 assert.ok([...f.controls.values()].every(c=>c.disabled));
 f.controls.get('رقم الوحدة').value='999'; // Even a programmatic mutation must not alter the pending request.
 await f.submit();assert.equal(f.d.closed,true);assert.equal(f.calls.length,3);
 assert.equal(f.calls[2].args.p_data.unitNo,'101');
});
test('master rejection resumes the same unit only after revision-zero readback',async()=>{
 let attempts=0;
 const f=fixture({request:async q=>{
  if(q.name==='aqari_unit_readiness_register')return {id:q.args.p_data.id,unit_id:'unit',revision:1};
  if(q.name==='aqari_property_full_file')return fileResponse({id:'unit',propertyId:'property',unitNo:'101',revision:0});
  if(++attempts===1)throw Object.assign(Error('MFA_REQUIRED'),{status:403,code:'42501'});
  return savedResponse(q.args.p_data);
 }});
 await f.submit();await f.submit();assert.equal(f.d.closed,true);
 assert.deepEqual(f.calls.map(c=>c.name),['aqari_unit_readiness_register','aqari_unit_master_save','aqari_property_full_file','aqari_unit_master_save']);
 assert.equal(JSON.stringify(f.calls[1].args),JSON.stringify(f.calls[3].args));
});
test('lost committed master response is recovered without a duplicate write',async()=>{
 let unit;
 const f=fixture({request:async q=>{
  if(q.name==='aqari_unit_readiness_register')return {id:q.args.p_data.id,unit_id:'unit',revision:1};
  if(q.name==='aqari_property_full_file')return fileResponse(unit);
  unit=savedResponse(q.args.p_data).unit;throw Error('response lost');
 }});
 f.controls.get('الإيجار المعلن').value='350.125';await f.submit();await f.submit();
 assert.equal(f.d.closed,true);assert.equal(f.d.beforeUnload(),false);
 assert.equal(f.calls.filter(c=>c.name==='aqari_unit_master_save').length,1);
});
test('failed, foreign, missing or conflicting readback never repeats the master write',async()=>{
 for(const variant of ['network','workspace','user','property','missing','duplicate','revision','floor','rent','services','null_revision']){
  let unit;
  const f=fixture({request:async q=>{
   if(q.name==='aqari_unit_readiness_register')return {id:q.args.p_data.id,unit_id:'unit',revision:1};
   if(q.name==='aqari_unit_master_save'){unit=savedResponse(q.args.p_data).unit;throw Error('response lost');}
   if(variant==='network')throw Error('read unavailable');
   const file=fileResponse({...unit});
   if(variant==='workspace')file.workspace_id='other';
   if(variant==='user')file.user_id='other';
   if(variant==='property')file.property.id='other';
   if(variant==='missing')file.units=[];
   if(variant==='duplicate')file.units.push({...unit});
   if(variant==='revision')file.units[0].revision=2;
   if(variant==='null_revision')file.units[0].revision=null;
   if(variant==='floor')file.units[0].floor='other';
   if(variant==='rent')file.units[0].statedRent=0;
   if(variant==='services')file.units[0].services={water:true};
   return file;
  }});
  await f.submit();await f.submit();
  assert.equal(f.d.closed,undefined,variant);assert.equal(f.d.beforeUnload(),true,variant);
  assert.equal(f.calls.filter(c=>c.name==='aqari_unit_master_save').length,1,variant);
 }
});
test('transactional first-step rejection allows corrections with a new request identity',async()=>{
 let attempts=0;
 const f=fixture({request:async q=>{
  if(q.name==='aqari_unit_readiness_register'){
   if(++attempts===1)throw Object.assign(Error('INVALID_READINESS_DATE'),{code:'23514'});
   return {id:q.args.p_data.id,unit_id:'unit',revision:1};
  }
  return savedResponse(q.args.p_data);
 }});
 await f.submit();assert.ok([...f.controls.values()].every(c=>!c.disabled));
 f.controls.get('رقم الوحدة').value='102';await f.submit();assert.equal(f.d.closed,true);
 assert.notEqual(f.calls[0].args.p_data.id,f.calls[1].args.p_data.id);assert.equal(f.calls[1].args.p_data.unit_no,'102');
});
test('success requires all saved unit fields and session scope to match',async()=>{
 for(const key of ['type','status','areaSqm','statedRent','leasedAssetAutomaticRef','internalSerial','parking','storage','services','workspace_id','user_id']){
  const f=fixture({request:async q=>{
   if(q.name==='aqari_unit_readiness_register')return {id:q.args.p_data.id,unit_id:'unit',revision:1};
   const saved=savedResponse(q.args.p_data);
   if(key.endsWith('_id'))saved[key]='other';else saved.unit[key]='wrong';return saved;
  }});
  await f.submit();assert.equal(f.d.closed,undefined,key);assert.equal(f.d.beforeUnload(),true,key);
 }
});
