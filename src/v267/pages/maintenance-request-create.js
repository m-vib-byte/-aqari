import {createDialog,node,field} from '../components/dialog.js';
import {currentScope} from '../api/session.js';
import {maintenanceCategories,kuwaitToday,maintenancePayload,saveMaintenanceRequest} from '../components/maintenance-request-create.js';

const pending=new Map();
export async function openMaintenanceRequest(){
 const bound=currentScope();
 const d=createDialog('طلب صيانة جديد');if(!d)return;
 const s=d.session,key=JSON.stringify([bound.user,bound.workspace,bound.role]);
 const form=node('form'),lease=node('select'),category=node('select'),description=node('textarea'),save=node('button','حفظ طلب الصيانة'),follow=node('button','متابعة طلبات المستأجرين');
 let leases=[],saved=false;
 form.hidden=true;lease.required=category.required=description.required=true;description.minLength=5;description.maxLength=3000;description.rows=5;save.type='submit';follow.type='button';follow.hidden=true;
 category.append(Object.assign(node('option','اختر نوع العطل'),{value:''}));
 for(const [value,label]of Object.entries(maintenanceCategories))category.append(Object.assign(node('option',label),{value}));
 form.append(field('العقد — العقار والوحدة والمستأجر',lease),field('نوع العطل',category),field('وصف العطل',description),save);
 d.body.append(node('p','اختر العقد الساري المرتبط بالعطل. بعد الحفظ يمكنك متابعة الحالة وإضافة الصور من سجل الطلبات.'),form,follow);
 function lock(){const frozen=pending.has(key)||saved;lease.disabled=category.disabled=description.disabled=frozen;save.disabled=saved;save.textContent=pending.has(key)?'التحقق والمحاولة مجدداً للطلب نفسه':'حفظ طلب الصيانة';}
 async function access(){
  const a=await s.request(s.client.rpc('aqari_workspace_access',{p_workspace_id:bound.workspace}));
  if(a?.workspace_id!==bound.workspace||a?.user_id!==bound.user||a?.role!==bound.role||a?.permissions?.maintenance?.write!==true||!['general_manager','property_manager'].includes(bound.role))throw Error('صلاحية إنشاء طلب الصيانة غير متاحة لهذا الحساب.');
 }
 const columns='id,request_no,workspace_id,lease_id,tenant_id,created_by,category_code,description,status,cost';
 form.onsubmit=async event=>{event.preventDefault();if(saved)return;
  await d.run(async()=>{
   await access();
   if(!pending.has(key))pending.set(key,maintenancePayload({id:crypto.randomUUID(),scope:bound,lease:leases.find(x=>x.id===lease.value),category:category.value,description:description.value}));
   const payload=pending.get(key);
   const row=await saveMaintenanceRequest({payload,check:()=>s.check(),read:id=>s.request(s.client.from('aqari_maintenance_requests').select(columns).eq('workspace_id',bound.workspace).eq('id',id).maybeSingle()),insert:value=>s.request(s.client.from('aqari_maintenance_requests').insert(value))});
   saved=true;pending.delete(key);d.status.textContent='تم حفظ طلب الصيانة رقم '+row.request_no+' والتحقق من ظهوره في قاعدة البيانات.';follow.hidden=false;
  });if(!d.closed)lock();
 };
 follow.onclick=()=>d.run(async()=>{const {openDesk}=await import('../../../v267-service-desk.js');s.check();d.close();await openDesk('maintenance');});
 d.onDispose(()=>{leases=[];form.replaceChildren();});
 await d.run(async()=>{
  await access();const today=kuwaitToday();
  for(let offset=0;;offset+=100){
   const rows=await s.request(s.client.from('aqari_leases').select('id,workspace_id,tenant_id,status,start_date,end_date,contract_no,unit:aqari_units(unit_no,property:aqari_properties(name)),tenant:aqari_tenants(full_name)').eq('workspace_id',bound.workspace).eq('status','signed').lte('start_date',today).gte('end_date',today).order('id').range(offset,offset+99));
   leases.push(...rows);if(rows.length<100)break;
  }
  lease.append(Object.assign(node('option','اختر العقد والوحدة'),{value:''}));
  for(const row of leases)lease.append(Object.assign(node('option',[row.contract_no,row.unit?.property?.name,row.unit?.unit_no,row.tenant?.full_name].filter(Boolean).join(' — ')),{value:row.id}));
  const retry=pending.get(key);
  if(retry){if(!leases.some(x=>x.id===retry.lease_id))lease.append(Object.assign(node('option','الطلب السابق — التحقق من الحفظ'),{value:retry.lease_id}));lease.value=retry.lease_id;category.value=retry.category_code;description.value=retry.description;}
  form.hidden=!leases.length&&!retry;
  d.status.textContent=retry?'توجد محاولة سابقة غير مؤكدة. تحقق من الطلب نفسه قبل إنشاء طلب آخر.':leases.length?'اختر العقد ونوع العطل ثم اكتب الوصف.':'لا توجد عقود موقعة وسارية متاحة لحسابك لإنشاء طلب صيانة.';
 });if(!d.closed)lock();
}
