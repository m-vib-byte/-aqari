import {readStoredOriginal} from '../components/stored-original.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createOriginalDocumentUpload,originalDocument} from '../components/original-document-upload.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {contractAdministration,mountSignatureReview,signatureLabel} from '../components/contract-administration.js';
import {t} from '../components/locale.js';
function select(rows){const el=node('select');for(const [value,label]of [['',t('اختر السجل')],...rows]){const o=node('option',label);o.value=value;el.append(o);}el.required=true;return el;}
export function validOriginalContractDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||value.startsWith('0000'))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function openContractArchive(filters={}){
 const d=createDialog(t('أرشيف العقود السابقة'));if(!d)return false;const urls=createPrivateUrls(d);
 const button=(label,fn)=>{const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(fn);return b;};
 async function home(){
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  urls.clear();d.body.replaceChildren(button('إعادة المحاولة',home));
  const rows=await contractAdministration(d,'archives',filters);urls.clear();d.body.replaceChildren(node('p',t('أرشيف فقط: لا ينشئ عقدًا جديدًا أو إشغالًا أو تحصيلًا، ولا يرسل المستند تلقائيًا.')),button('أرشفة عقد سابق',uploadForm),button('تحديث',home));
  if(!rows.length)d.body.append(node('p',t('لا توجد عقود مؤرشفة في هذا النطاق.')));
  for(const row of rows){const card=node('section'),output=node('div');card.append(node('h3',row.reference),node('p',t('تاريخ العقد الأصلي')+': '+(row.original_date||t('غير موثق'))),node('p',[row.tenant_name,row.property_name,row.unit_no].join(' · ')),node('p',t('حالة المستند')+': '+t(row.document_status==='uploaded'?'مرفوع ومحفوظ':'غير مكتمل')),node('p',t('حالة التواقيع')+': '+signatureLabel(row.signature_status)),button('فتح الملف الأصلي',async()=>{const {blob,note}=await readStoredOriginal(d.session,{id:row.document_id,storagePath:row.storage_path});d.session.check();const preview=node('iframe');preview.title=row.original_filename||t('أصل العقد المؤرشف');preview.setAttribute('sandbox','');preview.src=urls.create(blob);preview.style.cssText='width:100%;height:75vh;border:1px solid #d8c8ae';output.replaceChildren(preview);d.status.textContent=t(note);}),button('مراجعة التواقيع',async()=>{output.replaceChildren();await mountSignatureReview(d,output,row.document_id);}),output);d.body.append(card);}
 }
 async function uploadForm(){
  const read=table=>d.session.client.from(table).select('*').eq('workspace_id',d.session.bound.workspace);
  const [tenants,properties,units]=await Promise.all(['aqari_tenants','aqari_properties','aqari_units'].map(table=>d.session.request(read(table))));d.session.check();
  const tenant=select(tenants.map(r=>[r.id,r.full_name])),property=select(properties.map(r=>[r.id,r.name])),unit=select([]),reference=node('input'),originalDate=node('input'),file=node('input'),form=node('form'),save=node('button',t('حفظ في الأرشيف فقط'));
  let pending=null;const upload=createOriginalDocumentUpload(d.session);reference.required=true;reference.maxLength=180;originalDate.type='date';originalDate.required=true;file.type='file';file.accept='application/pdf,image/jpeg,image/png,image/webp';file.required=true;save.type='submit';
  property.onchange=()=>{unit.replaceChildren();for(const [value,label]of [['',t('اختر الوحدة')],...units.filter(r=>r.property_id===property.value).map(r=>[r.id,r.unit_no])]){const o=node('option',label);o.value=value;unit.append(o);}};
  if(filters.property_id&&properties.some(r=>r.id===filters.property_id)){property.value=filters.property_id;property.onchange();}
  d.body.replaceChildren(button('العودة للأرشيف',home),node('p',t('اربط الأصل بالسجلات الموجودة. لا يُحجز رقم عقد جديد ولا تُسجل مبالغ.')));
  form.append(field(t('المستأجر'),tenant),field(t('العقار'),property),field(t('الوحدة'),unit),field(t('رقم أو وصف العقد السابق'),reference),field(t('تاريخ العقد الأصلي'),originalDate),field(t('نسخة العقد السابق'),file),save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
   if(!pending){const chosen=tenants.find(r=>r.id===tenant.value),p=properties.find(r=>r.id===property.value),u=units.find(r=>r.id===unit.value&&r.property_id===property.value),chosenFile=file.files?.[0],title=reference.value.trim(),date=originalDate.value;
    if(!chosen?.external_ref||!p||!u||!chosenFile||!title)throw Error('أكمل ربط المستأجر والعقار والوحدة والملف.');
    if(title.length>180)throw Error('أدخل رقمًا أو وصفًا للعقد السابق لا يتجاوز ١٨٠ حرفًا.');
    if(!validOriginalContractDate(date))throw Error('أدخل تاريخ العقد الأصلي الصحيح من المستند.');
    if(!chosenFile.name||chosenFile.name.length>250)throw Error('اختر ملفًا باسم لا يتجاوز ٢٥٠ حرفًا.');
    await originalDocument(chosenFile);d.session.check();
    pending={id:crypto.randomUUID(),original_date:date,tenant_id:chosen.id,property_id:u.property_id,unit_id:u.id,reference:title,file:chosenFile,tenantRef:chosen.external_ref};
   }
   try{
    const doc=await upload(pending.file,{type:'tenant',ref:pending.tenantRef,category:'archived_contract',title:pending.reference});
    const {file:ignored,tenantRef,...payload}=pending;payload.document_id=doc.id;
    const saved=await contractAdministration(d,'archive',payload);const rows=await contractAdministration(d,'archives');
    if(saved.id!==pending.id||!rows.some(x=>x.id===saved.id&&x.document_id===doc.id))throw Error('لم تتأكد إعادة قراءة الأرشيف.');
    pending=null;await home();d.status.textContent=t('حُفظ الأصل في الأرشيف فقط. لم يُنشأ عقد أو إرسال.');
   }catch(error){for(const el of [tenant,property,unit,reference,originalDate,file])el.disabled=true;save.textContent=t('التحقق من نفس عملية الأرشفة');throw error;}
  });};
 }
 d.body.append(button('إعادة المحاولة',home));d.run(home);return true;
}
