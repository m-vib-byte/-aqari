import {createDialog,node,field} from '../components/dialog.js';

const text=(tag,value)=>node(tag,String(value??''));
const stamp=value=>value?new Date(value).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'}):'—';
const money=value=>Number(value||0).toLocaleString('ar-KW',{minimumFractionDigits:3,maximumFractionDigits:3})+' د.ك';
function option(value,label){const el=node('option',label);el.value=value;return el;}
function eventCard(kind,title,detail,date){const card=node('article');card.className='aq-owner-timeline-event';card.dataset.kind=kind;card.append(text('time',date||'—'),text('strong',title),text('small',detail));return card;}
async function pageAll(session,queryBuilder,limit=5000){
 const rows=[];for(let offset=0;offset<limit;offset+=250){const page=await session.request(queryBuilder(offset));rows.push(...page);if(page.length<250)return rows;}throw Error('عدد السجلات يتجاوز حد العرض الآمن. استخدم مرشحًا أدق.');
}

export function openTenantTimeline(){
 const d=createDialog('الملف الزمني للمستأجر');if(!d)return false;d.el.classList.add('aq-owner-center-dialog','aq-owner-timeline-dialog');
 const search=node('input'),tenant=node('select'),reload=node('button','تحديث'),header=node('section'),timeline=node('section');search.type='search';search.placeholder='ابحث بالاسم أو المدني أو الهاتف';reload.type='button';timeline.className='aq-owner-timeline';
 const controls=node('form');controls.className='aq-owner-timeline-controls';controls.append(field('بحث',search),field('المستأجر',tenant),reload);d.body.append(text('p','سجل زمني للقراءة فقط يجمع العقد والتحصيل والصيانة والمستندات ضمن صلاحيات الحساب. لا يعدّل أي سجل.'),controls,header,timeline);
 let access=null,tenants=[];
 function filtered(){const q=search.value.trim().toLowerCase();return q?tenants.filter(row=>[row.full_name,row.civil_id,row.phone,row.email].some(v=>String(v||'').toLowerCase().includes(q))):tenants;}
 function renderOptions(preserve=true){const current=preserve?tenant.value:'';tenant.replaceChildren(option('','اختر مستأجرًا'));for(const row of filtered())tenant.append(option(row.id,row.full_name+' · '+(row.civil_id||row.phone||'بدون رقم')));if([...tenant.options].some(x=>x.value===current))tenant.value=current;}
 async function loadDirectory(){
  access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
  if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access?.permissions?.tenants?.read!==true)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  tenants=await pageAll(d.session,offset=>d.session.client.from('aqari_tenants').select('id,full_name,civil_id,phone,email,is_active,external_ref').eq('workspace_id',d.session.bound.workspace).order('full_name').range(offset,offset+249));
  renderOptions(false);header.replaceChildren();timeline.replaceChildren();d.status.textContent=`تم تحميل ${tenants.length.toLocaleString('ar-KW')} ملف مستأجر ضمن صلاحيتك.`;
 }
 async function loadTimeline(){
  if(!tenant.value){header.replaceChildren();timeline.replaceChildren();return;}
  const selected=tenants.find(x=>x.id===tenant.value);if(!selected)throw Error('المستأجر لم يعد متاحًا. حدّث القائمة.');
  const id=selected.id;
  const leases=access.permissions?.contracts?.read===true?await pageAll(d.session,offset=>d.session.client.from('aqari_leases').select('id,external_ref,contract_no,start_date,end_date,monthly_rent,deposit,status,vacated_on,unit_id').eq('workspace_id',d.session.bound.workspace).eq('tenant_id',id).order('start_date',{ascending:false}).range(offset,offset+249)):[];
  const leaseIds=leases.map(x=>x.id),events=[];
  for(const lease of leases){events.push({date:lease.start_date,kind:'contract',title:`بدء العقد ${lease.contract_no||lease.external_ref||''}`,detail:`الحالة ${lease.status||'—'} • إيجار ${money(lease.monthly_rent)} • تأمين ${money(lease.deposit)}`});if(lease.end_date)events.push({date:lease.end_date,kind:'contract',title:`نهاية العقد ${lease.contract_no||lease.external_ref||''}`,detail:lease.vacated_on?`إخلاء ${lease.vacated_on}`:`الحالة ${lease.status||'—'}`});}
  if(access.permissions?.collections?.read===true&&leaseIds.length){
   for(let start=0;start<leaseIds.length;start+=100){const ids=leaseIds.slice(start,start+100);const payments=await pageAll(d.session,offset=>d.session.client.from('aqari_rent_payments').select('id,lease_id,reference,amount,period,paid_at,status,payment_method,created_at').eq('workspace_id',d.session.bound.workspace).in('lease_id',ids).order('created_at',{ascending:false}).range(offset,offset+249));for(const row of payments)events.push({date:row.created_at||row.paid_at,kind:'payment',title:`تحصيل ${money(row.amount)}`,detail:`${row.reference||'دون مرجع'} • ${row.payment_method||'—'} • ${row.status||'—'} • فترة ${row.period||'—'}`});}
  }
  if(access.permissions?.maintenance?.read===true){const maintenance=await pageAll(d.session,offset=>d.session.client.from('aqari_maintenance_requests').select('id,request_no,lease_id,description,status,cost,created_at,updated_at,category_code').eq('workspace_id',d.session.bound.workspace).eq('tenant_id',id).order('created_at',{ascending:false}).range(offset,offset+249));for(const row of maintenance)events.push({date:row.created_at,kind:'maintenance',title:`طلب صيانة #${row.request_no||'—'}`,detail:`${row.category_code||'غير مصنف'} • ${row.status||'—'} • ${row.description||''}${row.cost!=null?' • '+money(row.cost):''}`});}
  if(access.permissions?.documents?.read===true){const refs=[selected.external_ref,...leases.map(x=>x.external_ref)].filter(Boolean);for(let start=0;start<refs.length;start+=100){const batch=refs.slice(start,start+100);const docs=await pageAll(d.session,offset=>d.session.client.from('aqari_documents').select('id,document_no,document_type,entity_type,entity_ref,title,status,created_at,uploaded_at').eq('workspace_id',d.session.bound.workspace).in('entity_ref',batch).order('created_at',{ascending:false}).range(offset,offset+249));for(const row of docs)events.push({date:row.uploaded_at||row.created_at,kind:'document',title:row.title||row.document_no||'مستند',detail:`${row.document_type||'—'} • ${row.status||'—'}`});}}
  events.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  header.replaceChildren(text('h3',selected.full_name),text('p',`المدني: ${selected.civil_id||'—'} • الهاتف: ${selected.phone||'—'} • البريد: ${selected.email||'—'} • ${selected.is_active?'ملف نشط':'ملف مؤرشف'}`));timeline.replaceChildren();
  if(!events.length)timeline.append(text('p','لا توجد أحداث متاحة ضمن الأقسام المصرح بها.'));
  for(const item of events.slice(0,500))timeline.append(eventCard(item.kind,item.title,item.detail,stamp(item.date)));
  d.status.textContent=`تم تجميع ${Math.min(events.length,500).toLocaleString('ar-KW')} حدثًا للقراءة فقط${events.length>500?' من أصل '+events.length.toLocaleString('ar-KW'):''}.`;
 }
 search.oninput=()=>renderOptions(true);tenant.onchange=()=>d.run(loadTimeline);reload.onclick=()=>d.run(async()=>{const current=tenant.value;await loadDirectory();if(tenants.some(x=>x.id===current)){tenant.value=current;await loadTimeline();}});
 d.onDispose(()=>{tenants=[];access=null;header.replaceChildren();timeline.replaceChildren();});d.run(loadDirectory);return true;
}
