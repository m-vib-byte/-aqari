import {createOriginalDocumentUpload,originalDocument} from './original-document-upload.js';
import {checksum,decodeImage} from './scan-image.js';

export const MAX_TEMPLATE_LOGO_BYTES=25*1024*1024;
const IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const INVALID_IMAGE='تعذر قراءة صورة الشعار. اختر صورة PNG أو JPEG أو WebP سليمة.';
const IMAGE_LIMIT='يجب ألا يتجاوز عرض أو ارتفاع الشعار ٤٠٩٦ بكسل، وألا تزيد مساحته على ٨ ملايين بكسل.';
const STATIC_IMAGE='اختر صورة شعار ثابتة من إطار واحد؛ الصور المتحركة غير مدعومة.';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=200&&value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value);
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(value){return Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}

function imageSize(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error(INVALID_IMAGE);if(width>4096||height>4096||width*height>8000000)throw Error(IMAGE_LIMIT);}
// Inspect the container before decoding, bounding browser memory and rejecting
// APNG/animated WebP even when an image decoder would expose only frame one.
function imageHeader(bytes,mime){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(offset,size)=>String.fromCharCode(...bytes.subarray(offset,offset+size));
 let width,height;
 if(mime==='image/png'){
  if(bytes.length<33||ascii(12,4)!=='IHDR')throw Error(INVALID_IMAGE);
  width=view.getUint32(16);height=view.getUint32(20);imageSize(width,height);
  let ended=false;
  for(let offset=8;offset+12<=bytes.length;){const length=view.getUint32(offset),type=ascii(offset+4,4);if(offset+12+length>bytes.length)throw Error(INVALID_IMAGE);if(type==='acTL')throw Error(STATIC_IMAGE);offset+=12+length;if(type==='IEND'){ended=true;break;}}
  if(!ended)throw Error(INVALID_IMAGE);
 }else if(mime==='image/jpeg'){
  let offset=2;
  while(offset<bytes.length){
   if(bytes[offset++]!==255)throw Error(INVALID_IMAGE);while(bytes[offset]===255)offset++;const marker=bytes[offset++];
   if(marker===0xd9||marker===0xda)break;
   if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
   if(offset+2>bytes.length)throw Error(INVALID_IMAGE);const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)throw Error(INVALID_IMAGE);
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)throw Error(INVALID_IMAGE);height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}
   offset+=length;
  }
 }else if(mime==='image/webp'){
  if(bytes.length<20||view.getUint32(4,true)+8!==bytes.length)throw Error(INVALID_IMAGE);
  for(let offset=12;offset+8<=bytes.length;){
   const type=ascii(offset,4),length=view.getUint32(offset+4,true),start=offset+8;if(start+length>bytes.length)throw Error(INVALID_IMAGE);
   if(type==='ANIM'||type==='ANMF'||type==='VP8X'&&length>=1&&(bytes[start]&2))throw Error(STATIC_IMAGE);
   if(type==='VP8X'){if(length<10)throw Error(INVALID_IMAGE);width=1+(bytes[start+4]|bytes[start+5]<<8|bytes[start+6]<<16);height=1+(bytes[start+7]|bytes[start+8]<<8|bytes[start+9]<<16);}
   else if(type==='VP8 '){if(length<10||ascii(start+3,3)!=='\x9d\x01\x2a')throw Error(INVALID_IMAGE);width??=view.getUint16(start+6,true)&0x3fff;height??=view.getUint16(start+8,true)&0x3fff;}
   else if(type==='VP8L'){if(length<5||bytes[start]!==0x2f)throw Error(INVALID_IMAGE);const packed=view.getUint32(start+1,true);width??=1+(packed&0x3fff);height??=1+(packed>>>14&0x3fff);}
   if(width!==undefined)imageSize(width,height);offset=start+length+(length%2);
  }
 }
 imageSize(width,height);return {width,height};
}

// Keep every supported master field and every asset entry. In particular, older
// snapshots must not clear extended fields that they did not return.
function masterPayload(property,assets){
 const data={name:property.name,address:property.address??'',type:property.type??'',status:property.status??'active',statedIncome:property.statedIncome??null,owners:property.owners??[],email:property.email??'',phone:property.phone??'',whatsapp:property.whatsapp??'',assets};
 for(const key of ['description','locationUrl','propertyAutomaticRef','tenantVisibility','tenantInfo'])if(Object.hasOwn(property,key))data[key]=property[key];
 return structuredClone(data);
}

