import {node,field} from './dialog.js';
import {t} from './locale.js';
import {createOriginalDocumentUpload,originalDocument} from './original-document-upload.js';
import {createTemplateLogoContext} from './template-property-logo.js';

const CONTRACT_TITLE='ملف عقد العقار';
const propertyChoice=(rows,value='')=>{
 const input=node('select');input.name='property_id';input.required=true;
 if(!value){const placeholder=node('option',t('اختر العقار'));placeholder.value='';placeholder.disabled=true;input.append(placeholder);}
 for(const property of rows){const option=node('option',property.name);option.value=property.id;input.append(option);}
 input.value=value;return input;
};

/** Uploads one immutable PDF contract document under a verified property scope. */
export async function mountPropertyContractUpload(d,target,{propertyId=null,onBack}={}){
 const service=createTemplateLogoContext(d.session),access=await service.getAccess();
 if(!access.canUpload)throw Error('رفع عقد العقار يتطلب صلاحية تعديل العقارات ورفع المستندات.');
 const properties=await service.listProperties();
 if(!properties.length)throw Error('لا توجد عقارات متاحة لربط العقد بها.');
 const selected=propertyId?properties.find(property=>property.id===propertyId):null;
 if(propertyId&&!selected)throw Error('العقار المحدد غير متاح ضمن مساحة العمل الحالية.');
 const property=propertyChoice(properties,selected?.id||''),file=node('input'),form=node('form'),save=node('button',t('رفع وحفظ عقد PDF'));
 file.type='file';file.name='contract_pdf';file.accept='application/pdf,.pdf';file.required=true;save.type='submit';
 form.append(node('h3',t('رفع عقد العقار')),node('p',t('ارفع ملف PDF مباشرة. يُحفظ كملف أصلي خاص بالعقار المحدد ولا ينشئ عقد إيجار أو تحصيلًا تلقائيًا.')),field(t('العقار'),property),field(t('ملف العقد PDF'),file),save);
 if(selected)property.disabled=true;
 if(onBack){const back=node('button',t('رجوع'));back.type='button';back.onclick=onBack;form.prepend(back);}
 const upload=createOriginalDocumentUpload(d.session);
 form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
  const chosen=file.files?.[0];if(!chosen)throw Error('اختر ملف عقد PDF.');
  const blob=await originalDocument(chosen);if(blob.type!=='application/pdf')throw Error('اختر ملف PDF صالحًا لعقد العقار.');
  const current=properties.find(item=>item.id===property.value);if(!current)throw Error('اختر عقارًا محفوظًا ضمن مساحة العمل الحالية.');
  save.disabled=true;file.disabled=true;property.disabled=true;
  try{
   const row=await upload(chosen,{type:'property',ref:current.externalRef,category:'property_contract',title:CONTRACT_TITLE,propertyId:current.id});
   if(row.metadata?.property_id!==current.id)throw Error('لم يتأكد ربط العقد بمعرّف العقار.');
   file.value='';d.status.textContent=t('تم رفع عقد PDF والتحقق من حفظه وربطه بالعقار المحدد.');
  }finally{save.disabled=false;file.disabled=false;property.disabled=!!selected;}
 });};
 target.replaceChildren(form);
 return {form};
}
