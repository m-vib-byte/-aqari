import {ownershipShareBasisPoints} from '../domain/ownership-shares.js';
import {propertyMasterReadbackMatches} from '../domain/property-master-readback.js';
import {uiError} from '../components/ui-error.js';
import '../../../v267-rental-records.js';
import {t as translateStatic,message as translateMessage} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {withPresentation,contactPhone} from '../domain/property-presentation.js';
import {decodeImage} from '../components/scan-image.js';
import {createOriginalDocumentUpload} from '../components/original-document-upload.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sameRecord=(actual,expected)=>JSON.stringify(canonical(actual))===JSON.stringify(canonical(expected));
const input=(type='text',value='')=>{const el=node('input');el.type=type;el.value=value??'';return el;};
const clean=value=>String(value??'').normalize('NFKC').trim();
function button(label,fn){const el=node('button',label);el.type='button';el.onclick=fn;return el;}
function check(label,value=false){const c=input('checkbox');c.checked=value;return {c,el:field(label,c)};}
function normalizePhone(value,label,required=false){const raw=clean(value);if(!raw&&!required)return '';const normalized=contactPhone(raw);if(!normalized)throw uiError(translateMessage("راجع {v0}؛ استخدم ٨ أرقام كويتية أو رقماً دولياً يبدأ بـ +.",{v0:(label)}));return normalized;}
function normalizeEmail(value,label,required=false){const email=clean(value).toLowerCase();if(!email&&!required)return '';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw uiError(translateMessage("راجع {v0}.",{v0:(label)}));return email;}
function ownerRows(target){
 const rows=[];
 const draw=(initial={})=>{const wrap=node('fieldset'),name=input('text',initial.name),share=input('text',initial.share??''),role=input('text',initial.role||'مالك'),email=input('email',initial.email),phone=input('tel',initial.phone),whatsapp=input('tel',initial.whatsapp),remove=button(translateStatic('إزالة المالك'),()=>{const at=rows.findIndex(x=>x.wrap===wrap);if(at>=0)rows.splice(at,1);wrap.remove();});share.inputMode='decimal';wrap.append(field(translateStatic('اسم المالك / الشريك'),name),field(translateStatic('النسبة %'),share),field(translateStatic('الصفة'),role),field(translateStatic('البريد'),email),field(translateStatic('الهاتف'),phone),field(translateStatic('واتساب'),whatsapp),remove);target.append(wrap);rows.push({wrap,name,share,role,email,phone,whatsapp});};
 draw();target.append(button(translateStatic('+ إضافة مالك / شريك'),()=>draw()));
 return ()=>rows.map(row=>({name:clean(row.name.value),share:clean(row.share.value),role:clean(row.role.value)||'مالك',email:normalizeEmail(row.email.value,translateStatic('بريد المالك')),phone:normalizePhone(row.phone.value,translateStatic('هاتف المالك')),whatsapp:normalizePhone(row.whatsapp.value,translateStatic('واتساب المالك'))})).filter(row=>row.name||row.share||row.email||row.phone||row.whatsapp||row.role!=='مالك').map(row=>{if(!row.name)throw Error('أكمل اسم المالك / الشريك أو أزل الصف غير المكتمل.');return {...row,bps:ownershipShareBasisPoints(row.share)};});
}
async function compressedPreview(file){
 const img=await decodeImage(file),scale=Math.min(1,960/Math.max(img.naturalWidth,img.naturalHeight)),canvas=node('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('تعذر تجهيز صورة العرض.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);let encoded='';for(const quality of [.72,.58,.44]){encoded=canvas.toDataURL('image/jpeg',quality);if(encoded.length<=240000)break;}canvas.width=canvas.height=1;if(encoded.length>240000)throw Error('إحدى صور العقار كبيرة جداً لإنشاء معاينة خفيفة.');return encoded;
}