/** Property logos remain protected property assets, independent of template layout. */
export function createTemplateLogoContext(session){
 const scope={...session.bound},uploaders=new Map(),busy=new Set();
 function check(){
  session.check();
  if(!identifier(scope.workspace)||!identifier(scope.user)||session.bound.workspace!==scope.workspace||session.bound.user!==scope.user||session.bound.role!==scope.role)throw Error('تغيرت جلسة الدخول أو مساحة العمل. افتح الصفحة من جديد.');
 }
 async function checked(task){check();try{const result=await task();check();return result;}catch(error){check();throw error;}}
 async function verifyImage(blob){
  const bytes=new Uint8Array(await checked(()=>blob.arrayBuffer()));imageHeader(bytes,blob.type);
  await checked(async()=>{
   if(typeof globalThis.createImageBitmap==='function'){
    let bitmap;try{bitmap=await globalThis.createImageBitmap(blob);}catch{throw Error(INVALID_IMAGE);}
    try{imageSize(bitmap.width,bitmap.height);}finally{bitmap.close?.();}
   }else if(typeof globalThis.Image==='function'){
    let decoded;try{decoded=await decodeImage(blob);}catch{throw Error(INVALID_IMAGE);}imageSize(decoded.naturalWidth,decoded.naturalHeight);
   }else throw Error('تعذر التحقق من صورة الشعار في هذا المتصفح. افتح المنصة بمتصفح يدعم عرض الصور.');
  });
 }
 function storagePath(path,bucket='aqari-documents'){
  if(bucket!=='aqari-documents'||typeof path!=='string'||!path.startsWith(scope.workspace+'/')||path.length>1024||/[\\%?#\u0000-\u0020\u007f]/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('مسار شعار العقار غير صالح.');
 }
 const guarded={bound:scope,check,get client(){check();return session.client;},request:query=>checked(()=>session.request(query)),storage:(method,path,body,bucket='aqari-documents')=>checked(()=>{storagePath(path,bucket);return session.storage(method,path,body,bucket);})};
 const rpc=(name,args)=>checked(()=>session.request(session.client.rpc(name,args)));
 function propertyId(id){check();if(!identifier(id))throw Error('اختر العقار من قائمة العقارات المحفوظة.');return id;}
 function envelope(result){check();if(!object(result)||result.workspace_id!==scope.workspace||result.user_id!==scope.user)throw Error('تعذر تأكيد نطاق ملف العقار.');}
 function propertyRecord(record,id){
  if(!object(record)||record.id!==id||!identifier(record.externalRef)||typeof record.name!=='string'||!record.name.trim()||!Number.isSafeInteger(record.revision)||record.revision<0||!object(record.assets))throw Error('لم تتأكد بيانات العقار المحفوظة. حدّث ملف العقار.');
  return structuredClone(record);
 }
 async function getAccess(){
  const access=await rpc('aqari_workspace_access',{p_workspace_id:scope.workspace});
  envelope(access);if(access.role!==scope.role)throw Error('تغيرت صلاحية الحساب. حدّث الصفحة.');
  return {canRead:access.permissions?.properties?.read===true,canUpload:access.permissions?.properties?.write===true&&access.permissions?.documents?.write===true};
 }
 async function listProperties(){
  const rows=[],seen=new Set();
  for(let start=0;;start+=200){
   const page=await checked(()=>session.request(session.client.from('aqari_properties').select('id,workspace_id,external_ref,name').eq('workspace_id',scope.workspace).order('id',{ascending:true}).range(start,start+199)));
   if(!Array.isArray(page))throw Error('تعذرت قراءة قائمة العقارات.');
   for(const row of page){
    if(!object(row)||row.workspace_id!==scope.workspace||!identifier(row.id)||!identifier(row.external_ref)||typeof row.name!=='string'||seen.has(row.id))throw Error('تعذر تأكيد نطاق قائمة العقارات. حدّث الصفحة.');
    seen.add(row.id);rows.push({id:row.id,name:row.name,externalRef:row.external_ref});
   }
   if(page.length<200)break;
  }
  check();return rows;
 }
 async function readProperty(id){
  propertyId(id);
  const result=await rpc('aqari_property_full_file',{p_workspace_id:scope.workspace,p_property_id:id});
  envelope(result);return propertyRecord(result.property,id);
 }
 function documentMetadata(row,property){
  const path=row?.storage_path;
  if(!object(row)||row.id!==property.assets.logo||row.workspace_id!==scope.workspace||row.status!=='uploaded'||row.entity_type!=='property'||![property.id,property.externalRef].includes(row.entity_ref)||row.document_type!=='supporting_document'||row.metadata?.category!=='property_logo'||(row.metadata?.asset_role!=null&&row.metadata.asset_role!=='property_logo'))throw Error('الشعار المحفوظ لا يطابق العقار المحدد.');
  storagePath(path,row.storage_bucket);
  if(!IMAGE_TYPES.has(row.mime_type)||!Number.isSafeInteger(row.size_bytes)||row.size_bytes<1||row.size_bytes>MAX_TEMPLATE_LOGO_BYTES||typeof row.checksum_sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.checksum_sha256))throw Error('بيانات ملف الشعار غير مكتملة. أعد رفع صورة PNG أو JPEG أو WebP لا تتجاوز ٢٥ ميجابايت.');
 }
 async function logoFor(property){
  check();
  const id=property.assets.logo;
  if(id===null||id===undefined||id==='')return null;
  if(!identifier(id))throw Error('رابط شعار العقار المحفوظ غير صالح.');
  const row=await checked(()=>session.request(session.client.from('aqari_documents').select('id,workspace_id,status,entity_type,entity_ref,document_type,metadata,storage_bucket,storage_path,mime_type,size_bytes,checksum_sha256').eq('workspace_id',scope.workspace).eq('id',id).single()));
  documentMetadata(row,property);
  const stored=await guarded.storage('GET',row.storage_path,undefined,row.storage_bucket);
  if(!(stored instanceof Blob)||stored.size!==row.size_bytes)throw Error('لم تتطابق نسخة شعار العقار المحفوظة. أعد رفع الشعار.');
  const blob=await checked(()=>originalDocument(stored));
  if(blob.type!==row.mime_type||!IMAGE_TYPES.has(blob.type))throw Error('محتوى شعار العقار لا يطابق صيغة الصورة المحفوظة.');
  const hash=await checked(()=>checksum(blob));
  if(hash!==row.checksum_sha256)throw Error('لم تتطابق بصمة شعار العقار المحفوظ. أعد رفع الشعار.');
  await verifyImage(blob);
  check();return {blob,documentId:id,propertyId:property.id,mimeType:blob.type,checksum:hash,sizeBytes:blob.size};
 }
 async function loadLogo(id){const property=await readProperty(id);check();const logo=await logoFor(property);check();return logo;}
 async function uploadLogo(id,file){
  propertyId(id);if(busy.has(id))throw Error('رفع شعار هذا العقار جارٍ. انتظر اكتماله.');
  busy.add(id);
  try{
   const access=await getAccess();if(!access.canUpload)throw Error('رفع شعار العقار يتطلب صلاحية تعديل العقارات ورفع المستندات.');
   const property=await readProperty(id);
   const blob=await checked(()=>originalDocument(file));
   if(!IMAGE_TYPES.has(blob.type))throw Error('اختر صورة PNG أو JPEG أو WebP لا تتجاوز ٢٥ ميجابايت لشعار العقار.');
   await verifyImage(blob);
   if(!uploaders.has(id))uploaders.set(id,createOriginalDocumentUpload(guarded));
   const row=await checked(()=>uploaders.get(id)(file,{type:'property',ref:property.externalRef,category:'property_logo',title:'شعار العقار'}));
   // Verify the finalized protected asset before linking it to the property.
   await logoFor({...property,assets:{...property.assets,logo:row.id}});
   const assets={...structuredClone(property.assets),logo:row.id},payload=masterPayload(property,assets);
   // The document upload helper retains its reservation on a retry. If a prior
   // save succeeded but its reply was lost, do not create another revision.
   if(property.assets.logo!==row.id){
    const saved=await rpc('aqari_property_master_save',{p_workspace_id:scope.workspace,p_property_id:id,p_expected_revision:property.revision,p_data:payload,p_reason:'رفع شعار العقار من محرر النماذج'});
    envelope(saved);const after=propertyRecord(saved.property,id);
    if(after.externalRef!==property.externalRef||after.revision!==property.revision+1||!same(masterPayload(after,after.assets),payload))throw Error('لم يتأكد حفظ شعار العقار مع الحفاظ على بياناته. حدّث ملف العقار.');
   }
   const verified=await readProperty(id);
   if(verified.assets.logo!==row.id||verified.externalRef!==property.externalRef||!same(masterPayload(verified,verified.assets),payload))throw Error('لم يظهر شعار العقار المحفوظ بعد إعادة القراءة. حدّث الملف قبل إعادة المحاولة.');
   const logo=await logoFor(verified);check();return {property:verified,logo};
  }finally{busy.delete(id);}
 }
 return {listProperties,readProperty,loadLogo,uploadLogo,getAccess};
}
