import {t,message} from '../components/locale.js';
import {createDialog,node} from '../components/dialog.js';
import {currentScope} from '../api/session.js';
import {inspectQuality} from '../components/data-quality.mjs';
const labels={duplicate_unit:'رقم وحدة مكرر داخل العقار — يحتاج مراجعة',property_without_units:'عقار تشغيلي بلا وحدات — يحتاج استكمال',possible_duplicate_civil_id:'رقم مدني مشترك بين ملفات — مرشح للمراجعة',shared_phone_review:'هاتف مشترك — لا يثبت تكرار الشخص',missing_name:'اسم مستأجر غير مسجل',draft_leases:'عقود مسودة — ليست عقوداً تشغيلية معتمدة',pending_contract_dates:'تواريخ عقود معلقة — يلزم المرجع المعتمد'};
export function openDataQuality(){
 if(currentScope().role!=='general_manager')throw Error('لا تملك صلاحية هذه العملية.');
 const d=createDialog(t('مركز جودة البيانات'),{localized:true});if(!d)return;
 d.body.append(node('p',t('فحص للقراءة فقط. لا يدمج السجلات ولا يصحح القيم. البريد الإلكتروني اختياري، والهاتف المشترك لا يعني تكرار المستأجر.')));
 const output=node('div'),refresh=node('button',t('فحص السجلات المحفوظة'));d.body.append(refresh,output);
 async function read(table,columns){const rows=[];for(let offset=0;;offset+=250){const page=await d.session.request(d.session.client.from(table).select(columns).eq('workspace_id',d.session.bound.workspace).order('id').range(offset,offset+249));rows.push(...page);if(page.length<250)return rows;if(rows.length>=10000)throw Error('تجاوز عدد السجلات حد الفحص؛ لم يكتمل التقرير.');}}
 function scan(){return d.run(async()=>{output.replaceChildren();const properties=await read('aqari_properties','id,name,metadata');const units=await read('aqari_units','id,property_id,unit_no');const tenants=await read('aqari_tenants','id,full_name,civil_id,phone');const leases=await read('aqari_leases','id,status,start_date,end_date');const findings=inspectQuality({properties,units,tenants,leases}),propertyNames=new Map(properties.map(row=>[row.id,row.name||row.id]));d.session.check();output.append(node('p',message('تمت قراءة {units} وحدة و{tenants} ملف مستأجر و{leases} عقداً من مساحة العمل الحالية.',{units:units.length,tenants:tenants.length,leases:leases.length})));for(const f of findings){const detail=node('details'),values=f.kind==='property_without_units'?f.ids.map(id=>propertyNames.get(id)||id):f.ids;detail.append(node('summary',t(labels[f.kind])+' ('+f.ids.length+')'),node('p',t(f.kind==='property_without_units'?'العقارات: ':'معرّفات السجلات: ')+values.join(t('، '))));output.append(detail);}if(!findings.length)output.append(node('p',t('لم يرصد هذا الفحص المحدود ملاحظات. لا يمثل ذلك اعتماداً شاملاً للبيانات.')));d.status.textContent=t('اكتمل الفحص للقراءة فقط. التعارضات المصدرية المعروفة تبقى معلقة دون تغيير.');});}
 refresh.onclick=scan;scan();
}
