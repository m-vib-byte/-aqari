import {presentation,withPresentation,latinDigits} from '../domain/property-presentation.js';
import {node,field} from './dialog.js';
import {decodeImage} from './scan-image.js';
let activeForm;

export function propertyFields(container,existing,{check=()=>{}}={}){
 activeForm?.dispose();
 const meta=presentation(existing),form=node('div');form.className='aq267-property-form';
 const input=(value='',numeric=false)=>{const el=node('input');el.value=value;el.maxLength=250;if(numeric)el.inputMode='decimal';return el;};
 const name=input(existing?.[0]||''),location=input(meta.location),price=input(meta.price,true),phone=input(meta.phone),purpose=node('select');
 name.required=true;name.readOnly=Boolean(existing);name.autocomplete='off';location.autocomplete='street-address';phone.type='tel';phone.autocomplete='tel';phone.placeholder='٥١٢٣٤٥٦٧';
 for(const [v,label]of [['rent','للإيجار'],['sale','للبيع']]){const o=node('option',label);o.value=v;purpose.append(o);}purpose.value=meta.purpose||'rent';
 const priceField=field('السعر المطلوب — د.ك / شهر (اختياري)',price);const updatePriceLabel=()=>priceField.querySelector('label').textContent=purpose.value==='sale'?'سعر البيع — د.ك (اختياري)':'الإيجار المطلوب — د.ك / شهر (اختياري)';purpose.onchange=updatePriceLabel;updatePriceLabel();
 form.append(field('اسم العقار *',name),field('المنطقة والعنوان (اختياري)',location),field('نوع العرض',purpose),priceField,field('هاتف التواصل (اختياري)',phone));
 const photoSection=node('section'),photoInput=node('input'),photoStatus=node('p'),previews=node('div');photoInput.type='file';photoInput.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';photoInput.multiple=true;photoStatus.setAttribute('role','status');previews.className='aq267-photo-previews';photoSection.className='aq267-photo-field';
 photoSection.append(field('صور العقار — حتى ٤ صور (اختياري)',photoInput),photoStatus,previews);form.append(photoSection);
 let photos=[...meta.photos],processing=false,disposed=false;
 const live=()=>{if(disposed)throw Error('أعد فتح نموذج العقار.');check();};
 const boundary=()=>{try{live();}catch{activeForm?.dispose();}};
 window.addEventListener('aqari:auth-boundary',boundary);
 function renderPhotos(){previews.replaceChildren();photos.forEach((src,i)=>{const item=node('div'),image=node('img'),remove=node('button','إزالة الصورة '+(i+1));image.src=src;image.alt='صورة العقار '+(i+1);remove.type='button';remove.disabled=processing;remove.onclick=()=>{if(!processing){photos.splice(i,1);renderPhotos();}};item.append(image,remove);previews.append(item);});}
 renderPhotos();
 photoInput.onchange=async()=>{
  if(processing)return;const files=[...photoInput.files];processing=true;photoInput.disabled=true;renderPhotos();photoStatus.textContent='جارٍ تجهيز الصور…';
  try{
   live();if(files.length+photos.length>4)throw Error('يمكن إضافة أربع صور كحد أقصى.');
   const prepared=[];
   for(const file of files){
    const img=await decodeImage(file);live();const scale=Math.min(1,960/Math.max(img.naturalWidth,img.naturalHeight)),canvas=node('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('تعذر تجهيز الصورة.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let encoded='';for(const quality of [.75,.6,.45]){encoded=canvas.toDataURL('image/jpeg',quality);if(encoded.length<=240000)break;}canvas.width=canvas.height=1;
    if(encoded.length>240000)throw Error('الصورة كبيرة بعد الضغط. اختر صورة أصغر.');prepared.push(encoded);
   }
   live();if(!form.isConnected)return;photos.push(...prepared);photoStatus.textContent='الصور جاهزة؛ تُحفظ مع العقار عند الضغط على حفظ.';
  }catch(e){if(form.isConnected)photoStatus.textContent=e.message;}finally{processing=false;if(form.isConnected){photoInput.disabled=false;photoInput.value='';renderPhotos();}}
 };
 const optional=node('details'),summary=node('summary','بيانات الإدارة (اختياري)'),owner=input(existing?.[1]??''),units=input(existing?.[2]??'',true),income=input(existing?.[3]??'',true);optional.className='aq267-property-admin';optional.append(summary,field('المالك',owner),field('عدد الوحدات',units),field('إيجار المصدر — قيمة مرجعية',income));form.append(optional);container.replaceChildren(form);
 activeForm={read(){
  live();if(processing)throw Error('انتظر اكتمال تجهيز الصور.');if(!name.reportValidity())throw Error('أدخل اسم العقار.');
  const unitValue=latinDigits(units.value);if(unitValue&&!/^\d{1,6}$/.test(unitValue)){optional.open=true;units.focus();throw Error('أدخل عدد وحدات صحيحاً دون كسور.');}
  const row=existing?[...existing]:['','','',''];row[0]=name.value.trim();row[1]=owner.value.trim();row[2]=unitValue;row[3]=income.value.trim();
  return withPresentation(row,{location:location.value,price:price.value,purpose:purpose.value,phone:phone.value,photos});
 },focus(){name.focus();},dispose(){disposed=true;photos=[];form.replaceChildren();window.removeEventListener('aqari:auth-boundary',boundary);}};return activeForm;
}
