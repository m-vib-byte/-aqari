import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const text=v=>String(v??'').normalize('NFKC').trim();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normalizeUnitNo=value=>text(value).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value;return x;}
export function openPropertyUnitCreate(propertyId){
 const d=createDialog(translateStatic('إضافة وحدة من ملف العقار'));if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const form=node('form'),unitNo=input('text'),floor=input('text'),type=input('text'),status=select([['available','شاغرة'],['ready','جاهزة للتأجير'],['reserved','محجوزة'],['cleaning','تحتاج تنظيف'],['maintenance','تحتاج صيانة'],['renovation','تحتاج تجديد']],'available'),area=input('text'),rent=input('text'),auto=input('text'),serial=input('text'),parking=input('text'),storage=input('text'),services=input('text'),readiness=select([['review_required','تحتاج معاينة'],['ready','جاهزة للتأجير'],['not_ready','غير جاهزة للتأجير']],'review_required'),inspected=input('date',today()),source=input('text'),reason=node('textarea');
 for(const c of [unitNo,floor,type,readiness,inspected,source,reason])c.required=true;area.inputMode=rent.inputMode='decimal';source.minLength=reason.minLength=3;reason.value='إضافة وحدة من الملف الكامل';services.placeholder='elevator, water, internet';
 for(const [label,c]of [['رقم الوحدة',unitNo],['الدور',floor],['نوع الوحدة',type],['الحالة التشغيلية',status],['المساحة م²',area],['الإيجار المعلن',rent],['الرقم الآلي للعين المؤجرة',auto],['الرقم التسلسلي الداخلي',serial],['الموقف',parking],['المخزن',storage],['الخدمات — مفصولة بفاصلة',services],['حالة الجاهزية',readiness],['تاريخ المعاينة',inspected],['مرجع المعاينة',source],['السبب/النتيجة',reason]])form.append(field(label,c));const save=node('button',translateStatic('حفظ الوحدة وربطها بالعقار'));save.type='submit';form.append(save);d.body.append(form);
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  const number=normalizeUnitNo(unitNo.value);if(!number||number.length>80||/[<>\x00-\x1f]/.test(number))throw Error('راجع رقم الوحدة.');
  const serviceKeys=text(services.value).split(/[,،]/).map(x=>x.trim().toLowerCase()).filter(Boolean);if(serviceKeys.some(k=>!/^[a-z][a-z0-9_.-]{0,49}$/.test(k)))throw Error('مفاتيح الخدمات تستخدم أحرفًا إنجليزية مثل elevator أو water.');
  const requestId=crypto.randomUUID(),row=await rpc('aqari_unit_readiness_register',{p_workspace_id:d.session.bound.workspace,p_action:'record',p_data:{id:requestId,property_id:propertyId,unit_no:number,expected_revision:0,state:readiness.value,inspected_on:inspected.value,source_ref:text(source.value),reason:text(reason.value)}});d.session.check();if(row?.id!==requestId||!row.unit_id||Number(row.revision)!==1)throw Error('لم يتأكد إنشاء هوية الوحدة وسجل الجاهزية.');
  const saved=await rpc('aqari_unit_master_save',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_unit_id:row.unit_id,p_expected_revision:0,p_data:{unitNo:number,floor:text(floor.value),type:text(type.value),status:status.value,areaSqm:text(area.value)||null,statedRent:text(rent.value)||null,leasedAssetAutomaticRef:text(auto.value),internalSerial:text(serial.value),parking:text(parking.value),storage:text(storage.value),services:Object.fromEntries(serviceKeys.map(k=>[k,true]))},p_reason:'إنشاء الوحدة من الملف الكامل: '+text(reason.value)});d.session.check();if(saved?.unit?.id!==row.unit_id||saved.unit.propertyId!==propertyId||saved.unit.unitNo!==number||saved.unit.floor!==text(floor.value)||Number(saved.unit.revision)!==1)throw Error('لم تتأكد إعادة قراءة الوحدة والدور والحقول الرسمية.');
  d.status.textContent=translateStatic('تم إنشاء الوحدة وتثبيت الدور والبيانات وسجل الجاهزية.');d.close();const hub=await import('./property-hub.js');return hub.openPropertyHub(propertyId);
 });};return true;
}

