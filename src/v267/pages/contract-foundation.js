import {uiError} from '../components/ui-error.js';
import '../../../v267-rental-records.js';
import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {leaseEndFromMonths} from '../domain/lease-dates.js';
import {rentalTemplateKinds,validTemplate,templateForContract,templateKindName,mountTemplateFields} from '../components/rental-templates.js';
import {executionAmount,activeUnitConflict,completeTenantIdentity,foundationPaymentCycle,isFoundationContractTemplate,foundationTemplateValues} from '../domain/contract-foundation.js';
import {linkedDocumentFieldKeys} from '../domain/rental-document-cycle.js';

const copy=value=>JSON.parse(JSON.stringify(value));
function same(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>same(value,b[index]));
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.prototype.hasOwnProperty.call(b,key)&&same(a[key],b[key]));
}
const input=(type,value='')=>{const el=node('input');el.type=type;el.value=value??'';return el;};
function select(rows,value=''){const el=node('select');for(const [key,label]of rows){const option=node('option',label);option.value=key;el.append(option);}el.value=value??'';return el;}
function profileRef(row){if(!Array.isArray(row))return null;return row.find(x=>x&&typeof x==='object'&&x.aqariTenantProfileV267)?.aqariTenantProfileV267||row[4]||null;}
function formatMoney(value){return Number(value||0).toFixed(3)+translateStatic(' د.ك');}

