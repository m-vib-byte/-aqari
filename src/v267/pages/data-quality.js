import {createDialog,node} from '../components/dialog.js';
import {currentScope} from '../api/session.js';
import {inspectQuality} from '../components/data-quality.mjs';
const labels={duplicate_unit:'رقم وحدة مكرر داخل العقار — يحتاج مراجعة',possible_duplicate_civil_id:'رقم مدني مشترك بين ملفات — مرشح للمراجعة',shared_phone_review:'هاتف مشترك — لا يثبت تكرار الشخص',missing_name:'اسم مستأجر غير مسجل',draft_leases:'عقود مسودة — ليست عقوداً تشغيلية معتمدة',pending_contract_dates:'تواريخ عقود معلقة — يلزم المرجع المعتمد'};
export function openDataQuality(){
 if(currentScope().role!=='general_manager')throw Error('لا تملك صلاحية هذه العملية.');
 const d=createDialog('مركز جودة البيانات');if(!d)return;
 d.body.append(node('p','فحص للقراءة فقط. لا يدمج السجلات ولا يصحح القيم. البريد الإلكتروني اختياري، والهاتف المشترك لا يعني تكرار المستأجر.'));
 const output=node('div'),refresh=node('button','فحص السجلات المحفوظة');d.body.append(refresh,output);
 async function read(table,columns){const rows=[];for(let offset=0;;offset+=250){const page=await d.session.request(d.session.client.from(table).select(columns).eq('workspace_id',d.session.bound.workspace).order('id').range(offset,offset+249));rows.push(...page);if(page.length<250)return rows;if(rows.length>=10000)throw Error('تجاوز عدد السجلات حد الفحص؛ لم يكتمل التقرير.');}}
 function scan(){return d.run(async()=>{output.replaceChildren();const units=await read('aqari_units','id,property_id,unit_no');const tenants=await read('aqari_tenants','id,full_name,civil_id,phone');const leases=await read('aqari_leases','id,status,start_date,end_date');const findings=inspectQuality({units,tenants,leases});d.session.check();output.append(node('p',`تمت قراءة ${units.length} وحدة و${tenants.length} ملف مستأجر و${leases.length} عقداً من مساحة العمل الحالية.`));for(const f of findings){const detail=node('details');detail.append(node('summary',labels[f.kind]+' ('+f.ids.length+')'),node('p','معرّفات السجلات: '+f.ids.join('، ')));output.append(detail);}if(!findings.length)output.append(node('p','لم يرصد هذا الفحص المحدود ملاحظات. لا يمثل ذلك اعتماداً شاملاً للبيانات.'));d.status.textContent='اكتمل الفحص للقراءة فقط. التعارضات المصدرية المعروفة تبقى معلقة دون تغيير.';});}
 refresh.onclick=scan;scan();
}
