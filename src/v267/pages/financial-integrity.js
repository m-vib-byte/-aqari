import {uiText,setText} from '../components/ui-text.js';
import {createSession,currentScope,safeError} from '../api/session.js';
import {node,field} from '../components/dialog.js';
import {paymentTotal} from '../components/financial-evidence.mjs';
let installed=false,session,busy=false;const panels=new Map();
const titles={collectionProPage:'التحصيل المحفوظ ومراجعة المستحقات',financeSuitePage:'الحسابات — التحصيل المحفوظ',reports:'التقارير — بيانات التشغيل المؤكدة',documentsHub:'العقود والمستندات المحفوظة'};
export function installFinancialIntegrity(){
 if(installed)return;currentScope();installed=true;
 for(const [id,title] of Object.entries(titles)){
 const page=document.getElementById(id);if(!page)continue;
 // Keep legacy IDs available to old renderers, but never display/export their estimates.
 const legacy=node('div');legacy.hidden=true;legacy.inert=true;legacy.style.setProperty('display','none','important');if(id==='collectionProPage'){const old=page.querySelector(':scope > .c');if(old)legacy.append(old);}else{while(page.firstChild)legacy.append(page.firstChild);}page.append(legacy);
 const panel=node('section'),status=node('p'),body=node('div'),month=node('input'),refresh=uiText('button','قراءة السجلات المحفوظة');panel.className='aq267-tools';month.type='month';
 // ISO month independent of locale separator/order.
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit'}).formatToParts(new Date());month.value=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
 const monthField=field('',month);setText(monthField.querySelector('label'),'شهر التحصيل الفعلي');status.setAttribute('role','status');panel.append(uiText('h2',title),monthField,refresh,status,body);page.append(panel);panels.set(id,{status,body,month,refresh});refresh.onclick=()=>load(id);month.onchange=()=>load(id);setText(status,'اختر قراءة السجلات للتحقق من البيانات الحالية.');
 }
 for(const name of ['snapshotFinanceV60','exportFinanceCsvV60'])window[name]=()=>{const p=panels.get('financeSuitePage');if(p)setText(p.status,'التصدير المالي الشامل غير متاح حتى اكتمال الدفاتر؛ لا تُصدّر تقديرات الواجهة القديمة.');};
 window.renderFinanceV60=()=>{};
 document.addEventListener('click',e=>{const route=e.target.closest?.('[data-v199-go],[data-v205-route]');const id=route?.dataset.v199Go||route?.dataset.v205Route;if(panels.has(id))queueMicrotask(()=>load(id));},true);
 window.addEventListener('aqari:auth-boundary',()=>{session?.close();for(const p of panels.values()){p.body.replaceChildren();setText(p.status,'يلزم التحقق من الجلسة وإعادة القراءة.');}});
}
async function load(id){
 const p=panels.get(id);if(!p||busy)return;busy=true;p.refresh.disabled=true;p.body.replaceChildren();setText(p.status,'جارٍ قراءة قاعدة البيانات…');session?.close();let own;
 try{session=createSession();own=session;await own.connect();const read=async(table,columns)=>{const rows=[];for(let offset=0;;offset+=250){const page=await own.request(own.client.from(table).select(columns).eq('workspace_id',own.bound.workspace).order('id').range(offset,offset+249));rows.push(...page);if(page.length<250)return rows;if(rows.length>=10000)throw Error('لم يكتمل الفحص بسبب حجم السجلات.');}};
 const leases=await read('aqari_leases','id,status,tenant_id,unit_id,start_date,end_date');const tenants=await read('aqari_tenants','id,full_name');
 if(id==='documentsHub'){const documents=await read('aqari_documents','id,status');own.check();p.body.append(uiText('p','العقود المحفوظة: {leases} • المسودات: {drafts} • المستندات المؤكد رفعها: {documents}',{leases:leases.length,drafts:leases.filter(x=>x.status==='draft').length,documents:documents.filter(x=>x.status==='uploaded').length}),uiText('p','المسودة ليست عقداً موقعاً. افتح المزيد ← العقود لمراجعة ملف العقد؛ وأضف المستند من المزيد ← مسح مستند.'));}
 else{const payments=await read('aqari_rent_payments','id,amount,status,paid_at');const total=paymentTotal(payments,p.month.value);own.check();p.body.append(uiText('h3','التحصيل الفعلي خلال {month}: {amount} د.ك',{month:p.month.value,amount:total.amount}),uiText('p','عدد الدفعات المحفوظة في الفترة: {count}. الفترة حسب تاريخ الدفع، وليست شهر استحقاق الإيجار.',{count:total.count}),uiText('p','صافي الربح والمصروفات والرواتب والهامش والتوقعات: غير متاحة للاعتماد حتى اكتمال الدفاتر المحاسبية. عدم وجود سجل لا يعني أن المصروف صفر.'),uiText('p','جودة البيانات: {names} ملفات بأسماء ناقصة؛ {dates} عقداً بتواريخ معلقة؛ {drafts} عقداً مسودة.',{names:tenants.filter(x=>!x.full_name?.trim()).length,dates:leases.filter(x=>!x.start_date||!x.end_date).length,drafts:leases.filter(x=>x.status==='draft').length}),uiText('p','لا تُحسب نسبة إشغال أو تحصيل أو جودة شاملة من سجلات المصدر وحدها. كشف إيجارات المصدر مستقل عن الإيراد المحصل.'));}
 if(id==='collectionProPage')p.body.append(uiText('p','المستحقات والمتأخرات ونسبة التحصيل لا تُعتمد من إجمالي إيجار المصدر أو أسماء بلا عقود موقّعة. استخدم العقود المعتمدة والدفعات المحفوظة؛ لا تُصدر وصلًا من قيمة الإيجار وحدها.'));
 setText(p.status,'تمت القراءة من مساحة العمل الحالية. لا يوجد تغيير أو حفظ مالي من هذه الشاشة.');
 }catch(e){p.body.replaceChildren();setText(p.status,safeError(e));}finally{busy=false;p.refresh.disabled=false;own?.close();}
}