export function openContractFoundation(options={}){
 const api=window.AQARI_RENTAL_RECORDS;
 if(!api)throw Error('تعذر تحميل محرك العقود.');
 const bridge=window.AQARI_SUPABASE;if(!bridge?.loadAppState||!bridge?.saveAppState)throw Error('تعذر تحميل جسر السحابة.');
 const d=createDialog(translateStatic('عقد جديد — التأسيس من البداية للنهاية'));if(!d)return false;
 const scope=()=>({userId:d.session.bound.user,workspaceId:d.session.bound.workspace});
 let state=null,properties=[],units=[],templates=[],preparation=null;
 const button=(label,fn)=>{const el=node('button',label);el.type='button';el.onclick=()=>d.run(fn);return el;};
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const clear=title=>d.body.replaceChildren(node('h3',title));

 async function load(){
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  const [saved,loadedProperties,loadedUnits,templateContext]=await Promise.all([
   window.AQARI_SUPABASE.loadAppState(scope()),
   d.session.request(d.session.client.from('aqari_properties').select('id,name,external_ref').eq('workspace_id',d.session.bound.workspace).or('metadata->>source_only.is.null,metadata->>source_only.neq.true').order('name')),
   d.session.request(d.session.client.from('aqari_units').select('id,property_id,unit_no').eq('workspace_id',d.session.bound.workspace).order('unit_no')),
   rpc('aqari_rental_templates',{p_workspace_id:d.session.bound.workspace,p_action:'context',p_data:{}})
  ]);
  d.session.check();
  state=api.primary(saved.payload);
  properties=loadedProperties;units=loadedUnits;
  if(templateContext?.workspace_id!==d.session.bound.workspace||templateContext?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد مساحة عمل النماذج.');
  templates=Array.isArray(templateContext?.items)?templateContext.items.filter(validTemplate).filter(isFoundationContractTemplate):[];
 }
 async function readBinding(propertyId,unitId){
  const result=await rpc('aqari_property_contract_context',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_unit_id:unitId});d.session.check();
  if(result?.workspace_id!==d.session.bound.workspace||result?.user_id!==d.session.bound.user||result?.property?.id!==propertyId||result?.unit?.id!==unitId||result.unit.propertyId!==propertyId)throw Error('تعذر تأكيد ربط الوحدة بالعقار.');
  return result;
 }
 async function verifyBinding(expectedFloor=''){
  const propertyId=preparation?.propertyId,unitId=preparation?.unitId;
  if(!propertyId||!unitId)throw Error('أعد ربط العقار والوحدة من السجل الخادمي قبل متابعة العقد.');
  const result=await readBinding(propertyId,unitId);
  if(result.activeLease)throw uiError(visibleMessage('يوجد عقد فعال على هذه الوحدة: {contract}',{contract:String(result.activeLease.contract_no||translateStatic('راجع سجل الوحدة'))}));
  if(result.property.name!==preparation.property||String(result.unit.unitNo)!==String(preparation.unit))throw Error('تغير اسم العقار أو رقم الوحدة منذ حفظ المسودة. أعد الربط قبل المتابعة.');
  if((preparation.propertyAddress||'')!==(result.property.address||''))throw Error('تغير عنوان العقار منذ حفظ المسودة. أعد ربط الوحدة بالعقد.');
  if(expectedFloor&&String(result.unit.floor||'')!==String(expectedFloor||''))throw Error('تغير دور الوحدة أو لا يطابق السجل الخادمي. صحح بيانات الوحدة أولاً.');
  return result;
 }

 async function changeState(mutate,verify){
  const bound=scope(),cloud=await window.AQARI_SUPABASE.loadAppState(bound);d.session.check();
  const payload=copy(cloud.payload),data=api.primary(payload),expected=mutate(data);
  await window.AQARI_SUPABASE.saveAppState(payload,Number(cloud.revision),bound);d.session.check();
  const confirmedCloud=await window.AQARI_SUPABASE.loadAppState(bound);d.session.check();
  const confirmed=api.primary(confirmedCloud.payload);
  if(!verify(confirmed,expected))throw Error('لم تؤكد إعادة القراءة حفظ العملية. حدّث الصفحة قبل إعادة المحاولة.');
  state=confirmed;return expected;
 }

 async function createPreparation(kind){
  let launch=null;
  if(options.propertyId&&options.unitId){launch=await readBinding(options.propertyId,options.unitId);if(launch.activeLease)throw Error('لا يمكن بدء عقد جديد؛ توجد علاقة عقد فعالة على هذه الوحدة.');}
  const id=crypto.randomUUID(),now=new Date().toISOString(),year=Number(api.kuwaitDate().slice(0,4));
  const contractNo=await rpc('aqari_reserve_contract_serial',{p_workspace_id:d.session.bound.workspace,p_contract_ref:id,p_year:year});d.session.check();
  if(typeof contractNo!=='string'||!new RegExp(`^AQ-C-${year}-\\d{6,}$`).test(contractNo))throw Error('تعذر تأكيد الرقم المتسلسل للعقد من الخادم.');
  preparation=await changeState(data=>{
   const drafts=data.contractPreparationDraftsV267||[],existing=drafts.find(row=>row.id===id);if(existing){if(existing.contractNo!==contractNo)throw Error('تعارض رقم العقد المحجوز.');return existing;}
   const initialProperty=launch?.property?.name||(properties.some(row=>row.name===options.property)?options.property:'');
   const record={id,contractNo,kind,status:'preparation',tenantId:null,property:initialProperty,propertyId:launch?.property?.id||null,propertyAddress:launch?.property?.address||'',unit:launch?.unit?.unitNo||'',unitId:launch?.unit?.id||null,floor:launch?.unit?.floor||'',propertyRevision:Number(launch?.binding?.propertyRevision||0),unitRevision:Number(launch?.binding?.unitRevision||0),createdAt:now,updatedAt:now,createdBy:d.session.bound.user,serialSource:'server-reservation-v1'};
   data.contractPreparationDraftsV267=drafts.concat([record]);
   data.audit=(data.audit||[]).concat([[d.session.bound.user,'إنشاء مسودة تأسيس عقد برقم محجوز من الخادم',contractNo,now]]);
   return record;
  },(data,record)=>(data.contractPreparationDraftsV267||[]).some(row=>same(row,record)));
  await editPreparation(false);
 }

 async function patchPreparation(patch,action='تحديث مسودة تأسيس عقد'){
  const id=preparation.id,now=new Date().toISOString();
  preparation=await changeState(data=>{
   const drafts=data.contractPreparationDraftsV267||[],index=drafts.findIndex(row=>row.id===id);if(index<0)throw Error('مسودة التأسيس غير موجودة.');
   if(drafts[index].status!=='preparation'||!same(drafts[index],preparation))throw Error('تغيرت مسودة التأسيس أو أغلقت في جلسة أخرى. أعد فتحها قبل المتابعة.');
   const next={...drafts[index],...copy(patch),updatedAt:now};drafts[index]=next;data.contractPreparationDraftsV267=drafts;
   data.audit=(data.audit||[]).concat([[d.session.bound.user,action,next.contractNo,now]]);return next;
  },(data,record)=>(data.contractPreparationDraftsV267||[]).some(row=>same(row,record)));
  return preparation;
 }

 async function cancelPreparation(){
  if(!preparation?.id||preparation.status!=='preparation')throw Error('هذه المسودة لم تعد مفتوحة للتأسيس.');
  const contractNo=preparation.contractNo||'',id=preparation.id;
  if(!window.confirm(translateStatic('إلغاء')+' '+contractNo+'؟'))return false;
  const now=new Date().toISOString();
  const cancelled=await changeState(data=>{
   const drafts=data.contractPreparationDraftsV267||[],index=drafts.findIndex(row=>row.id===id);if(index<0)throw Error('مسودة التأسيس غير موجودة.');
   if(drafts[index].status!=='preparation'||!same(drafts[index],preparation))throw Error('تغيرت مسودة التأسيس أو أغلقت في جلسة أخرى. أعد فتحها قبل المتابعة.');
   const next={...drafts[index],status:'cancelled',cancelledAt:now,cancelledBy:d.session.bound.user,cancelReason:'إلغاء مسودة تأسيس غير مكتملة من شاشة العقد',updatedAt:now};
   drafts[index]=next;data.contractPreparationDraftsV267=drafts;
   data.audit=(data.audit||[]).concat([[d.session.bound.user,'إلغاء مسودة تأسيس عقد',next.contractNo,now]]);
   return next;
  },(data,record)=>(data.contractPreparationDraftsV267||[]).some(row=>row.id===record.id&&row.status==='cancelled'&&row.cancelledAt===record.cancelledAt&&row.cancelledBy===record.cancelledBy));
  preparation=cancelled;await start();return true;
 }

 async function saveTenant(values,id){
  const now=new Date().toISOString();
  const saved=await changeState(data=>{
   const profiles=data.tenantProfilesV267||[],previous=profiles.find(p=>p.id===id),core=api.profile({...previous,...values,id,address:previous?.address||'',attachments:previous?.attachments||[]},profiles),next={...previous,...core,nationalityEn:String(values.nationalityEn||'').trim()};
   if(!completeTenantIdentity(next))throw Error('أكمل الاسم العربي والإنجليزي والرقم المدني والجواز والهاتف والبريد والجنسية بالعربي والإنجليزي.');
   const at=profiles.findIndex(p=>p.id===id);if(at<0)profiles.push(next);else profiles[at]=next;data.tenantProfilesV267=profiles;
   const tenants=data.tenants||[],tenantIndex=tenants.findIndex(row=>profileRef(row)===id);
   if(tenantIndex<0)tenants.push([next.nameAr,'','','نشط',id]);else{const row=copy(tenants[tenantIndex]);row[0]=next.nameAr;tenants[tenantIndex]=row;}data.tenants=tenants;
   data.tenantDirectoryV202=(data.tenantDirectoryV202||[]).map(row=>row.tenantProfileId===id?{...row,nameAr:next.nameAr,nameEn:next.nameEn,phone:next.phone,email:next.email,passportNo:next.passportNo,civilId:next.civilId,nationality:next.nationality,nationalityEn:next.nationalityEn}:row);
   data.audit=(data.audit||[]).concat([[d.session.bound.user,'حفظ بيانات المستأجر من عقد جديد',id,now]]);return next;
  },(data,record)=>(data.tenantProfilesV267||[]).some(p=>same(p,record))&&(data.tenants||[]).some(row=>profileRef(row)===record.id));
  await patchPreparation({tenantId:saved.id},'ربط المستأجر بمسودة العقد');return saved;
 }

 async function promoteContract(values,selectedTemplate,templateFieldValues,master){
  const now=new Date().toISOString(),id=preparation.id;
  return changeState(data=>{
   const savedPreparations=(data.contractPreparationDraftsV267||[]).filter(row=>row.id===id);
   if(savedPreparations.length!==1||savedPreparations[0].status!=='preparation'||!same(savedPreparations[0],preparation))throw Error('تغيرت مسودة التأسيس أو أغلقت في جلسة أخرى. أعد فتحها قبل المتابعة.');
   if((data.contractsV202||[]).some(row=>String(row.id)===String(id)))throw Error('سبق تثبيت هذه المسودة كعقد. افتح العقد المحفوظ؛ لم يتم استبداله.');
   const profiles=data.tenantProfilesV267||[],tenantProfile=profiles.find(p=>p.id===preparation.tenantId);if(!completeTenantIdentity(tenantProfile))throw Error('ملف المستأجر غير مكتمل. احفظه من هذه الشاشة أولاً.');
   const linked=foundationTemplateValues(data,preparation,{...values,writtenOn:api.kuwaitDate()},{properties,units,propertyMasters:[master],workspaceId:d.session.bound.workspace});
   const preparedTemplate=templateForContract(selectedTemplate,{...templateFieldValues,...linked});
   const base={...preparedTemplate,...values,id,contract_no:preparation.contractNo,tenantId:preparation.tenantId,property:preparation.property,propertyId:preparation.propertyId,propertyAddress:preparation.propertyAddress,unit:preparation.unit,unitId:preparation.unitId,automaticUnitRef:values.automaticUnitRef||'',rent:values.contractRent,writtenOn:api.kuwaitDate(),rentalTermsVersion:1,contractReceived:'لم يستلم',receivedAt:'',depositReceivedOn:'',evictionNotice:translateStatic('غير محدد'),status:'draft',rentAdjustments:[],language:'ar',source:'v267-cloud',preparationRef:id,contractKind:preparation.kind,changeReason:'تأسيس العقد من بوابة عقد جديد'};
   const conflict=activeUnitConflict(data.contractsV202||[],base);if(conflict)throw uiError(visibleMessage('يوجد عقد متعارض لهذه الوحدة: {contract}',{contract:String(conflict.contract_no||conflict.contractNo||translateStatic('راجع العقد الحالي'))}));
   const contract=api.lease(base,data.contractsV202||[],profiles,data.properties||[]),old=data.contractsV202||[];
   old.push(contract);data.contractsV202=old;
   const directory=(data.tenantDirectoryV202||[]).filter(row=>row.contractNo!==contract.contract_no);directory.push({property:contract.property,unit:contract.unit,floor:contract.floor||'',propertyId:contract.propertyId,unitId:contract.unitId,...api.directoryFields(contract,tenantProfile),nationalityEn:tenantProfile.nationalityEn||'',contractNo:contract.contract_no,source:'v267-cloud',verified:false,tenantProfileId:tenantProfile.id});data.tenantDirectoryV202=directory;
   const leases=(data.leases||[]).filter(row=>row[4]!==contract.id);leases.push([contract.tenant,contract.unit,contract.rent,contract.end_date,contract.id]);data.leases=leases;
   const drafts=data.contractPreparationDraftsV267||[],draftIndex=drafts.findIndex(row=>row.id===id);if(draftIndex>=0)drafts[draftIndex]={...drafts[draftIndex],status:'promoted',contractId:contract.id,promotedAt:now,updatedAt:now};data.contractPreparationDraftsV267=drafts;
   data.audit=(data.audit||[]).concat([[d.session.bound.user,'تأسيس عقد مسودة وربطه بمعرف العقار والوحدة',contract.contract_no,now]]);return contract;
  },(data,contract)=>(data.contractsV202||[]).some(row=>same(row,contract))&&(data.contractPreparationDraftsV267||[]).some(row=>row.id===id&&row.status==='promoted'&&String(row.contractId)===String(contract.id)));
 }

 async function start(){
  await load();clear(translateStatic('ابدأ عقدًا جديدًا'));
  if(options.propertyId&&options.unitId)d.body.append(node('p',translateStatic('بدأت من ملف وحدة محددة. سيعيد النظام التحقق من العقار والوحدة والدور قبل حفظ العقد.')));
  d.body.append(node('p',translateStatic('اختر نوع العقد أولاً. عند الاختيار يحجز الخادم رقم عقد فريدًا على مستوى المنصة وينشئ مسودة تأسيس محفوظة فورًا؛ لا يتم إنشاء دفعة أو وصل وهمي.')));
  const openDrafts=(state.contractPreparationDraftsV267||[]).filter(row=>row.status==='preparation');
  const availableKinds=[...new Map(templates.map(row=>[row.kind,templateKindName(row)])).entries()];
  if(openDrafts.length){const section=node('section');section.append(node('h4',translateStatic('مسودات تأسيس محفوظة')));for(const row of openDrafts)section.append(button(`${row.contractNo} · ${availableKinds.find(x=>x[0]===row.kind)?.[1]||translateStatic(rentalTemplateKinds.find(x=>x[0]===row.kind)?.[1])||row.kind}`,async()=>{preparation=row;await editPreparation();}));d.body.append(section);}
  const choices=node('div');choices.className='aq267-grid';for(const [kind,label]of availableKinds)choices.append(button(label,()=>createPreparation(kind)));d.body.append(choices);if(!availableKinds.length)d.body.append(node('p',translateStatic('لا يوجد نموذج عقد معتمد. افتح نماذج العقود وأنشئ مسودة ثم عاينها واعتمدها بنفسك.')));d.status.textContent=translateStatic('لم يتم تسجيل أي حركة مالية.');
 }

 async function editPreparation(reload=true){
  if(reload)await load();preparation=(state.contractPreparationDraftsV267||[]).find(row=>row.id===preparation.id)||preparation;if(preparation.status!=='preparation')throw Error('هذه المسودة لم تعد مفتوحة للتأسيس.');
  clear(translateStatic('تأسيس ')+preparation.contractNo);d.el.classList.add('aq267-contract-foundation');const cancelDraft=button(translateStatic('إلغاء'),cancelPreparation);cancelDraft.className='danger';const workspace=node('section');workspace.className='aq267-contract-foundation-workspace';const header=node('header');header.className='aq267-contract-foundation-header';header.append(node('div',translateStatic('مسودة محفوظة تلقائيًا')),node('strong',preparation.contractNo),node('p',translateStatic('أدخل البيانات بحرية؛ التحقق الكامل يتم فقط عند تثبيت العقد.')));workspace.append(header,node('div'));d.body.append(button(translateStatic('رجوع'),start),cancelDraft,workspace);
  const profiles=state.tenantProfilesV267||[],tenantChoice=select([['',translateStatic('مستأجر جديد')],...profiles.map(p=>[p.id,(p.nameAr||p.nameEn)+' / '+(p.nameEn||'')])],preparation.tenantId||'');
  const tenantBox=node('fieldset'),tenantFields={};tenantBox.append(node('legend',translateStatic('بيانات المستأجر — من نفس شاشة العقد')));
  const tenantSpecs=[['nameAr',translateStatic('الاسم الكامل بالعربي'),'text'],['nameEn',translateStatic('الاسم الكامل بالإنجليزي'),'text'],['civilId',translateStatic('الرقم المدني'),'text'],['passportNo',translateStatic('رقم الجواز'),'text'],['phone',translateStatic('الهاتف'),'tel'],['email',translateStatic('البريد الإلكتروني'),'email'],['nationality',translateStatic('الجنسية بالعربي'),'text'],['nationalityEn',translateStatic('الجنسية بالإنجليزي'),'text']];
  for(const [key,label,type]of tenantSpecs){const control=input(type);control.required=true;control.maxLength=300;tenantFields[key]=control;tenantBox.append(field(label,control));}
  let tenantId=tenantChoice.value||crypto.randomUUID();
  function fillTenant(){const profile=profiles.find(p=>p.id===tenantChoice.value);tenantId=profile?.id||crypto.randomUUID();for(const [key,control]of Object.entries(tenantFields))control.value=profile?.[key]||'';}
  tenantChoice.onchange=fillTenant;fillTenant();
  const saveTenantButton=button(translateStatic('حفظ المستأجر وربطه بالعقد'),async()=>{const values=Object.fromEntries(Object.entries(tenantFields).map(([key,control])=>[key,control.value]));const saved=await saveTenant(values,tenantId);const existing=profiles.findIndex(p=>p.id===saved.id);if(existing<0)profiles.push(saved);else profiles[existing]=saved;if(![...tenantChoice.options].some(option=>option.value===saved.id)){const option=node('option',(saved.nameAr||saved.nameEn)+' / '+(saved.nameEn||''));option.value=saved.id;tenantChoice.append(option);}tenantChoice.value=saved.id;tenantId=saved.id;preparation.tenantId=saved.id;refreshTemplateFields();d.status.textContent=translateStatic('تم حفظ المستأجر وربطه بمسودة العقد.');});
  const tenantSection=node('section');tenantSection.className='aq267-contract-foundation-section';tenantSection.append(node('h4',translateStatic('المستأجر')),field(translateStatic('اختر مستأجرًا محفوظًا أو أضف جديدًا'),tenantChoice),tenantBox,saveTenantButton);workspace.append(tenantSection);

  const initialPropertyId=preparation.propertyId||'',property=select([['',translateStatic('اختر العقار')],...properties.map(p=>[p.id,p.name])],initialPropertyId),unit=select([['',translateStatic('اختر الوحدة')]],preparation.unitId||'');property.required=unit.required=true;
  function unitsForProperty(value){unit.replaceChildren();for(const [id,label]of [['',translateStatic('اختر الوحدة')],...units.filter(row=>row.property_id===property.value).map(row=>[String(row.id),String(row.unit_no)])]){const option=node('option',label);option.value=id;unit.append(option);}unit.value=value||'';}
  property.onchange=()=>unitsForProperty('');unitsForProperty(preparation.unitId||'');

  const form=node('form'),grid=node('div');form.className='aq267-contract-foundation-form';form.noValidate=true;grid.className='aq267-grid aq267-contract-foundation-grid';
  const paymentCycle=select([['',translateStatic('اختر دورية السداد')],['1',translateStatic('شهري')],['3',translateStatic('ربع سنوي')],['6',translateStatic('نصف سنوي')],['12',translateStatic('سنوي')]],String(preparation.paymentCycleMonths||''));paymentCycle.required=true;grid.append(field(translateStatic('دورية السداد'),paymentCycle));
  const floor=input('text',preparation.floor||''),startDate=input('date',preparation.start_date||''),duration=input('number',preparation.durationMonths||'12'),endDate=input('date',preparation.end_date||''),entitlementStart=input('date',preparation.entitlementStart||''),firstPolicy=select([['full_month',translateStatic('شهر كامل')],['daily_prorated',translateStatic('احتساب أول فترة بالأيام')],['manual_first_period',translateStatic('مبلغ أول فترة يدوي')]],preparation.firstPeriodPolicy||'full_month'),manualFirst=input('text',preparation.manualFirstPeriodAmount??'');
  floor.required=true;floor.maxLength=100;duration.min='1';duration.max='600';duration.step='1';startDate.required=duration.required=endDate.required=entitlementStart.required=firstPolicy.required=true;
  const linkButton=button(translateStatic('حفظ ربط العقار والوحدة من السجل الخادمي'),async()=>{if(!property.value||!unit.value)throw Error('اختر العقار والوحدة.');const ctx=await readBinding(property.value,unit.value);if(ctx.activeLease)throw Error('يوجد عقد فعال على هذه الوحدة.');floor.value=ctx.unit.floor||'';floor.readOnly=true;await patchPreparation({property:ctx.property.name,propertyId:ctx.property.id,propertyAddress:ctx.property.address||'',unit:ctx.unit.unitNo,unitId:ctx.unit.id,floor:ctx.unit.floor||'',propertyRevision:Number(ctx.binding?.propertyRevision||0),unitRevision:Number(ctx.binding?.unitRevision||0)},'ربط العقار والوحدة والدور بمسودة العقد من السجل الخادمي');templateMaster=ctx;refreshTemplateFields();d.status.textContent=translateStatic('تم ربط ')+ctx.property.name+translateStatic(' / الوحدة ')+ctx.unit.unitNo+translateStatic(' / الدور ')+(ctx.unit.floor||translateStatic('غير محدد'))+'.';});
  const propertySection=node('section');propertySection.className='aq267-contract-foundation-section';propertySection.append(node('h4',translateStatic('العقار والوحدة')),field(translateStatic('العقار'),property),field(translateStatic('الوحدة'),unit),linkButton);workspace.append(propertySection);
  const recalcEnd=()=>{if(startDate.value&&duration.value){endDate.value=leaseEndFromMonths(startDate.value,Number(duration.value));if(!entitlementStart.value)entitlementStart.value=startDate.value;}};startDate.onchange=duration.oninput=recalcEnd;
  for(const [label,control]of [[translateStatic('الدور — من سجل الوحدة'),floor],[translateStatic('بداية العقد'),startDate],[translateStatic('مدة العقد بالأشهر'),duration],[translateStatic('نهاية العقد المحتسبة'),endDate],[translateStatic('بداية الاستحقاق'),entitlementStart],[translateStatic('سياسة أول فترة'),firstPolicy],[translateStatic('صافي أول فترة اليدوي عند اختياره'),manualFirst]])grid.append(field(label,control));
  floor.readOnly=Boolean(preparation.unitId);
  const rent=input('text',preparation.contractRent??''),discount=input('text',preparation.discount??'0'),deposit=input('text',preparation.deposit??'0'),advance=input('text',preparation.advance??'0'),fees=input('text',preparation.fees??'0'),accountant=input('text',preparation.accountant??''),free=input('checkbox'),freePeriod=input('month',preparation.freeMonthPeriod||'');
  for(const control of [rent,discount,deposit,advance,fees,manualFirst])control.inputMode='decimal';rent.required=discount.required=deposit.required=advance.required=fees.required=accountant.required=true;accountant.maxLength=300;free.checked=preparation.freeMonthApproved===true;free.disabled=d.session.bound.role!=='general_manager';freePeriod.disabled=free.disabled;free.onchange=()=>{freePeriod.required=free.checked;if(!free.checked)freePeriod.value='';};free.onchange();
  for(const [label,control]of [[translateStatic('الإيجار الأصلي'),rent],[translateStatic('الخصم'),discount],[translateStatic('التأمين'),deposit],[translateStatic('العربون'),advance],[translateStatic('الرسوم عند الإبرام'),fees],[translateStatic('المحاسب المسؤول'),accountant],[translateStatic('اعتماد فترة مجانية'),free],[translateStatic('الشهر المجاني'),freePeriod]])grid.append(field(label,control));
  const templateSelect=select([['',translateStatic('اختر النسخة المنشورة')],...templates.filter(t=>t.kind===preparation.kind).map(t=>[t.id,visibleMessage("{p0} · الإصدار {p1}",{p0:(t.title),p1:(t.version)})])],preparation.templateId||''),templateFieldsBox=node('div');let templateMaster=null,templateFieldControls={values:()=>({}),setValues(){}};templateSelect.required=true;
  function selectedBindingMatches(){return Boolean(preparation.tenantId&&preparation.propertyId&&preparation.unitId&&tenantChoice.value===preparation.tenantId&&property.value===preparation.propertyId&&unit.value===preparation.unitId);}
  function assertSelectedBinding(){if(!selectedBindingMatches())throw Error('احفظ اختيار المستأجر وربط العقار والوحدة الظاهرة قبل متابعة العقد.');}
  function templateSourceValues(){
   const empty=Object.fromEntries(linkedDocumentFieldKeys.map(key=>[key,'']));
   if(!selectedBindingMatches())return empty;
   const values={floor:floor.value,start_date:startDate.value,end_date:endDate.value,contractRent:rent.value,deposit:deposit.value,advance:advance.value,cleaningFee:fees.value,accountant:accountant.value,writtenOn:api.kuwaitDate()};
   try{return {...empty,...foundationTemplateValues(state,preparation,values,{properties,units,propertyMasters:templateMaster?[templateMaster]:[],workspaceId:d.session.bound.workspace})};}catch{return empty;}
  }
  function refreshTemplateFields(){templateFieldControls.setValues(templateSourceValues());}
  templateSelect.onchange=()=>d.run(async()=>{
   const selected=templates.find(t=>t.id===templateSelect.value&&t.kind===preparation.kind);
   templateFieldControls=mountTemplateFields(templateFieldsBox,selected,templateSourceValues(),{lockedKeys:linkedDocumentFieldKeys});
   if(selected&&selectedBindingMatches()){templateMaster=await readBinding(preparation.propertyId,preparation.unitId);refreshTemplateFields();}
  });
  tenantChoice.onchange=()=>{fillTenant();refreshTemplateFields();};
  property.onchange=()=>{unitsForProperty('');templateMaster=null;refreshTemplateFields();};
  unit.onchange=()=>{templateMaster=null;refreshTemplateFields();};
  startDate.onchange=duration.oninput=()=>{recalcEnd();refreshTemplateFields();};
  for(const control of [floor,endDate,rent,deposit,advance,fees,accountant])control.oninput=refreshTemplateFields;
  const autosaveStatus=node('p',translateStatic('الحفظ التلقائي جاهز'));autosaveStatus.className='aq267-contract-autosave';autosaveStatus.setAttribute('role','status');autosaveStatus.setAttribute('aria-live','polite');
  const currentDraftPatch=()=>({paymentCycleMonths:paymentCycle.value?Number(paymentCycle.value):null,start_date:startDate.value,end_date:endDate.value,durationMonths:Number(duration.value)||null,entitlementStart:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:firstPolicy.value==='manual_first_period'?manualFirst.value:null,contractRent:rent.value,discount:discount.value,deposit:deposit.value,advance:advance.value,fees:fees.value,accountant:accountant.value,freeMonthApproved:free.checked,freeMonthPeriod:free.checked?freePeriod.value:'',templateId:templateSelect.value});let autosaveTimer=null,autosaveRun=Promise.resolve();
  const scheduleAutosave=()=>{clearTimeout(autosaveTimer);autosaveStatus.textContent=translateStatic('سيُحفظ تلقائيًا…');autosaveTimer=setTimeout(()=>{const patch=currentDraftPatch();autosaveRun=autosaveRun.catch(()=>{}).then(async()=>{await patchPreparation(patch,'حفظ تلقائي لمسودة تأسيس العقد');autosaveStatus.textContent=translateStatic('حُفظت المسودة تلقائيًا');}).catch(error=>{autosaveStatus.textContent=translateStatic('تعذر الحفظ التلقائي؛ بياناتك ما زالت في الشاشة.');d.status.textContent=error.message;});},500);};
  for(const control of [paymentCycle,startDate,duration,endDate,entitlementStart,firstPolicy,manualFirst,rent,discount,deposit,advance,fees,accountant,free,freePeriod,templateSelect])control.addEventListener('input',scheduleAutosave),control.addEventListener('change',scheduleAutosave);
  form.append(grid,field(translateStatic('قالب العقد المنشور'),templateSelect),templateFieldsBox,autosaveStatus);
  const review=node('section'),reviewButton=button(translateStatic('مراجعة المبلغ المستحق عند الإبرام'),async()=>{
   if(!preparation.tenantId)throw Error('احفظ المستأجر واربطه أولاً.');if(!preparation.property||!preparation.unit)throw Error('احفظ ربط العقار والوحدة أولاً.');
   assertSelectedBinding();const paymentCycleMonths=foundationPaymentCycle(paymentCycle.value);const fresh=await verifyBinding(floor.value);floor.value=fresh.unit.floor||'';templateMaster=fresh;refreshTemplateFields();
   const contractRent=api.amount(rent.value),initialDiscount=api.amount(discount.value);if(initialDiscount>=contractRent)throw Error('الخصم الشهري يجب أن يكون أقل من الإيجار الأصلي؛ استخدم صافي أول فترة أو الشهر المجاني لعروض البداية.');
   const candidate={id:preparation.id,property:preparation.property,propertyId:preparation.propertyId,unit:preparation.unit,unitId:preparation.unitId,start_date:startDate.value,end_date:endDate.value,rent:Number(((Math.round(contractRent*1000)-Math.round(initialDiscount*1000))/1000).toFixed(3)),contractRent,discount:initialDiscount,rentalTermsVersion:1,freeMonthApproved:free.checked,freeMonthPeriod:free.checked?freePeriod.value:'',rentAdjustments:[],rentEntitlement:{version:1,startDate:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:firstPolicy.value==='manual_first_period'?manualFirst.value:null}};
   const conflict=activeUnitConflict(state.contractsV202||[],candidate);if(conflict)throw uiError(visibleMessage('يوجد عقد متعارض على هذه الوحدة: {contract}',{contract:String(conflict.contract_no||conflict.contractNo||translateStatic('راجع العقود'))}));
   const firstRent=api.effectiveRent(candidate,entitlementStart.value.slice(0,7)),due=executionAmount({firstRent,deposit:deposit.value,advance:advance.value,fees:fees.value});
   review.replaceChildren(node('h4',translateStatic('المستحق عند الإبرام')),node('p',translateStatic('العقار: ')+fresh.property.name+' — '+(fresh.property.address||translateStatic('العنوان غير محفوظ'))),node('p',translateStatic('الوحدة: ')+fresh.unit.unitNo+translateStatic(' — الدور: ')+(fresh.unit.floor||translateStatic('غير محدد'))),node('p',translateStatic('إيجار أول فترة: ')+formatMoney(due.firstRent)),node('p',translateStatic('التأمين: ')+formatMoney(due.deposit)),node('p',translateStatic('العربون: ')+formatMoney(due.advance)),node('p',translateStatic('الرسوم: ')+formatMoney(due.fees)),node('strong',translateStatic('الإجمالي: ')+formatMoney(due.total)),node('p',due.total===0?translateStatic('لا توجد دفعة مستحقة. سيبقى ذلك موثقًا دون إنشاء دفعة أو وصل وهمي.'):translateStatic('الدفعة الفعلية لا تُسجل إلا بطريقة دفع ومرجع حركة فعليين.')));
   await patchPreparation({paymentCycleMonths,floor:fresh.unit.floor||'',propertyAddress:fresh.property.address||'',propertyRevision:Number(fresh.binding?.propertyRevision||0),unitRevision:Number(fresh.binding?.unitRevision||0),start_date:startDate.value,end_date:endDate.value,durationMonths:Number(duration.value),entitlementStart:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:firstPolicy.value==='manual_first_period'?manualFirst.value:null,contractRent:rent.value,discount:discount.value,deposit:deposit.value,advance:advance.value,fees:fees.value,accountant:accountant.value,freeMonthApproved:free.checked,freeMonthPeriod:free.checked?freePeriod.value:'',dueAtExecution:due.total},'مراجعة وحفظ شروط تأسيس العقد');
   d.status.textContent=translateStatic('تم حفظ الشروط واحتساب المستحق عند الإبرام.');
  });
  form.append(reviewButton,review);
  const save=node('button',translateStatic('تثبيت العقد كمسودة تشغيلية'));save.type='submit';form.append(save);workspace.append(form);
  form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
   if(!preparation.tenantId||!preparation.property||!preparation.unit||!preparation.propertyId||!preparation.unitId)throw Error('أكمل ربط المستأجر والعقار والوحدة من السجل الخادمي أولاً.');
   assertSelectedBinding();const paymentCycleMonths=foundationPaymentCycle(paymentCycle.value);const fresh=await verifyBinding(floor.value);floor.value=fresh.unit.floor||'';templateMaster=fresh;refreshTemplateFields();
   const selectedTemplate=templates.find(t=>t.id===templateSelect.value&&t.kind===preparation.kind);if(!selectedTemplate)throw Error('اختر نسخة قالب منشورة لنوع العقد.');
   const contractRent=api.amount(rent.value),initialDiscount=api.amount(discount.value);if(initialDiscount>=contractRent)throw Error('الخصم الشهري يجب أن يكون أقل من الإيجار الأصلي.');
   const values={paymentCycleMonths,floor:fresh.unit.floor||'',propertyId:fresh.property.id,unitId:fresh.unit.id,propertyAddress:fresh.property.address||'',automaticUnitRef:fresh.unit.automaticRef||'',start_date:startDate.value,end_date:endDate.value,contractRent:rent.value,discount:discount.value,deposit:deposit.value,advance:advance.value,cleaningFee:fees.value,accountant:accountant.value,freeMonthApproved:free.checked,freeMonthPeriod:free.checked?freePeriod.value:'',rentEntitlement:{version:1,startDate:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:firstPolicy.value==='manual_first_period'?manualFirst.value:null}};
   const previewCandidate={...values,id:preparation.id,property:preparation.property,unit:preparation.unit,rent:Number(((Math.round(contractRent*1000)-Math.round(initialDiscount*1000))/1000).toFixed(3)),rentalTermsVersion:1,rentAdjustments:[]};
   const conflict=activeUnitConflict(state.contractsV202||[],previewCandidate);if(conflict)throw Error('يوجد عقد متعارض على هذه الوحدة.');
   const firstRent=api.effectiveRent(previewCandidate,entitlementStart.value.slice(0,7)),due=executionAmount({firstRent,deposit:deposit.value,advance:advance.value,fees:fees.value});values.executionSummary={firstRent:due.firstRent,deposit:due.deposit,advance:due.advance,fees:due.fees,total:due.total,requiresPayment:due.total>0,zeroPaymentReason:due.total===0?(free.checked?'فترة مجانية/صافي مستحق صفر':'صافي المستحق عند الإبرام صفر'):null};
   const contract=await promoteContract(values,selectedTemplate,templateFieldControls.values(),fresh);d.status.textContent=translateStatic('تم تأسيس العقد كمسودة تشغيلية وربطه بمعرف العقار والوحدة والدور. لا توجد دفعة مسجلة حتى الآن.');
   d.close();if(typeof options.openContracts==='function')options.openContracts({id:contract.id});
  });};
 }

 d.run(start);return true;
}
