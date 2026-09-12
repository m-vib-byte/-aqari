import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const nodes=[],calls=[];let sequence=0;
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.value='';this.isConnected=true;nodes.push(this);}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0]?.value||'';}
  detach(){this.isConnected=false;this.children.forEach(x=>x.detach());}
  replaceChildren(...items){this.children.forEach(x=>x.detach());this.children=[];this.append(...items);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}set textContent(value){this._text=value;}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,input)=>{const el=node('label',label);el.append(input);return el;};
 const data={leases:[{id:'l1',unit_id:'u1',property_id:'p1',contract_no:'C1',status:'signed',start_date:'2000-01-01',end_date:'2099-12-31'},{id:'l2',unit_id:'u2',property_id:'p2',contract_no:'C2',status:'signed',start_date:'2000-01-01',end_date:'2099-12-31'},{id:'past',unit_id:'u3',property_id:'p2',contract_no:'OLD',status:'expired',start_date:'2000-01-01',end_date:'2001-01-01'}],properties:[{id:'p1',name:'P1'},{id:'p2',name:'P2'}],documents:[],allocations:[],inspections:[],commercial:[{lease_id:'l1',revision:3,grace_days:12,sales_percentage:7.5,cam_amount:20.125,permitted_activity:'تجارة محفوظة',license_no:'LIC-1',license_expires_on:'2027-12-31',compliance_reference:'مراجعة محفوظة'}]};
 const flags={wrongCam:false};
 const d={body:node('div'),status:node('p'),session:{bound:{workspace:'w'},request:async p=>p,client:{rpc(name,args){calls.push(structuredClone(args));if(args.p_action==='list')return structuredClone(data);if(args.p_domain==='common_charges'){data.allocations.push({...args.p_data});return args.p_data;}if(args.p_domain==='commercial'){const p=args.p_data;data.commercial=[{...p,lease_id:p.id,revision:p.revision+1,cam_amount:flags.wrongCam?999:p.cam_amount}];return data.commercial[0];}throw Error(name);}}},onDispose(){},run(task){d.task=Promise.resolve().then(task).catch(error=>{d.status.textContent=error.message;});return d.task;}};
 const context={node,field,createDialog:()=>d,mountCommercialSales(){},crypto:{randomUUID:()=> 'id-'+(++sequence)},Date};vm.createContext(context);vm.runInContext(fs.readFileSync('src/v267/pages/compliance-center.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
 const control=label=>nodes.find(x=>x.isConnected&&x.tag==='label'&&x._text===label)?.children[0];
 return {d,calls,data,flags,control,async start(){context.openComplianceCenter();await d.task;},async submit(button){const form=nodes.find(x=>x.isConnected&&x.tag==='form'&&x.children.some(y=>y.tag==='button'&&y.textContent===button));form.onsubmit({preventDefault(){}});await d.task;}};
}
test('switching common-charge property discards old allocation rows and excludes expired leases',async()=>{
 const f=fixture();await f.start();f.control('العقار').value='p1';f.control('العقار').onchange();f.control('الوحدة u1 — العقد C1').value='10';
 f.control('العقار').value='p2';f.control('العقار').onchange();assert.equal(f.control('الوحدة u3 — العقد OLD'),undefined);f.control('الوحدة u2 — العقد C2').value='20';f.control('مرجع الفاتورة').value='INV-TEST';f.control('الإجمالي').value='20';await f.submit('اعتماد التوزيع');
 const write=f.calls.find(x=>x.p_action==='allocate');assert.deepEqual(write.p_data.allocations,[{unit_id:'u2',amount:'20.000'}]);assert.equal(write.p_data.property_id,'p2');assert.match(f.d.status.textContent,/تم الحفظ والتحقق/);
});
test('commercial amendment preloads saved values and verifies all returned terms instead of revision alone',async()=>{
 for(const wrongCam of [false,true]){
  const f=fixture();await f.start();f.control('العقد').value='l1';f.control('العقد').onchange();assert.equal(f.control('أيام السماح').value,'12');assert.equal(f.control('CAM د.ك').value,'20.125');assert.equal(f.control('النشاط المسموح').value,'تجارة محفوظة');f.flags.wrongCam=wrongCam;
  await f.submit('حفظ واعتماد');assert.equal(f.calls.find(x=>x.p_action==='save').p_data.revision,3);assert.match(f.d.status.textContent,wrongCam?/لم تتطابق إعادة القراءة/:/تم الحفظ والتحقق/);
 }
});
