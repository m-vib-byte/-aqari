// Additive presentation metadata. Legal titles, clauses and field definitions
// are never normalized or rewritten by this module.
const roles=Object.freeze(['owner','tenant','receiver','accountant']);
const languages=Object.freeze(['ar','en','bilingual']);
const identifier=/^[a-z][a-z0-9_]{1,49}$/;
const forbidden=new Set(['field_name','constructor','prototype','__proto__']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const fail=message=>{throw Error(message);};
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const fieldRows=fields=>Array.isArray(fields)?fields:[];
function keys(value,allowed,required=allowed){
 if(!isObject(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!own(value,key)))fail('بيانات تنسيق الصفحة غير صالحة؛ أعد ضبط التنسيق من المحرر.');
}
const bool=value=>{if(typeof value!=='boolean')fail('اختر تفعيل العنصر أو إيقافه من إعدادات الصفحة.');return value;};
const finite=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('راجع '+label+' ضمن حدود صفحة A4.');return Object.is(value,-0)?0:value;};
const language=value=>{if(!languages.includes(value))fail('اختر العربية أو الإنجليزية أو اللغتين للصفحة.');return value;};
const signerSettings=enabled=>({name:enabled,signature:enabled,fingerprint:enabled});

export function defaultTemplateTypography(){
 return {font_pt:12,line_height:1.85,alignment:'start',margin_mm:18};
}

export function defaultTemplatePresentation(kind='rental_agreement'){
 return {version:1,paper:'A4',language:'bilingual',logo:{enabled:false,source:'property'},signers:{owner:signerSettings(true),tenant:signerSettings(true),...(kind==='rent_receipt'?{receiver:signerSettings(true),accountant:signerSettings(true)}:{})},placements:[]};
}

/** Return a deterministic, JSON-only shape; absent presentation stays absent.
 * Millimetres are absolute from the A4 page's top-left corner, page starts at 1.
 * Logo content is resolved from the selected property's protected assets;
 * presentation never accepts an image URL, path, HTML or embedded image data.
 */
export function validateTemplatePresentation(presentation,fields=[]){
 if(presentation===undefined||presentation===null)return null;
 keys(presentation,['version','paper','language','logo','signers','placements','typography'],['version','paper','language','logo','signers','placements']);
 if(presentation.version!==1||presentation.paper!=='A4')fail('اختر تنسيق صفحة A4 المدعوم.');
 keys(presentation.logo,['enabled','source']);if(presentation.logo.source!=='property')fail('اختر شعار العقار المحفوظ من ملف العقار.');
 const logo={enabled:bool(presentation.logo.enabled),source:'property'};
 keys(presentation.signers,roles,['owner','tenant']);
 const signers={};
 for(const role of roles)if(own(presentation.signers,role)){
  const value=presentation.signers[role];keys(value,['name','signature','fingerprint']);
  signers[role]={name:bool(value.name),signature:bool(value.signature),fingerprint:bool(value.fingerprint)};
 }
 if(!Array.isArray(presentation.placements)||presentation.placements.length>120)fail('يمكن وضع ١٢٠ حقلًا كحد أقصى على صفحات النموذج.');
 const declared=new Set(fieldRows(fields).map(field=>field?.key)),ids=new Set();
 const placements=presentation.placements.map(item=>{
  keys(item,['id','field_key','page','x_mm','y_mm','width_mm','height_mm','font_pt','language']);
  if(typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(item.id)||ids.has(item.id))fail('تكرر معرّف موضع الحقل؛ احذف الموضع المكرر وأعد إضافته.');
  ids.add(item.id);
  const key=item.field_key,signer=/^(owner|tenant|receiver|accountant)_(name|signature|fingerprint)$/.exec(key||'');
  if(typeof key!=='string'||!identifier.test(key)||forbidden.has(key)||!declared.has(key)&&!signer)fail('اختر حقلًا معرّفًا في النموذج قبل وضعه على الصفحة.');
  if(signer&&!declared.has(key)&&presentation.signers[signer[1]]?.[signer[2]]!==true)fail('فعّل خانة الطرف المطلوبة قبل وضعها على الصفحة.');
  if(!Number.isInteger(item.page)||item.page<1||item.page>50)fail('اختر رقم صفحة بين ١ و٥٠.');
  const x=finite(item.x_mm,8,194,'موضع الحقل الأفقي'),y=finite(item.y_mm,8,285,'موضع الحقل الرأسي'),width=finite(item.width_mm,8,194,'عرض الحقل'),height=finite(item.height_mm,4,281,'ارتفاع الحقل');
  if(x+width>202+1e-8||y+height>289+1e-8)fail('الحقل يتجاوز مساحة صفحة A4؛ حرّكه أو صغّره داخل الهوامش.');
  return {id:item.id,field_key:key,page:item.page,x_mm:x,y_mm:y,width_mm:width,height_mm:height,font_pt:finite(item.font_pt,8,36,'حجم خط الحقل'),language:language(item.language)};
 });
 const result={version:1,paper:'A4',language:language(presentation.language),logo,signers,placements};
 // Typography is saved only after an explicit formatting choice. Old templates
 // retain exactly their original presentation shape and digest material.
 if(own(presentation,'typography')){
  const value=presentation.typography;keys(value,['font_pt','line_height','alignment','margin_mm']);
  if(!['start','center','end','justify'].includes(value.alignment))fail('اختر محاذاة النص من أدوات تنسيق الصفحة.');
  result.typography={font_pt:finite(value.font_pt,10,18,'حجم خط العقد'),line_height:finite(value.line_height,1.2,2.2,'تباعد السطور'),alignment:value.alignment,margin_mm:finite(value.margin_mm,12,25,'هوامش الصفحة')};
 }
 return result;
}

