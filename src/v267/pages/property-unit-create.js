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
// Validate both numeric fields before readiness creates the unit identity.
function unitDecimal(value,kind){
 const normalized=normalizeUnitNo(value).replace(/٫/g,'.');
 if(!normalized)return null;
 const valid=/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized);
 if(!valid||(kind==='area'&&(Number(normalized)<=0||Number(normalized)>100000000)))throw Error(kind==='area'?'راجع المساحة م².':'أدخل المبلغ بالدينار الكويتي، بثلاث منازل عشرية كحد أقصى ومن دون فواصل آلاف.');
 const [whole,fraction='']=normalized.split('.');
 return whole.replace(/^0+(?=\d)/,'')+'.'+fraction.padEnd(3,'0');
}
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value;return x;}
export function openPropertyUnitCreate(propertyId){
 const d=createDialog(translateStatic('إضافة وحدة من ملف العقار'));if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const form=node('form'),unitNo=input('text'),floor=input('text'),type=input('text'),status=select([['available',visibleText('شاغرة')],['ready',visibleText('جاهزة للتأجير')],['reserved',visibleText('محجوزة')],['cleaning',visibleText('تحتاج تنظيف')],['maintenance',visibleText('تحتاج صيانة')],['renovation',visibleText('تحتاج تجديد')]],'available'),area=input('text'),rent=input('text'),auto=input('text'),serial=input('text'),parking=input('text'),storage=input('text'),services=input('text'),readiness=select([['review_required',visibleText('تحتاج معاينة')],['ready',visibleText('جاهزة للتأجير')],['not_ready',visibleText('غير جاهزة للتأجير')]],'review_required'),inspected=input('date',today()),source=input('text'),reason=node('textarea');
 for(const c of [unitNo,floor,type,readiness,inspected,source,reason])c.required=true;area.inputMode=rent.inputMode='decimal';source.minLength=reason.minLength=3;setFormDefault(reason,'إضافة وحدة من الملف الكامل');services.placeholder='elevator, water, internet';
 for(const [label,c]of [[visibleText('رقم الوحدة'),unitNo],[visibleText('الدور'),floor],[visibleText('نوع الوحدة'),type],[visibleText('الحالة التشغيلية'),status],[visibleText('المساحة م²'),area],[visibleText('الإيجار المعلن'),rent],[visibleText('الرقم الآلي للعين المؤجرة'),auto],[visibleText('الرقم التسلسلي الداخلي'),serial],[visibleText('الموقف'),parking],[visibleText('المخزن'),storage],[visibleText('الخدمات — مفصولة بفاصلة'),services],[visibleText('حالة الجاهزية'),readiness],[visibleText('تاريخ المعاينة'),inspected],[visibleText('مرجع المعاينة'),source],[visibleText('السبب/النتيجة'),reason]])form.append(field(label,c));const save=node('button',translateStatic('حفظ الوحدة وربطها بالعقار'));save.type='submit';form.append(save);d.body.append(form);
 const controls=[unitNo,floor,type,status,area,rent,auto,serial,parking,storage,services,readiness,inspected,source,reason];
 const snapshot=()=>JSON.stringify(controls.map(c=>c.value));
 const pendingNotice=node('p');form.append(pendingNotice);
 const baseline=snapshot();let saving=false,unconfirmed=false,confirmed=false,pending=null;
 const hasDraft=()=>!confirmed&&(unconfirmed||snapshot()!==baseline);
 d.setBeforeUnload(()=>saving||hasDraft());
 d.setBeforeClose(()=>{
  if(saving||d.body.inert){d.status.textContent=translateStatic('انتظر اكتمال التحقق من حفظ الوحدة قبل المغادرة.');return false;}
  return !hasDraft()||window.confirm(translateStatic(unconfirmed?'لم يتأكد حفظ الوحدة. هل تريد المغادرة؟ راجع ملف العقار قبل إنشاء وحدة جديدة.':'توجد بيانات وحدة غير محفوظة. هل تريد تركها والمتابعة؟'));
 });
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  if(!pending){
   const number=normalizeUnitNo(unitNo.value);if(!number||number.length>80||/[<>\x00-\x1f]/.test(number))throw Error('راجع رقم الوحدة.');
   const areaValue=unitDecimal(area.value,'area'),rentValue=unitDecimal(rent.value,'rent');
   const serviceKeys=text(services.value).split(/[,،]/).map(x=>x.trim().toLowerCase()).filter(Boolean);if(serviceKeys.some(k=>!/^[a-z][a-z0-9_.-]{0,49}$/.test(k)))throw Error('مفاتيح الخدمات تستخدم أحرفًا إنجليزية مثل elevator أو water.');
   pending={readiness:{id:crypto.randomUUID(),property_id:propertyId,unit_no:number,expected_revision:0,state:readiness.value,inspected_on:inspected.value,source_ref:text(source.value),reason:text(formValue(reason))},data:{unitNo:number,floor:text(floor.value),type:text(type.value),status:status.value,areaSqm:areaValue,statedRent:rentValue,leasedAssetAutomaticRef:text(auto.value),internalSerial:text(serial.value),parking:text(parking.value),storage:text(storage.value),services:Object.fromEntries(serviceKeys.map(k=>[k,true]))},reason:'إنشاء الوحدة من الملف الكامل: '+text(formValue(reason)),unitId:null,masterAttempted:false};
   // An uncertain result belongs to this exact payload, never the next edit.
   for(const control of controls)control.disabled=true;
   pendingNotice.textContent=translateStatic('لم تتأكد العملية السابقة بعد. اضغط الحفظ للتحقق من العملية نفسها.');
  }
  saving=true;unconfirmed=true;
  try{
   const p=pending;
   if(!p.unitId){
    let row;
    try{row=await rpc('aqari_unit_readiness_register',{p_workspace_id:d.session.bound.workspace,p_action:'record',p_data:p.readiness});}
    catch(error){
     // These are transactional rejections of the first write. No master call ran.
     if(['22023','23514','23505','22007','22008','40001'].includes(error?.code)){
      pending=null;unconfirmed=false;pendingNotice.textContent='';for(const control of controls)control.disabled=false;
     }
     throw error;
    }
    d.session.check();if(row?.id!==p.readiness.id||!row.unit_id||Number(row.revision)!==1)throw Error('لم يتأكد إنشاء هوية الوحدة وسجل الجاهزية.');
    p.unitId=row.unit_id;
   }
   const matches=unit=>{
    if(unit?.id!==p.unitId||unit.propertyId!==propertyId||Number(unit.revision)!==1)return false;
    const decimal=value=>value==null?null:String(value).replace(/\.0*$/,'').replace(/(\.\d*?)0+$/,'$1');
    return Object.entries(p.data).every(([key,value])=>{
     if(key==='services')return unit.services&&Object.keys(unit.services).length===Object.keys(value).length&&Object.keys(value).every(k=>unit.services[k]===value[k]);
     if(key==='areaSqm'||key==='statedRent')return decimal(unit[key])===decimal(value);
     return unit[key]===value;
    });
   };
   let savedUnit;
   if(p.masterAttempted){
    // Never repeat a potentially committed master write before scoped readback.
    const file=await rpc('aqari_property_full_file',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_as_of:today()});d.session.check();
    if(file?.workspace_id!==d.session.bound.workspace||file?.user_id!==d.session.bound.user||file?.property?.id!==propertyId||!Array.isArray(file.units))throw Error('تعذر تأكيد نطاق ملف العقار.');
    const rows=file.units.filter(unit=>unit.id===p.unitId);
    if(rows.length!==1||rows[0].propertyId!==propertyId||rows[0].unitNo!==p.data.unitNo)throw Error('لم تتأكد إعادة قراءة الوحدة والدور والحقول الرسمية.');
    const unit=rows[0];
    if(matches(unit))savedUnit=unit;
    else if(unit.revision!==0&&unit.revision!=='0')throw Error('لم تثبت تعديلات الوحدة بعد إعادة القراءة. أعد فتح الوحدة ولا تكرر الحفظ قبل التحقق.');
   }
   if(!savedUnit){
    p.masterAttempted=true;
    const saved=await rpc('aqari_unit_master_save',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_unit_id:p.unitId,p_expected_revision:0,p_data:p.data,p_reason:p.reason});d.session.check();
    if(saved?.workspace_id!==d.session.bound.workspace||saved?.user_id!==d.session.bound.user||!matches(saved.unit))throw Error('لم تتأكد إعادة قراءة الوحدة والدور والحقول الرسمية.');
   }
  d.status.textContent=translateStatic('تم إنشاء الوحدة وتثبيت الدور والبيانات وسجل الجاهزية.');confirmed=true;unconfirmed=false;d.close();const hub=await import('./property-hub.js');return hub.openPropertyHub(propertyId);
  }finally{saving=false;}
 });};return true;
}
