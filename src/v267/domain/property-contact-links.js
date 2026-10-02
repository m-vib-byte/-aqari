// Public contact links only: never allow script, data, credential-bearing or relative URLs.
export const propertyChannelKinds = {
 website:'الموقع الإلكتروني', instagram:'Instagram', tiktok:'TikTok', snapchat:'Snapchat',
 x:'X', facebook:'Facebook', youtube:'YouTube', whatsapp:'WhatsApp', email:'البريد الإلكتروني', phone:'الهاتف', other:'رابط آخر'
};
export function propertyContactUrl(value,kind='website') {
 const raw=String(value??'').trim();
 if(!raw)return '';
 if(/[\u0000-\u0020\u007f]/.test(raw))throw Error('أدخل رابطًا صحيحًا دون مسافات.');
 if(kind==='email'){
  const email=raw.replace(/^mailto:/i,'');
  if(!/^[^?&#:@\s]+@[^?&#:@\s]+\.[^?&#:@\s]+$/.test(email))throw Error('أدخل بريدًا إلكترونيًا صحيحًا.');
  return 'mailto:'+email;
 }
 if(kind==='phone'){
  const phone=raw.replace(/^tel:/i,'');
  if(!/^\+?[0-9]{8,15}$/.test(phone))throw Error('أدخل رقم هاتف صحيحًا مع رمز الدولة.');
  return 'tel:'+phone;
 }
 if(kind==='whatsapp'&&/^\+?[0-9]{8,15}$/.test(raw))return 'https://wa.me/'+raw.replace(/^\+/,'');
 let parsed;try{parsed=new URL(raw);}catch{throw Error('أدخل الرابط كاملًا ويبدأ بـ https://.');}
 if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw Error('الرابط يجب أن يبدأ بـ https:// وألا يحتوي بيانات دخول.');
 return parsed.href;
}
export function confirmPropertyChannel(response,{workspace,user,propertyId}) {
 if(response?.workspace_id!==workspace||response?.user_id!==user||response?.propertyId!==propertyId||!Array.isArray(response.items))throw Error('تعذر تأكيد نطاق قنوات العقار.');
 return response;
}