export function presentationDigestValue(template){
 return validateTemplatePresentation(template?.presentation,template?.fields||[]);
}

function fieldDefinition(key,fields){
 const found=fieldRows(fields).filter(field=>field?.key===key);
 if(found.length!==1||!identifier.test(key)||forbidden.has(key))fail('اختر حقلًا واضحًا من قائمة حقول النموذج.');
 return found[0];
}
function chip(raw,key,fields){
 const found=fieldRows(fields).filter(field=>field?.key===key),known=identifier.test(key||'')&&!forbidden.has(key)&&found.length===1;
 const label=key==='field_name'?'حقل يحتاج تحديد':!key?'حقل غير مكتمل':known?String(found[0].label||'حقل محفوظ'):'حقل غير معرّف';
 return {type:'field',key:key||null,originalKey:key||null,label,raw,known};
}
// Include broken legacy variants in human chips while preserving their original
// bytes. They remain invalid for final preview until the user replaces them.
const tokenPattern=/\{\{[^{}\r\n]*\}\}|\{\([^{}\r\n]*\}\}|\{\{[a-zA-Z0-9_ \t-]*(?:\}|(?=[^a-zA-Z0-9_ \t-]|$))|\{[a-zA-Z0-9_]+\}\}/g;
export function tokenizeTemplateText(text,fields=[]){
 if(typeof text!=='string')fail('نص البند غير صالح.');
 const tokens=[];let cursor=0;
 for(const match of text.matchAll(tokenPattern)){
  if(match.index>cursor)tokens.push({type:'text',text:text.slice(cursor,match.index)});
  const raw=match[0],key=/^\{\{([a-z][a-z0-9_]{1,49})\}\}$/.exec(raw)?.[1]||null;
  tokens.push(chip(raw,key,fields));cursor=match.index+raw.length;
 }
 if(cursor<text.length||!tokens.length)tokens.push({type:'text',text:text.slice(cursor)});
 return tokens;
}

export function createTemplateFieldToken(key,fields=[]){
 fieldDefinition(key,fields);return chip('{{'+key+'}}',key,fields);
}
export function replaceTemplateFieldToken(token,key,fields=[]){
 if(token?.type!=='field')fail('اختر موضع الحقل المطلوب تغييره.');
 return createTemplateFieldToken(key,fields);
}
export function serializeTemplateTokens(tokens,fields=[]){
 if(!Array.isArray(tokens))fail('نص المحرر غير صالح.');
 return tokens.map(token=>{
  if(token?.type==='text'&&typeof token.text==='string')return token.text;
  if(token?.type!=='field')fail('يوجد عنصر غير صالح في المحرر.');
  if(typeof token.raw==='string'&&own(token,'originalKey')&&token.key===token.originalKey)return token.raw;
  fieldDefinition(token.key,fields);return '{{'+token.key+'}}';
 }).join('');
}
export function humanTemplateText(text,fields=[]){
 return tokenizeTemplateText(text,fields).map(token=>token.type==='text'?token.text:'⟦'+token.label+'⟧').join('');
}
/** Convert explicit human markers only. Ordinary legal words, whitespace and
 * paragraph breaks are untouched, and duplicate labels must be disambiguated.
 */
export function templateTextFromHuman(text,fields=[]){
 if(typeof text!=='string')fail('نص البند غير صالح.');
 return text.replace(/⟦([^⟦⟧]+)⟧/g,(_,label)=>{
  const matches=fieldRows(fields).filter(field=>field?.label===label);
  if(matches.length!==1)fail('اسم الحقل غير محدد أو مكرر؛ اختر الحقل من القائمة.');
  fieldDefinition(matches[0].key,fields);return '{{'+matches[0].key+'}}';
 });
}
