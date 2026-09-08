import {createSession,currentScope,safeError} from '../api/session.js';
import {node,field} from '../components/dialog.js';
import {paymentTotal} from '../components/financial-evidence.mjs';
let installed=false,session,busy=false;const panels=new Map();
const titles={financeSuitePage:'الحسابات — التحصيل المحفوظ',reports:'التقارير — بيانات التشغيل المؤكدة',documentsHub:'العقود والمستندات المحفوظة'};
export function installFinancialIntegrity(){
 if(installed)return;currentScope();installed=true;
 for(const [id,title] of Object.entries(titles)){
 const page=document.getElementById(id);if(!page)continue;
 // Keep legacy IDs available to old renderers, but never display/export their estimates.
 const legacy=node('div');legacy.hidden=true;legacy.inert=true;legacy.style.setProperty('display','none','important');while(page.firstChild)legacy.append(page.firstChild);page.append(legacy);
 const panel=node('section'),status=node('p'),body=node('div'),month=node('input'),refresh=node('button','قراءة السجلات المحفوظة');panel.className='aq267-tools';month.type='month';
 // ISO month independent of locale separator/order.
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit'}).formatToParts(new Date());month.value=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
 status.setAttribute('role','status');panel.append(node('h2',title),field('شهر التحصيل الفعلي',month),refresh,status,body);page.append(panel);panels.set(id,{status,body,month,refresh});refresh.onclick=()=>load(id);month.onchange=()=>load(id);status.textContent='اختر قراءة السجلات للتحقق من البيانات الحالية.';
 }
 for(const name of ['snapshotFinanceV60','exportFinanceCsvV60'])window[name]=()=>{const p=panels.get('financeSuitePage');if(p)p.status.textContent='التصدير المالي الشامل غير متاح حتى اكتمال الدفاتر؛ لا تُصدّر تقديرات الواجهة القديمة.';};
 window.renderFinanceV60=()=>{};
 document.addEventListener('click',e=>{const route=e.target.closest?.('[data-v199-go],[data-v205-route]');const id=route?.dataset.v199Go||route?.dataset.v205Route;if(panels.has(id))queueMicrotask(()=>load(id));},true);
 window.addEventListener('aqari:auth-boundary',()=>{session?.close();for(const p of panels.values()){p.body.replaceChildren();p.status.textContent='يلزم التحقق من الجلسة وإعادة القراءة.';}});
}
async function load(id){
 const p=panels.get(id);if(!p||busy)return;busy=true;p.refresh.disabled=true;p.body.replaceChildren();p.status.textContent='جارٍ قراءة قاعدة البيانات…';session?.close();let own;
 try{session=createSession();own=session;await own.connect();const read=async(table,columns)=>{const rows=[];for(let offset=0;;offset+=250){const page=await own.request(own.client.from(table).select(columns).eq('workspace_id',own.bound.workspace).order('id').range(offset,offset+249));rows.push(...page);if(page.length<250)return rows;if(rows.length>=10000)throw Error('لم يكتمل الفحص بسبب حجم السجلات.');}};
 const leases=await read('aqari_leases','id,status,tenant_id,unit_id,start_date,end_date');const tenants=await read('aqari_tenants','id,full_name');
 if(id==='documentsHub'){const documents=await read('aqari_documents','id,status');own.check();p.body.append(node('p',`العقود المحفوظة: ${leases.length} • المسودات: ${leases.filter(x=>x.status==='draft').length} • المستندات المؤكد رفعها: ${documents.filter(x=>x.status==='uploaded').length}`),node('p','المسودة ليست عقداً موقعاً. افتح المزيد ← العقود لمراجعة ملف العقد؛ وأضف المستند من المزيد ← مسح مستند.'));}
 else{const payments=await read('aqari_rent_payments','id,amount,status,paid_at');const total=paymentTotal(payments,p.month.value);own.check();p.body.append(node('h3',`التحصيل الفعلي خلال ${p.month.value}: ${total.amount} د.ك`),node('p',`عدد الدفعات المحفوظة في الفترة: ${total.count}. الفترة حسب تاريخ الدفع، وليست شهر استحقاق الإيجار.`),node('p','صافي الربح والمصروفات والرواتب والهامش والتوقعات: غير متاحة للاعتماد حتى اكتمال الدفاتر المحاسبية. عدم وجود سجل لا يعني أن المصروف صفر.'),node('p',`جودة البيانات: ${tenants.filter(x=>!x.full_name?.trim()).length} ملفات بأسماء ناقصة؛ ${leases.filter(x=>!x.start_date||!x.end_date).length} عقداً بتواريخ معلقة؛ ${leases.filter(x=>x.status==='draft').length} عقداً مسودة.`),node('p','لا تُحسب نسبة إشغال أو تحصيل أو جودة شاملة من سجلات المصدر وحدها. كشف إيجارات المصدر مستقل عن الإيراد المحصل.'));}
 p.status.textContent='تمت القراءة من مساحة العمل الحالية. لا يوجد تغيير أو حفظ مالي من هذه الشاشة.';
 }catch(e){p.body.replaceChildren();p.status.textContent=safeError(e);}finally{busy=false;p.refresh.disabled=false;own?.close();}
}
