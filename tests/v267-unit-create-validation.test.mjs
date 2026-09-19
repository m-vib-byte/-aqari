import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/v267/pages/property-unit-create.js',import.meta.url),'utf8');
function fixture(){
 const controls=new Map(),calls=[];
 const node=(tag,text='')=>({tag,textContent:text,value:'',children:[],append(...items){this.children.push(...items);}});
 const d={body:node('section'),status:node('p'),session:{bound:{workspace:'workspace'},check(){},client:{rpc(name,args){calls.push({name,args});return {name,args};}},async request(q){
  if(q.name==='aqari_unit_readiness_register')return {id:q.args.p_data.id,unit_id:'unit',revision:1};
  return {unit:{id:'unit',propertyId:'property',unitNo:q.args.p_data.unitNo,floor:q.args.p_data.floor,revision:1}};
 }},close(){},run(work){this.pending=Promise.resolve().then(work).catch(e=>{this.error=e;});return this.pending;}};
 const source=raw.replace(/^import .*;$/gm,'').replace(/\bexport /g,'').replace("const hub=await import('./property-hub.js');return hub.openPropertyHub(propertyId);","return true;");
 const context={node,field(label,c){controls.set(label,c);return c;},createDialog:()=>d,translateStatic:v=>v,visibleText:v=>v,Intl,Date,crypto:{randomUUID:()=> 'request'}};
 vm.createContext(context);vm.runInContext(source+'\nopenPropertyUnitCreate("property");',context);
 controls.get('رقم الوحدة').value='١٠١';controls.get('الدور').value='1';controls.get('نوع الوحدة').value='apartment';controls.get('مرجع المعاينة').value='inspection';
 return {calls,controls,d,async submit(){d.body.children[0].onsubmit({preventDefault(){}});await d.pending;}};
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