export function openPropertyOnboarding(){
 const api=window.AQARI_RENTAL_RECORDS;if(!api)throw Error('تعذر تحميل محرك بيانات العقار.');
 const bridge=window.AQARI_SUPABASE;if(!bridge?.loadAppState||!bridge?.saveAppState)throw Error('تعذر تحميل جسر السحابة.');
 const d=createDialog(translateStatic('إضافة عقار — ملف متكامل'));if(!d)return false;
 const bound=()=>({userId:d.session.bound.user,workspaceId:d.session.bound.workspace});
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 let created=null,manifest=null,uploaded=new Map(),lockedDraft=null,access=null,masterAttempt=null,creationAttempt=null,documentUpload=null;
 const form=node('form'),grid=node('div');grid.className='aq267-grid';
 const name=input('text'),address=node('textarea'),description=node('textarea'),locationUrl=input('url'),propertyAutomaticRef=input('text'),type=input('text'),status=input('text','active'),income=input('text'),email=input('email'),phone=input('tel'),whatsapp=input('tel');
 name.required=address.required=type.required=status.required=true;income.inputMode='decimal';address.maxLength=1000;description.maxLength=5000;locationUrl.maxLength=2000;propertyAutomaticRef.maxLength=200;for(const control of [name,type,status,email,phone,whatsapp])control.maxLength=320;
 for(const [label,control]of [[translateStatic('اسم العقار *'),name],[translateStatic('العنوان *'),address],[translateStatic('نوع العقار *'),type],[translateStatic('حالة العقار *'),status],[translateStatic('وصف مختصر'),description],[translateStatic('رابط الموقع — https://'),locationUrl],[translateStatic('الرقم الآلي للعقار'),propertyAutomaticRef],[translateStatic('الدخل المعلن — اختياري ولا يحل محل التحصيل الفعلي'),income],[translateStatic('البريد الرسمي للعقار'),email],[translateStatic('الهاتف'),phone],[translateStatic('واتساب'),whatsapp]])grid.append(field(label,control));
 const ownersBox=node('section');ownersBox.append(node('h3',translateStatic('الملاك والحصص — عند إدخال ملاك يجب أن يكون المجموع 100%')));const readOwners=ownerRows(ownersBox);
 const visibility=node('section');visibility.append(node('h3',translateStatic('ما يظهر للمستأجر')));
 const visible={name:check(translateStatic('اسم العقار'),true),logo:check(translateStatic('الشعار'),true),phone:check(translateStatic('الهاتف'),false),whatsapp:check(translateStatic('واتساب'),false),email:check(translateStatic('البريد'),false),location:check(translateStatic('الموقع'),false),instructions:check(translateStatic('تعليمات العقار'),false),officeHours:check(translateStatic('أوقات الإدارة'),false),emergency:check(translateStatic('الطوارئ'),false),services:check(translateStatic('الخدمات'),false)};for(const x of Object.values(visible))visibility.append(x.el);
 const instructions=node('textarea'),officeHours=input('text'),emergency=input('text'),tenantServices=node('textarea');instructions.maxLength=5000;officeHours.maxLength=1000;emergency.maxLength=1000;tenantServices.maxLength=5000;visibility.append(field(translateStatic('تعليمات العقار للمستأجر'),instructions),field(translateStatic('أوقات الإدارة'),officeHours),field(translateStatic('بيانات الطوارئ'),emergency),field(translateStatic('الخدمات الظاهرة للمستأجر'),tenantServices));
 const files=node('section');files.append(node('h3',translateStatic('الشعار والصور والوثائق والمخططات والرخص')));
 const logo=input('file'),mainPhoto=input('file'),photos=input('file'),deed=input('file'),plans=input('file'),licenses=input('file'),certificates=input('file'),insurances=input('file'),attachments=input('file');
 logo.accept=mainPhoto.accept=photos.accept='image/jpeg,image/png,image/webp';photos.multiple=plans.multiple=licenses.multiple=certificates.multiple=insurances.multiple=attachments.multiple=true;deed.accept=plans.accept=licenses.accept=certificates.accept=insurances.accept=attachments.accept='application/pdf,image/jpeg,image/png,image/webp';
 files.append(field(translateStatic('شعار العقار — صورة واحدة'),logo),field(translateStatic('الصورة الرئيسية — صورة واحدة'),mainPhoto),field(translateStatic('صور العقار — حتى 10 صور'),photos),field(translateStatic('وثيقة الملكية'),deed),field(translateStatic('المخططات والكروكيات'),plans),field(translateStatic('الرخص'),licenses),field(translateStatic('الشهادات'),certificates),field(translateStatic('التأمينات'),insurances),field(translateStatic('مستندات أخرى'),attachments),node('p',translateStatic('يُرفع الأصل إلى الأرشيف الخاص، ويُثبت checksum ثم يعاد قراءة سجل المستند قبل تأكيد الحفظ.')));
 const reason=node('textarea');reason.value='إنشاء ملف عقار متكامل';reason.required=true;reason.minLength=3;reason.maxLength=1000;
 const save=node('button',translateStatic('حفظ العقار والملف الكامل'));save.type='submit';form.append(grid,ownersBox,visibility,files,field(translateStatic('سبب إنشاء الملف'),reason),save);d.body.append(form);

 function freezeDraft(){
  const owners=readOwners();if(owners.some(o=>!o.name||!o.share||o.bps<1||o.bps>10000)||owners.length&&owners.reduce((sum,o)=>sum+o.bps,0)!==10000)throw Error('إذا أدخلت ملاكًا يجب أن تكتمل الأسماء وأن يساوي مجموع الحصص 100%.');
  const stated=clean(income.value);if(stated&&!/^\d{1,12}(\.\d{1,3})?$/.test(stated))throw Error('راجع الدخل المعلن؛ حتى ثلاث منازل عشرية.');
  const draft={name:clean(name.value),address:clean(address.value),description:clean(description.value),locationUrl:clean(locationUrl.value),propertyAutomaticRef:clean(propertyAutomaticRef.value),type:clean(type.value),status:clean(status.value),statedIncome:stated||null,owners,email:normalizeEmail(email.value,translateStatic('بريد العقار')),phone:normalizePhone(phone.value,translateStatic('هاتف العقار')),whatsapp:normalizePhone(whatsapp.value,translateStatic('واتساب العقار')),tenantVisibility:Object.fromEntries(Object.entries(visible).map(([k,x])=>[k,x.c.checked])),tenantInfo:{instructions:clean(instructions.value),officeHours:clean(officeHours.value),emergency:clean(emergency.value),services:clean(tenantServices.value)},reason:clean(reason.value)};
  if(!draft.name||!draft.address||!draft.type||!draft.status||draft.reason.length<3)throw Error('أكمل بيانات العقار الأساسية وسبب الإنشاء.');
  if(draft.locationUrl&&!/^https:\/\//i.test(draft.locationUrl))throw Error('رابط الموقع يجب أن يبدأ بـ https://');
  if(!draft.phone&&!draft.whatsapp&&!draft.email)throw Error('أدخل وسيلة تواصل واحدة على الأقل: هاتف أو واتساب أو بريد إلكتروني.');
  const groups=[photos,plans,licenses,certificates,insurances,attachments];if(photos.files.length>10||groups.slice(1).some(x=>x.files.length>20))throw Error('قسّم المرفقات إلى دفعات أصغر: 10 صور و20 ملفًا لكل مجموعة أخرى.');
  const entries=[];if(logo.files[0])entries.push({key:'logo',file:logo.files[0],category:'property_logo',title:'شعار العقار — '+draft.name,asset:'logo'});if(mainPhoto.files[0])entries.push({key:'mainPhoto',file:mainPhoto.files[0],category:'property_main_photo',title:'الصورة الرئيسية — '+draft.name,asset:'mainPhoto'});[...photos.files].forEach((file,index)=>entries.push({key:'photo:'+index,file,category:'property_photo',title:`صورة العقار ${index+1} — ${draft.name}`,asset:'photos'}));if(deed.files[0])entries.push({key:'deed',file:deed.files[0],category:'title_deed',title:'وثيقة الملكية — '+draft.name,asset:'titleDeed'});[...plans.files].forEach((file,index)=>entries.push({key:'plan:'+index,file,category:'site_plan',title:`مخطط / كروكي ${index+1} — ${draft.name}`,asset:'plans'}));[...licenses.files].forEach((file,index)=>entries.push({key:'license:'+index,file,category:'property_license',title:`رخصة ${index+1} — ${draft.name}`,asset:'licenses'}));[...certificates.files].forEach((file,index)=>entries.push({key:'certificate:'+index,file,category:'property_certificate',title:`شهادة ${index+1} — ${draft.name}`,asset:'certificates'}));[...insurances.files].forEach((file,index)=>entries.push({key:'insurance:'+index,file,category:'property_insurance',title:`تأمين ${index+1} — ${draft.name}`,asset:'insurances'}));[...attachments.files].forEach((file,index)=>entries.push({key:'document:'+index,file,category:'property_other',title:`مستند عقار ${index+1} — ${draft.name}`,asset:'documents'}));
  if(entries.length&&!access?.permissions?.documents?.write)throw Error('حسابك لا يملك صلاحية رفع مستندات. أزل الملفات أو اطلب صلاحية المستندات.');
  return {draft,entries};
 }
 async function saveLegacyProperty(previews){
  const current=bound(),findProperty=()=>d.session.request(d.session.client.from('aqari_properties').select('id,workspace_id,name,external_ref,metadata').eq('workspace_id',d.session.bound.workspace).eq('external_ref',lockedDraft.name).limit(2));
  if(!creationAttempt){
   const cloud=await bridge.loadAppState(current);d.session.check();const payload=clone(cloud.payload),state=api.primary(payload),rows=state.properties||[],revision=Number(cloud.revision);
   if(!Array.isArray(rows)||!Number.isSafeInteger(revision)||revision<0)throw Error('تعذر تثبيت مراجعة بيانات العقارات قبل الإنشاء.');
   if(rows.some(row=>String(row?.[0]||'').normalize('NFKC').trim().toLowerCase()===lockedDraft.name.toLowerCase()))throw Error('اسم العقار مسجل مسبقاً. افتح الملف الموجود بدلاً من إنشاء سجل ثانٍ.');
   const existing=await findProperty();d.session.check();if(!Array.isArray(existing))throw Error('تعذر التحقق من هوية العقار قبل الإنشاء.');if(existing.length)throw Error('العقار مسجل مسبقاً في السجلات الخادمة. افتح ملفه الموجود.');
   const primaryOwner=lockedDraft.owners[0]?.name||'',row=withPresentation([lockedDraft.name,primaryOwner,'',lockedDraft.statedIncome??''],{location:lockedDraft.address,price:'',purpose:'rent',phone:lockedDraft.phone||lockedDraft.whatsapp,photos:previews});
   row.find(value=>value?.aqariPropertyPresentation===1).onboardingRequestId=crypto.randomUUID();
   rows.push(row);state.properties=rows;state.audit=(state.audit||[]).concat([[d.session.bound.user,'إنشاء عقار من شاشة الملف المتكامل',lockedDraft.name,new Date().toISOString()]]);
   // Keep a correlation marker before sending: a lost response must never cause a second create.
   creationAttempt={row:clone(row),revision};for(const control of form.querySelectorAll('input,textarea,select,button'))if(control!==save)control.disabled=true;save.textContent=translateStatic('التحقق ومتابعة الملف');
   await bridge.saveAppState(payload,revision,current);d.session.check();
  }
  const confirmed=await bridge.loadAppState(current);d.session.check();const rows=api.primary(confirmed.payload).properties,matches=Array.isArray(rows)?rows.filter(row=>row?.[0]===lockedDraft.name):[];
  if(!Number.isSafeInteger(Number(confirmed.revision))||Number(confirmed.revision)<=creationAttempt.revision||matches.length!==1||!sameRecord(matches[0],creationAttempt.row))throw Error('لم يتأكد سجل محاولة الإنشاء الحالية. أعد المحاولة للتحقق فقط؛ لن ينشأ سجل ثانٍ.');
  const result=await findProperty();d.session.check();const property=Array.isArray(result)&&result.length===1?result[0]:null,record=Array.isArray(property?.metadata)?property.metadata:property?.metadata?.source_record;
  if(!property?.id||property.workspace_id!==d.session.bound.workspace||property.name!==lockedDraft.name||property.external_ref!==lockedDraft.name||!sameRecord(record,creationAttempt.row))throw Error('تعذر تأكيد هوية سجل محاولة الإنشاء الحالية. أعد المحاولة للتحقق فقط.');return property;
 }
 async function createPreviewImages(){const sources=[];if(manifest.entries.find(x=>x.key==='mainPhoto'))sources.push(manifest.entries.find(x=>x.key==='mainPhoto').file);else if(manifest.entries.find(x=>x.key==='logo'))sources.push(manifest.entries.find(x=>x.key==='logo').file);for(const entry of manifest.entries.filter(x=>x.asset==='photos')){if(sources.length>=4)break;sources.push(entry.file);}const result=[];for(const file of sources){result.push(await compressedPreview(file));d.session.check();}return result;}
 async function uploadDocuments(){const upload=documentUpload??=createOriginalDocumentUpload(d.session);for(const entry of manifest.entries){if(uploaded.has(entry.key))continue;d.status.textContent=translateStatic('جارٍ أرشفة ')+entry.title+'…';const row=await upload(entry.file,{type:'property',ref:created.external_ref,category:entry.category,title:entry.title});d.session.check();uploaded.set(entry.key,row);}}
 function assets(){const out={logo:null,mainPhoto:null,photos:[],titleDeed:null,plans:[],licenses:[],certificates:[],insurances:[],documents:[]};for(const entry of manifest.entries){const doc=uploaded.get(entry.key);if(!doc)continue;if(entry.asset==='logo'||entry.asset==='mainPhoto'||entry.asset==='titleDeed')out[entry.asset]=doc.id;else out[entry.asset].push(doc.id);}return out;}
 async function saveMaster(){
  if(!masterAttempt){
   const full=await rpc('aqari_property_full_file',{p_workspace_id:d.session.bound.workspace,p_property_id:created.id,p_as_of:new Date().toISOString().slice(0,10)}),revision=Number(full?.property?.revision);if(full?.property?.id!==created.id||!Number.isSafeInteger(revision)||revision<0)throw Error('تعذر إعادة قراءة ملف العقار قبل حفظ البيانات الرئيسية.');
   const data={name:lockedDraft.name,address:lockedDraft.address,description:lockedDraft.description,locationUrl:lockedDraft.locationUrl,propertyAutomaticRef:lockedDraft.propertyAutomaticRef,type:lockedDraft.type,status:lockedDraft.status,statedIncome:lockedDraft.statedIncome,owners:lockedDraft.owners,email:lockedDraft.email,phone:lockedDraft.phone,whatsapp:lockedDraft.whatsapp,tenantVisibility:lockedDraft.tenantVisibility,tenantInfo:lockedDraft.tenantInfo,assets:assets()};
   // A lost response may follow a committed write. Retries only confirm this attempt.
   masterAttempt={data,revision:revision+1};
   const saved=await rpc('aqari_property_master_save',{p_workspace_id:d.session.bound.workspace,p_property_id:created.id,p_expected_revision:revision,p_data:data,p_reason:lockedDraft.reason});if(saved?.property?.id!==created.id||Number(saved.property.revision)!==masterAttempt.revision)throw Error('لم تتأكد إعادة قراءة بيانات العقار الرئيسية. أعد المحاولة للتحقق دون تكرار الحفظ.');
  }
  const verify=await rpc('aqari_property_full_file',{p_workspace_id:d.session.bound.workspace,p_property_id:created.id,p_as_of:new Date().toISOString().slice(0,10)});
  if(verify?.property?.id!==created.id||Number(verify.property.revision)!==masterAttempt.revision||!propertyMasterReadbackMatches(verify.property,masterAttempt.data))throw Error('ملف العقار المعاد قراءته لا يطابق البيانات المحفوظة. أعد المحاولة للتحقق؛ لن يعاد إرسال الحفظ.');
  const ids=new Set((verify.documents||[]).map(x=>x.id));for(const row of uploaded.values())if(!ids.has(row.id))throw Error('مستند مرفوع لم يظهر في الملف الكامل بعد إعادة القراءة.');
  const complete=await rpc('aqari_property_completeness',{p_workspace_id:d.session.bound.workspace,p_property_id:created.id});if(complete?.property_id!==created.id)throw Error('تعذر حساب اكتمال ملف العقار.');return {verify,complete};
 }
 async function execute(){
  if(!access){access=await rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace});if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.permissions?.properties?.write!==true)throw Error('إضافة العقارات غير متاحة لصلاحية حسابك.');}
  if(!manifest){if(!form.reportValidity())throw Error('أكمل الحقول المطلوبة.');manifest=freezeDraft();lockedDraft=manifest.draft;}
  if(!created){try{const previews=creationAttempt?null:await createPreviewImages();d.status.textContent=translateStatic(creationAttempt?'جارٍ التحقق من محاولة الإنشاء السابقة…':'جارٍ إنشاء سجل العقار…');created=await saveLegacyProperty(previews);}catch(error){if(!creationAttempt){manifest=null;lockedDraft=null;}throw error;}}
  if(!created)throw Error('تعذر تثبيت هوية العقار.');await uploadDocuments();d.status.textContent=translateStatic('جارٍ حفظ Master Data وربط الأرشيف…');const {complete}=await saveMaster();window.dispatchEvent(new CustomEvent('aqari:property-saved',{detail:{name:lockedDraft.name,propertyId:created.id}}));d.status.textContent=translateMessage("تم إنشاء {v0} وأرشفة {v1} ملف/صورة. اكتمال الملف {v2}%.",{v0:(lockedDraft.name),v1:(uploaded.size),v2:(complete.score)});d.close();const module=await import('./property-hub.js');return module.openPropertyHub(created.id);
 }
 form.onsubmit=event=>{event.preventDefault();d.run(execute).catch(()=>{});};
 d.run(async()=>{access=await rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace});if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.permissions?.properties?.write!==true)throw Error('إضافة العقارات غير متاحة لصلاحية حسابك.');if(access?.permissions?.documents?.write!==true)files.append(node('p',translateStatic('ملاحظة: رفع الملفات غير متاح لهذه الصلاحية؛ يمكن إنشاء العقار بدون مرفقات.')));d.status.textContent=translateStatic('أكمل الملف في شاشة واحدة ثم اضغط حفظ.');name.focus();});
 return true;
}
