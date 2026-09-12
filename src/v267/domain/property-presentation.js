// Presentation metadata travels with the existing property row and its verified cloud write.
const scalar=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
export const latinDigits=value=>scalar(value).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
export const searchKey=value=>latinDigits(value).normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640\u0300-\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase().replace(/\s+/g,' ').trim();
export function contactPhone(value){
 let phone=latinDigits(value).replace(/[ ()-]/g,'');
 if(/^\d{8}$/.test(phone))phone='+965'+phone;
 if(phone.startsWith('00'))phone='+'+phone.slice(2);
 return /^\+[1-9]\d{7,14}$/.test(phone)?phone:'';
}
export const safePhoto=value=>typeof value==='string'&&value.length<=240000&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';
export function presentation(row,includePhotos=true){
 const raw=Array.isArray(row)?row.find(v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.aqariPropertyPresentation===1):null;
 const price=scalar(raw?.price);
 return {location:scalar(raw?.location),price:/^\d{1,10}(\.\d{1,3})?$/.test(price)&&Number(price)>0?price:'',purpose:['sale','rent'].includes(raw?.purpose)?raw.purpose:'',phone:contactPhone(raw?.phone),photos:includePhotos&&Array.isArray(raw?.photos)?raw.photos.slice(0,4).map(safePhoto).filter(Boolean):[]};
}
export function validatePresentation(input){
 const location=scalar(input.location),price=latinDigits(input.price).replace('٫','.'),rawPhone=scalar(input.phone),phone=contactPhone(rawPhone);
 if(location.length>250)throw Error('اختصر الموقع إلى ٢٥٠ حرفاً.');
 if(price&&(!/^\d{1,10}(\.\d{1,3})?$/.test(price)||Number(price)<=0))throw Error('أدخل سعراً موجباً بالدينار، حتى ثلاث منازل عشرية.');
 if(rawPhone&&!phone)throw Error('أدخل هاتفاً كويتياً من ٨ أرقام أو رقماً دولياً يبدأ بـ +.');
 if(!['sale','rent'].includes(input.purpose))throw Error('اختر للبيع أو للإيجار.');
 if(!Array.isArray(input.photos)||input.photos.length>4||input.photos.some(p=>!safePhoto(p)))throw Error('أضف حتى أربع صور صالحة للعقار.');
 return {aqariPropertyPresentation:1,location,price,purpose:input.purpose,phone,photos:[...input.photos]};
}
export function withPresentation(row,input){
 const metadata=validatePresentation(input);
 const result=row.filter(v=>!(v&&typeof v==='object'&&!Array.isArray(v)&&v.aqariPropertyPresentation===1));
 result.push(metadata);return result;
}
export function searchProperties(rows,query){
 const terms=searchKey(query).split(' ').filter(Boolean);
 return rows.map((row,index)=>({row,index,key:searchKey([row[0],row[1],presentation(row,false).location].join(' ')),name:searchKey(row[0])}))
  .filter(x=>terms.every(term=>x.key.includes(term)))
  .sort((a,b)=>Number(b.name===searchKey(query))-Number(a.name===searchKey(query))||Number(b.name.startsWith(searchKey(query)))-Number(a.name.startsWith(searchKey(query)))||a.index-b.index).map(x=>x.row);
}
export const escapeHtml=value=>scalar(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function priceLabel(row){const p=presentation(row,false);return p.price?Number(p.price).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'+(p.purpose==='rent'?' / شهر':''):'السعر غير مضاف';}
export function summaryMarkup(row){
 const p=presentation(row),e=escapeHtml;
 return '<section class="aq267-property-summary" aria-label="صور العقار والسعر والموقع"><div class="aq267-property-gallery">'+(p.photos.length?p.photos.map((src,i)=>'<img src="'+src+'" alt="'+e(row[0])+' — صورة '+(i+1)+'" loading="lazy" width="960" height="640">').join(''):'<div class="aq267-photo-empty">لم تُضف صور لهذا العقار</div>')+'</div><div class="aq267-property-key-facts"><span>'+(p.purpose==='sale'?'للبيع':p.purpose==='rent'?'للإيجار':'تفاصيل العقار')+'</span><strong class="aq267-property-price">'+e(priceLabel(row))+'</strong><p>'+e(p.location||'الموقع غير مضاف')+'</p><div class="aq267-property-contact">'+(p.phone?'<a href="tel:'+p.phone+'">اتصال</a><a class="aq267-whatsapp" href="https://wa.me/'+p.phone.slice(1)+'?text='+encodeURIComponent('السلام عليكم، أستفسر عن العقار: '+scalar(row[0]))+'" target="_blank" rel="noopener noreferrer">واتساب</a>':'<span>رقم التواصل غير مضاف</span>')+(p.location?'<a href="https://www.google.com/maps/search/?api=1&amp;query='+e(encodeURIComponent(p.location))+'" target="_blank" rel="noopener noreferrer">الموقع على الخريطة</a>':'')+'</div></div></section>';
}
