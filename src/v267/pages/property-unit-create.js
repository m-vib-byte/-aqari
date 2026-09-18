import {t as visibleText} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
// Localized form hints keep their original persisted default until the user edits them.
const formDefaults=new WeakMap();
function setFormDefault(control,source,suffix=''){const display=visibleText(source)+suffix;control.value=display;formDefaults.set(control,{display,canonical:source+suffix});return control;}
function formValue(control){const initial=formDefaults.get(control);return initial&&control.value===initial.display?initial.canonical:control.value;}

const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const text=v=>String(v??'').normalize('NFKC').trim();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normalizeUnitNo=value=>text(value).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value;return x;}
export function openPropertyUnitCreate(propertyId){
 const d=createDialog(translateStatic('إضافة وحدة من ملف العقار'));if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const form=node('form'),unitNo=input('text'),floor=input('text'),type=input('text'),status=select([['available',visibleText('شاغرة')],['ready',visibleText('جاهزة للتأجير')],['reserved',visibleText('محجوزة')],['cleaning',visibleText('تحتاج تنظيف')],['maintenance',visibleText('تحتاج صيانة')],['renovation',visibleText('تحتاج تجديد')]],'available'),area=input('text'),rent=input('text'),auto=input('text'),serial=input('text'),parking=input('text'),storage=input('text'),services=input('text'),readiness=select([['review_required',visibleText('تحتاج معاينة')],['ready',visibleText('جاهزة للتأجير')],['not_ready',visibleText('غير جاهزة للتأجير')]],'review_required'),inspected=input('date',today()),source=input('text'),reason=node('textarea');
 for(const c of [unitNo,floor,type,readiness,inspected,source,reason])c.required=true;area.inputMode=rent.inputMode='decimal';source.minLength=reason.minLength=3;setFormDefault(reason,'إضافة وحدة من الملف الكامل');services.placeholder='elevator, water, internet';
 for(const [label,c]of [[visibleText('رقم الوحدة'),unitNo],[visibleText('الدور'),floor],[visibleText('نوع الوحدة'),type],[visibleText('الحالة التشغيلية'),status],[visibleText('المساحة م²'),area],[visibleText('الإيجار المعلن'),rent],[visibleText('الرقم الآلي للعين المؤجرة'),auto],[visibleText('الرقم التسلسلي الداخلي'),serial],[visibleText('الموقف'),parking],[visibleText('المخزن'),storage],[visibleText('الخدمات — مفصولة بفاصلة'),services],[visibleText('حالة الجاهزية'),readiness],[visibleText('تاريخ المعاينة'),inspected],[visibleText('مرجع المعاينة'),source],[visibleText('السبب/النتيجة'),reason]])form.append(field(label,c));const save=node('button',translateStatic('حفظ الوحدة وربطها بالعقار'));save.type='submit';form.append(save);d.body.append(form);
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  const number=normalizeUnitNo(unitNo.value);if(!number||number.length>80||/[<>\x00-\x1f]/.test(number))throw Error('راجع رقم الوحدة.');
  const serviceKeys=text(services.value).split(/[,،]/).map(x=>x.trim().toLowerCase()).filter(Boolean);if(serviceKeys.some(k=>!/^[a-z][a-z0-9_.-]{0,49}$/.test(k)))throw Error('مفاتيح الخدمات تستخدم أحرفًا إنجليزية مثل elevator أو water.');
  const requestId=crypto.randomUUID(),row=await rpc('aqari_unit_readiness_register',{p_workspace_id:d.session.bound.workspace,p_action:'record',p_data:{id:requestId,property_id:propertyId,unit_no:number,expected_revision:0,state:readiness.value,inspected_on:inspected.value,source_ref:text(source.value),reason:text(formValue(reason))}});d.session.check();if(row?.id!==requestId||!row.unit_id||Number(row.revision)!==1)throw Error('لم يتأكد إنشاء هوية الوحدة وسجل الجاهزية.');
  const saved=await rpc('aqari_unit_master_save',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_unit_id:row.unit_id,p_expected_revision:0,p_data:{unitNo:number,floor:text(floor.value),type:text(type.value),status:status.value,areaSqm:text(area.value)||null,statedRent:text(rent.value)||null,leasedAssetAutomaticRef:text(auto.value),internalSerial:text(serial.value),parking:text(parking.value),storage:text(storage.value),services:Object.fromEntries(serviceKeys.map(k=>[k,true]))},p_reason:'إنشاء الوحدة من الملف الكامل: '+text(formValue(reason))});d.session.check();if(saved?.unit?.id!==row.unit_id||saved.unit.propertyId!==propertyId||saved.unit.unitNo!==number||saved.unit.floor!==text(floor.value)||Number(saved.unit.revision)!==1)throw Error('لم تتأكد إعادة قراءة الوحدة والدور والحقول الرسمية.');
  d.status.textContent=translateStatic('تم إنشاء الوحدة وتثبيت الدور والبيانات وسجل الجاهزية.');d.close();const hub=await import('./property-hub.js');return hub.openPropertyHub(propertyId);
 });};return true;
}

