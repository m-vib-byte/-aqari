// Pure document structure and binding helpers. These functions never save,
// approve, seed or publish templates, documents, payments or signatures.
import {validateTemplatePresentation} from './rental-document-layout.js';
const scalar=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
const first=(...values)=>values.map(scalar).find(Boolean)||'';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const rows=value=>Array.isArray(value)?value.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)):[];
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const fail=message=>{throw Error(message);};
const aliases=Object.freeze({civil_id:'tenant_civil_id',nationality:'tenant_nationality',floor:'floor_no',tenant_passport:'tenant_passport_no',contract_start_date:'start_date',contract_end_date:'end_date',owner_representative_name:'representative_name'});
const definitions=[
 ['contract_no','رقم العقد'],['tenant_name','اسم المستأجر'],['tenant_name_en','اسم المستأجر بالإنجليزية'],['tenant_civil_id','الرقم المدني للمستأجر'],['tenant_nationality','جنسية المستأجر'],['tenant_nationality_en','جنسية المستأجر بالإنجليزية'],['tenant_passport_no','رقم جواز المستأجر'],['tenant_phone','هاتف المستأجر'],['tenant_email','بريد المستأجر'],
 ['owner_name','اسم مالك العقار'],['owner_name_en','اسم المالك بالإنجليزية'],['owner_civil_id','الرقم المدني للمالك'],['owner_nationality','جنسية المالك'],['representative_name','اسم وكيل المالك'],['representative_civil_id','الرقم المدني للوكيل'],['representative_nationality','جنسية الوكيل'],['power_of_attorney_no','رقم التوكيل'],['power_of_attorney_year','سنة التوكيل'],
 ['property_name','اسم العقار'],['property_address','عنوان العقار'],['property_area','المنطقة'],['property_block','القطعة'],['property_street','الشارع'],['property_building_no','رقم البناية'],['property_automatic_no','الرقم الآلي للعقار'],['unit_no','رقم الوحدة'],['unit_automatic_no','الرقم الآلي للوحدة'],['floor_no','الدور'],
 ['start_date','تاريخ بداية العقد','date'],['end_date','تاريخ نهاية العقد','date'],['contract_date','تاريخ تحرير العقد','date'],['monthly_rent','الإيجار الأصلي عند كتابة العقد','money'],['deposit_amount','مبلغ التأمين','money'],['advance_amount','مبلغ العربون','money'],['cleaning_fee','رسوم النظافة','money'],['accountant_name','اسم المحاسب'],
 ['receipt_no','رقم الوصل'],['receipt_date','تاريخ الوصل','date'],['rent_period','فترة الإيجار'],['amount','المبلغ المدفوع','money'],['payment_method','طريقة الدفع'],['payment_reference','رقم مرجع الدفع'],['receiver_name','اسم المستلم'],
 ['document_no','رقم المستند','text','document'],['issued_at','تاريخ الإصدار','date','document'],['handover_date','تاريخ استلام الوحدة','date','document'],['key_count','عدد المفاتيح','number','document'],['unit_condition','حالة الوحدة','text','document'],['vacate_date','تاريخ الإخلاء','date','document'],['key_return_date','تاريخ تسليم المفاتيح','date','document'],['settlement_reference','مرجع التسوية النهائية','text','document'],['net_balance','الرصيد النهائي','money','document'],['business_activity','النشاط التجاري','text','document']
];
export const documentFieldCatalog=Object.freeze(Object.fromEntries(definitions.map(([key,label,type='text',source='linked'])=>[key,Object.freeze({key,label,type,source})])));
export const linkedDocumentFieldKeys=Object.freeze([...definitions.filter(x=>x[3]!=='document').map(x=>x[0]),...Object.keys(aliases)]);
const common=['contract_no','tenant_name','tenant_civil_id','tenant_nationality','property_name','unit_no','floor_no'];
const fieldSpecs=(keys,optional=[])=>keys.map(key=>({...documentFieldCatalog[key],required:!optional.includes(key)}));
const signer=(role,label,nameKey)=>({role,label,nameKey,signatureKey:role+'_signature',fingerprintKey:role+'_fingerprint'});
const tenantSigner=signer('tenant','المستأجر','tenant_name');
const ownerSigner=signer('owner','المالك / الوكيل المفوض','owner_name');
export const documentTemplateBlueprints=Object.freeze([
 {kind:'rental_agreement',label:'نموذج عقد إيجار',fields:fieldSpecs([...common,'owner_name','start_date','end_date','monthly_rent']),signers:[ownerSigner,tenantSigner]},
 {kind:'apartment_handover',label:'نموذج استلام الوحدة / الشقة',fields:fieldSpecs([...common,'document_no','handover_date','key_count','unit_condition']),signers:[tenantSigner]},
 {kind:'rent_receipt',label:'نموذج وصل إيجار',fields:fieldSpecs([...common,'receipt_no','receipt_date','rent_period','amount','payment_method','payment_reference','receiver_name','accountant_name'],['payment_reference','receiver_name','accountant_name']),signers:[signer('receiver','المستلم','receiver_name'),signer('accountant','المحاسب','accountant_name')]},
 {kind:'eviction',label:'تعهد / قرار الإخلاء من المستأجر',fields:fieldSpecs([...common,'owner_name','document_no','contract_date','vacate_date']),signers:[tenantSigner]},
 {kind:'owner_final_clearance',label:'براءة ذمة ومخالصة نهائية من مالك العقار',fields:fieldSpecs([...common,'owner_name','document_no','issued_at','start_date','end_date','settlement_reference','net_balance']),signers:[ownerSigner,tenantSigner]}
]);

export function resolveDocumentSigners(kind,values={},presentation=null){
 // Existing apartment/house/shop/custom contract kinds remain lease kinds.
 const blueprint=documentTemplateBlueprints.find(item=>item.kind===kind)||documentTemplateBlueprints[0];
 const settings=presentation?.signers,available=[ownerSigner,tenantSigner,signer('receiver','المستلم','receiver_name'),signer('accountant','المحاسب','accountant_name')];
 const extra=presentation?.editor?.signers,selected=settings?available.filter(item=>['name','signature','fingerprint'].some(key=>settings[item.role]?.[key]===true)||['civil_id','nationality'].some(key=>extra?.details?.[item.role]?.[key]===true)):(blueprint?.signers||[]);
 if(extra?.order)selected.sort((a,b)=>{const rank=role=>extra.order.includes(role)?extra.order.indexOf(role):extra.order.length+available.findIndex(item=>item.role===role);return rank(a.role)-rank(b.role);});
 return selected.map(item=>{
  const useRepresentative=item.role==='owner'&&fieldValue(values,'representative_name');
  const signer=useRepresentative?{...item,label:'وكيل المالك المفوض',nameKey:'representative_name'}:{...item};
  const flags=settings?.[item.role]||(settings?{name:false,signature:false,fingerprint:false}:{name:true,signature:true,fingerprint:true}),details=extra?.details?.[item.role],prefix=useRepresentative?'representative':item.role;
  return {...signer,name:flags.name?fieldValue(values,signer.nameKey):'',signature:'',fingerprint:'',showName:flags.name,showSignature:flags.signature,showFingerprint:flags.fingerprint,...(details?{civilId:details.civil_id?fieldValue(values,prefix+'_civil_id'):'',nationality:details.nationality?fieldValue(values,prefix+'_nationality'):'',showCivilId:details.civil_id,showNationality:details.nationality}:{})};
 });
}

export function fieldValue(values,key){
 const canonical=aliases[key]||key;
 const keys=[canonical,...Object.keys(aliases).filter(alias=>aliases[alias]===canonical)];
 const present=keys.filter(k=>own(values,k)&&scalar(values[k])!=='').map(k=>scalar(values[k]));
 if(new Set(present).size>1)fail('تعارض في قيمة الحقل '+(documentFieldCatalog[canonical]?.label||canonical)+'؛ صحح القيمة في المصدر.');
 return present[0]||'';
}
export const canonicalDocumentFieldKey=key=>aliases[key]||key;
export function normalizeDocumentValues(values={}){
 const result={...object(values)};
 for(const [alias,canonical]of Object.entries(aliases)){const value=fieldValue(values,canonical);if(own(values,alias)||own(values,canonical)){result[alias]=value;result[canonical]=value;}}
 return result;
}

export function validateTemplateFields(template){
 if(!template||!Array.isArray(template.fields||[])||!Array.isArray(template.clauses)||!template.clauses.length)fail('أضف بنود النموذج وحدد حقوله المتغيرة.');
 const fields=template.fields||[],keys=new Set(),canonicalKeys=new Set();
 for(const spec of fields){
  const key=spec?.key;
  if(typeof key!=='string'||!/^[a-z][a-z0-9_]{1,49}$/.test(key)||['field_name','constructor','prototype','__proto__'].includes(key))fail('يوجد حقل يحتاج تحديد؛ اختر المعلومة الصحيحة من قائمة الحقول.');
  if(!scalar(spec.label)||!['text','number','date','money'].includes(spec.type||'text'))fail('أكمل اسم الحقل ونوعه من قائمة الحقول.');
  const canonical=aliases[key]||key;
  if(keys.has(key)||canonicalKeys.has(canonical))fail('الحقل مكرر: '+spec.label+'؛ استخدم تعريفًا واحدًا لكل معلومة.');
  keys.add(key);canonicalKeys.add(canonical);
 }
 for(const clause of [{title:template.title||'',text:''},...template.clauses]){
  if(!clause||typeof clause.title!=='string'||typeof clause.text!=='string')fail('راجع عنوان البند ونصه.');
  for(const text of [clause.title,clause.text]){
   const remaining=text.replace(/\{\{([a-z][a-z0-9_]{1,49})\}\}/g,(token,key)=>{
    if(key==='field_name')fail('يوجد حقل يحتاج تحديد؛ اختر المعلومة الصحيحة من قائمة الحقول.');
    if(!keys.has(key))fail('يوجد حقل غير معرّف؛ حدده داخل النص واختر المعلومة الصحيحة من قائمة الحقول.');
    return '';
   });
   if(/[{}]/.test(remaining))fail('يوجد حقل غير مكتمل؛ حدده داخل النص واختر المعلومة من قائمة الحقول.');
  }
 }
 validateTemplatePresentation(template.presentation,fields,template.clauses);
 return fields;
}
function displayValue(value,spec){
 if(!value)return '';
 if(spec.type==='date'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('أدخل تاريخًا صحيحًا للحقل: '+spec.label);
  return value.split('-').reverse().join('/');
 }
 if(spec.type==='money'){
  if(!/^-?\d+(?:\.\d{1,3})?$/.test(value)||!Number.isSafeInteger(Math.round(Number(value)*1000)))fail('أدخل مبلغًا صحيحًا بدقة ثلاثة منازل للحقل: '+spec.label);
  return Number(value).toFixed(3);
 }
 if(spec.type==='number'&&!/^-?\d+(?:\.\d+)?$/.test(value))fail('أدخل رقمًا صحيحًا للحقل: '+spec.label);
 return value;
}
export function renderDocumentTemplate(template,providedValues={}, {requireValues=true}={}){
 const fields=validateTemplateFields(template),values={},display={},missing=[];
 const safeValue=(key,label=key)=>{const value=fieldValue(providedValues,key);if(value.includes('{{')||value.includes('}}'))fail('تحتوي قيمة '+label+' على رمز حقل؛ صحح القيمة الأصلية قبل المعاينة.');return value;};
 for(const spec of fields){
  const value=safeValue(spec.key,spec.label);
  values[spec.key]=value;
  if(requireValues&&spec.required===true&&!value)missing.push(spec.label);
  display[spec.key]=value?displayValue(value,spec):requireValues?'':'«'+spec.label+'»';
 }
 if(missing.length)fail('أكمل الحقول المطلوبة قبل المعاينة النهائية: '+missing.join('، ')+'؛ صحح بيانات العقد أو المستأجر المرتبطة أو أدخل بيانات المستند.');
 for(const key of ['tenant_name','owner_name','representative_name','receiver_name','accountant_name'])values[key]=safeValue(key,documentFieldCatalog[key]?.label||key);
 for(const [role,flags]of Object.entries(template.presentation?.editor?.signers?.details||{}))for(const part of ['civil_id','nationality'])if(flags[part]){const prefix=role==='owner'&&values.representative_name?'representative':role,key=prefix+'_'+part;values[key]=safeValue(key,documentFieldCatalog[key]?.label||key);}
 // Replace each source token once; no replacement output is scanned again.
 const substitute=text=>text.replace(/\{\{([a-z][a-z0-9_]{1,49})\}\}/g,(_,key)=>display[key]);
 const presentation=validateTemplatePresentation(template.presentation,fields,template.clauses);
 return {title:substitute(template.title||''),fields,values,clauses:template.clauses.map(c=>({title:substitute(c.title),text:substitute(c.text)})),...(presentation?{presentation}:{})};
}

export function rentalDocumentDigestPayload(template,rendered){
 const presentation=validateTemplatePresentation(template?.presentation,template?.fields||[],template?.clauses);
 const signers=resolveDocumentSigners(template?.kind,rendered.values,presentation);
 const value=[rendered.title,template.kind,template.kind_label||'',rendered.clauses.map(clause=>[clause.title,clause.text]),Object.entries(rendered.values).sort(([a],[b])=>a<b?-1:a>b?1:0),signers.map(signer=>[signer.role,signer.label,signer.name])];
 // Old models retain their exact prior digest material. New visual settings
 // participate in verification and cannot change between preview and PDF.
 if(presentation)value.push(presentation);
 return value;
}

function primary(payload){
 const value=payload?.format==='aqari-cloud-state-v1'?payload.snapshot?.values?.aqari_v30:payload?.schema==='aqari-local-snapshot-v1'?payload.values?.aqari_v30:payload;
 if(!value||typeof value!=='object'||Array.isArray(value))fail('تعذرت قراءة بيانات مساحة العمل.');
 return value;
}
const identities=row=>[row?.id,row?.external_ref,row?.externalRef].map(scalar).filter(Boolean);
function matchById(records,id,label,{required=false}={}){
 if(!scalar(id)){if(required)fail('أكمل ربط '+label+' بمعرّفه المحفوظ أولًا.');return null;}
 const found=rows(records).filter(row=>identities(row).includes(scalar(id)));
 if(found.length>1)fail('تعارض معرّفات '+label+'؛ راجع الربط قبل المعاينة.');
 if(!found.length&&required)fail('تعذر العثور على '+label+' المرتبط؛ حدّث البيانات أو صحح الربط.');
 return found[0]||null;
}
function checkId(ref,row,label){if(scalar(ref)&&(!row||!identities(row).includes(scalar(ref))))fail('لا يتطابق ربط '+label+' مع العقد المحدد.');}
const propRef=row=>first(row?.propertyId,row?.property_id,row?.property_ref);
const unitRef=row=>first(row?.unitId,row?.unit_id);
const tenantRef=row=>first(row?.tenantId,row?.tenant_id,row?.tenant_ref);
function checkScope(record,workspaceId){if(record?.workspace_id&&workspaceId&&record.workspace_id!==workspaceId)fail('تغيّرت مساحة العمل؛ أعد فتح المستند.');}

/** Identify the property for lists and filters independently of whether an old
 * tenant profile has been completed. Display names are never join keys.
 * Missing references are visible as unbound; contradictions throw and are
 * reported separately by the grouping helper, never silently reclassified.
 */
export function resolveContractPropertyBinding(contract,sources={}){
 const c=object(contract),missing=reason=>({status:'unbound',propertyId:'',unitId:'',leaseId:'',property:null,unit:null,lease:null,reason});
 const contractIds=[...identities(c),scalar(c.contractId)].filter(Boolean);
 if(!contractIds.length)return missing('السجل لا يحمل معرّف عقد؛ راجع ربط المصدر.');
 const leaseRows=rows(sources.leases).filter(row=>identities(row).some(id=>contractIds.includes(id))||contractIds.includes(scalar(row.snapshot?.id)));
 if(leaseRows.length>1)fail('تعارض معرّفات العقد؛ لا يمكن تحديد عقاره بأمان.');
 const lease=leaseRows[0]||null;
 checkScope(c,sources.workspaceId);checkScope(lease,sources.workspaceId);
 if(lease){
  const known=new Set(identities(lease)),snapshotId=scalar(lease.snapshot?.id),externalIds=[lease.external_ref,lease.externalRef].map(scalar).filter(Boolean);
  if(snapshotId&&externalIds.length&&!known.has(snapshotId))fail('تعارض مرجع العقد المستورد مع السجل الخادمي.');
  if(snapshotId)known.add(snapshotId);
  if(contractIds.some(ref=>!known.has(ref)))fail('تعارض مرجع العقد المستورد مع السجل الخادمي.');
 }
 const unitRefs=[c.unitId,c.unit_id,c.metadata?.unitId,c.metadata?.unit_id,lease?.unitId,lease?.unit_id].map(scalar).filter(Boolean);
 let unit=null;
 for(const ref of unitRefs){
  const found=matchById(sources.units,ref,'الوحدة');
  if(!found)fail('معرّف الوحدة المحفوظ غير موجود في مساحة العمل؛ صحح الربط.');
  if(unit&&scalar(unit.id)!==scalar(found.id))fail('تعارض ربط الوحدة بالعقد.');
  unit=found;
 }
 checkScope(unit,sources.workspaceId);
 const propertyRefs=[c.propertyId,c.property_id,c.property_ref,c.propertyRef,c.metadata?.propertyId,c.metadata?.property_id,c.metadata?.property_ref,lease?.property_id,lease?.property_ref,unit?.property_id,unit?.propertyId].map(scalar).filter(Boolean);
 let property=null;
 for(const ref of propertyRefs){
  const found=matchById(sources.properties,ref,'العقار');
  if(!found)fail('معرّف العقار المحفوظ غير موجود في مساحة العمل؛ صحح الربط.');
  if(property&&scalar(property.id)!==scalar(found.id))fail('تعارض ربط العقار بالعقد.');
  property=found;
 }
 checkScope(property,sources.workspaceId);
 if(own(sources,'tenants')&&lease?.tenant_id){
  const tenant=matchById(sources.tenants,lease.tenant_id,'المستأجر');
  if(!tenant)fail('تعذر تأكيد مستأجر العقد من السجل المرتبط.');
  checkScope(tenant,sources.workspaceId);
  for(const ref of [c.tenantId,c.tenant_id,c.tenant_ref].map(scalar).filter(Boolean))checkId(ref,tenant,'المستأجر');
 }
 if(!property)return missing('العقد غير مربوط بمعرّف عقار محفوظ؛ استكمل ربط المصدر.');
 return {status:'bound',propertyId:scalar(property.id),unitId:scalar(unit?.id),leaseId:scalar(lease?.id),property,unit,lease,reason:''};
}

export function groupRentalContractsByProperty(contracts,sources={}){
 const properties=rows(sources.properties),groups=[],map=new Map(),unbound=[],conflicts=[];
 for(const property of properties){
  const id=scalar(property.id);if(!id)continue;
  checkScope(property,sources.workspaceId);
  if(map.has(id))fail('تكرر معرّف العقار في النتائج؛ حدّث القائمة.');
  const group={propertyId:id,property,contracts:[],count:0};map.set(id,group);groups.push(group);
 }
 for(const contract of rows(contracts)){
  try{
   const binding=resolveContractPropertyBinding(contract,sources);
   if(binding.status!=='bound'){unbound.push({contract,reason:binding.reason});continue;}
   const group=map.get(binding.propertyId);if(!group)fail('العقار المرتبط غير موجود في قائمة مساحة العمل.');
   group.contracts.push(contract);group.count++;
  }catch(error){conflicts.push({contract,reason:error.message});}
 }
 return {groups,unbound,conflicts};
}

export function assertContractProperty(contract,expectedPropertyId,sources={}){
 const expected=matchById(sources.properties,expectedPropertyId,'العقار',{required:true}),binding=resolveContractPropertyBinding(contract,sources);
 if(binding.status!=='bound'||binding.propertyId!==scalar(expected.id))fail('العقد لا يتبع العقار المحدد؛ اختر العقد من ملف العقار الصحيح.');
 return binding;
}

/** Resolve read-only source records by stable identifiers, never display names.
 * Normalized tables must be fetched under the current user's workspace scope.
 * Older contracts obtain missing IDs through aqari_leases.external_ref.
 */
export function resolveRentalDocumentContext(payload,selection={},sources={}){
 const data=primary(payload),contracts=rows(data.contractsV202),leases=rows(sources.leases),profiles=rows(data.tenantProfilesV267),tenants=rows(sources.tenants);
 let lease=matchById(leases,selection.contractId,'العقد'),contract=matchById(contracts,selection.contractId,'العقد');
 if(lease&&!contract)contract=matchById(contracts,first(lease.external_ref,lease.externalRef),'العقد');
 if(contract&&!lease)lease=matchById(leases,contract.id,'العقد');
 if(!contract&&lease?.snapshot&&scalar(lease.snapshot.id)===first(lease.external_ref,lease.externalRef))contract=lease.snapshot;
 if(!contract&&selection.tenantId){
  const selectedTenant=matchById(tenants,selection.tenantId,'المستأجر'),selectedProfile=matchById(profiles,selection.tenantId,'المستأجر')||matchById(profiles,first(selectedTenant?.external_ref,selectedTenant?.externalRef),'المستأجر');
  const ids=new Set([...identities(selectedTenant),...identities(selectedProfile),scalar(selection.tenantId)]);
  const found=contracts.filter(c=>ids.has(tenantRef(c)));
  if(found.length>1)fail('للمستأجر أكثر من عقد؛ اختر رقم العقد المطلوب لتحديد العقار والوحدة.');
  if(found.length===1){contract=found[0];lease=matchById(leases,contract.id,'العقد');}
 }
 if(!contract)fail('اختر عقدًا محفوظًا أو مستأجرًا مرتبطًا بعقد قبل المعاينة.');
 if(selection.contractId&&!identities(contract).includes(scalar(selection.contractId))&&!identities(lease).includes(scalar(selection.contractId)))fail('العقد المحدد غير مطابق للربط.');
 if(lease){checkId(first(lease.external_ref,lease.externalRef),contract,'العقد');checkScope(lease,sources.workspaceId);}
 const ref=tenantRef(contract),linkedTenant=matchById(tenants,tenantRef(lease),'المستأجر')||matchById(tenants,ref,'المستأجر');
 const profile=matchById(profiles,ref,'المستأجر')||matchById(profiles,first(linkedTenant?.external_ref,linkedTenant?.externalRef),'المستأجر');
 if(!ref)fail('العقد غير مرتبط بمعرّف مستأجر؛ صحح ربط العقد أولًا.');
 if(linkedTenant&&!identities(linkedTenant).includes(ref))fail('لا يتطابق مستأجر العقد مع السجل المرتبط.');
 const tenant=profile||object(linkedTenant?.profile);
 if(!Object.keys(tenant).length)fail('تعذر قراءة ملف المستأجر المرتبط؛ استكمل الربط أولًا.');
 if(tenantRef(lease))checkId(tenantRef(lease),linkedTenant,'المستأجر');
 if(selection.tenantId&&!identities(tenant).concat(identities(linkedTenant)).includes(scalar(selection.tenantId)))fail('المستأجر المختار لا يطابق مستأجر العقد.');
 checkScope(linkedTenant,sources.workspaceId);
 const unitId=first(unitRef(lease),unitRef(contract));
 const unit=matchById(sources.units,unitId,'الوحدة',{required:true});
 for(const reference of [contract.unitId,contract.unit_id,lease?.unitId,lease?.unit_id])checkId(reference,unit,'الوحدة');
 checkScope(unit,sources.workspaceId);
 const propertyId=first(propRef(unit),propRef(lease),propRef(contract));
 const property=matchById(sources.properties,propertyId,'العقار',{required:true});
 for(const source of [contract,lease,unit])for(const key of ['propertyId','property_id','property_ref'])checkId(source?.[key],property,'العقار');
 checkScope(property,sources.workspaceId);
 const masters=rows(sources.propertyMasters).map(row=>row.property?{...row.property,workspace_id:row.workspace_id||row.property.workspace_id}:row);
 const master=matchById(masters,property.id,'ملف العقار')||matchById(masters,first(property.external_ref,property.externalRef),'ملف العقار');
 checkScope(master,sources.workspaceId);
 const propertyInfo={...object(property.metadata),...property};
 for(const [key,value]of Object.entries(object(master)))if(value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length))propertyInfo[key]=value;
 const owners=rows(propertyInfo.owners);
 const explicitOwnerId=first(contract.ownerId,contract.owner_id,propertyInfo.ownerId,propertyInfo.owner_id);
 let owner=explicitOwnerId?matchById(owners,explicitOwnerId,'مالك العقار',{required:true}):owners.length===1?owners[0]:null;
 // Multiple owners cannot silently become one contracting owner or an agent.
 if(!owner&&!owners.length)owner=object(propertyInfo.owner);
 const representative=object(contract.representative||propertyInfo.representative||propertyInfo.agent);
 const values={
  contract_no:first(contract.contract_no,contract.contractNo,lease?.contract_no),tenant_name:first(tenant.nameAr,tenant.name_ar,linkedTenant?.full_name),tenant_name_en:first(tenant.nameEn,tenant.name_en),tenant_civil_id:first(tenant.civilId,tenant.civil_id,linkedTenant?.civil_id),tenant_nationality:first(tenant.nationality),tenant_nationality_en:first(tenant.nationalityEn,tenant.nationality_en),tenant_passport_no:first(tenant.passportNo,tenant.passport_no),tenant_phone:first(tenant.phone,linkedTenant?.phone),tenant_email:first(tenant.email,linkedTenant?.email),
  owner_name:first(owner?.nameAr,owner?.name,owners.length<2?propertyInfo.owner_name:'',owners.length<2?propertyInfo.ownerName:'',owners.length<2?propertyInfo.source_owner:'',owners.length<2?contract.owner_name:''),owner_name_en:first(owner?.nameEn,owner?.name_en),owner_civil_id:first(owner?.civilId,owner?.civil_id),owner_nationality:first(owner?.nationality),representative_name:first(representative.nameAr,representative.name,contract.representative_name),representative_civil_id:first(representative.civilId,representative.civil_id),representative_nationality:first(representative.nationality),power_of_attorney_no:first(representative.powerOfAttorneyNo,representative.power_of_attorney_no),power_of_attorney_year:first(representative.powerOfAttorneyYear,representative.power_of_attorney_year),
  property_name:first(propertyInfo.name,contract.property),property_address:first(propertyInfo.address,propertyInfo.location,propertyInfo.source_address,contract.propertyAddress),property_area:first(propertyInfo.area,propertyInfo.region),property_block:first(propertyInfo.block),property_street:first(propertyInfo.street),property_building_no:first(propertyInfo.buildingNo,propertyInfo.building_no),property_automatic_no:first(propertyInfo.propertyAutomaticRef,propertyInfo.automaticRef,propertyInfo.automatic_ref),unit_no:first(unit.unit_no,unit.unitNo,contract.unit),unit_automatic_no:first(unit.automaticRef,unit.automatic_ref,unit.metadata?.automaticRef,contract.automaticUnitRef),floor_no:first(unit.floor,unit.metadata?.floor,contract.floor),
  start_date:first(contract.start_date,contract.startDate,lease?.start_date),end_date:first(contract.end_date,contract.endDate,lease?.end_date),contract_date:first(contract.writtenOn,contract.contract_date),monthly_rent:first(contract.contractRent,contract.monthly_rent,contract.rent,lease?.monthly_rent),deposit_amount:first(contract.deposit),advance_amount:first(contract.advance),cleaning_fee:first(contract.cleaningFee),accountant_name:first(contract.accountant)
 };
 let receipt=null;
 if(selection.receiptId){
  const stored=matchById(data.rentReceiptsV267,selection.receiptId,'وصل الإيجار'),payments=rows(sources.receipts).filter(row=>identities(row).includes(scalar(selection.receiptId))||scalar(row.reference)===scalar(selection.receiptId));
  if(payments.length>1)fail('رقم الوصل مكرر؛ راجع سجل التحصيل.');
  const payment=payments[0]||null;
  const ledger=rows(data.rentLedgerV202).filter(row=>scalar(row.receiptNo)===scalar(selection.receiptId));
  if(ledger.length>1)fail('رقم الوصل مكرر؛ راجع سجل التحصيل.');
  const record=ledger[0]||object(payment?.record);
  if(!stored&&!payment)fail('اختر وصلًا محفوظًا مرتبطًا بالعقد.');
  const receiptContract=first(stored?.contract?.id,record.contractId,stored?.contractId,payment?.receipt?.contract?.id);
  if(!receiptContract&&!payment?.lease_id)fail('الوصل غير مرتبط بمعرّف عقد محفوظ.');
  if(receiptContract&&!identities(contract).concat(identities(lease)).includes(receiptContract))fail('الوصل لا يخص العقد المختار.');
  if(payment?.lease_id)checkId(payment.lease_id,lease,'عقد الوصل');
  for(const reference of [stored?.contract?.id,record.contractId,stored?.contractId,payment?.receipt?.contract?.id])if(scalar(reference)&&!identities(contract).concat(identities(lease)).includes(scalar(reference)))fail('تعارض ربط الوصل بالعقد.');
  const statuses=[payment?.status,record.status,stored?.status,stored?.record?.[3],payment?.receipt?.record?.[3]].map(scalar).filter(Boolean);
  if(statuses.some(status=>['cancelled','canceled','void','ملغى','ملغي'].includes(status)))fail('الوصل ملغى؛ لا يمكن إنشاء معاينة تحصيل معتمدة منه.');
  if(!statuses.length||statuses.some(status=>!['paid','partial','مدفوع','جزئي'].includes(status)))fail('لم يتأكد سداد الوصل المحفوظ؛ راجع حالة التحصيل أولًا.');
  checkScope(payment,sources.workspaceId);
  const row=stored?.record||payment?.receipt?.record||[];
  const amounts=[record.paid,payment?.amount,row[2]].filter(value=>scalar(value)!=='').map(Number);
  if(!amounts.length||amounts.some(value=>!Number.isFinite(value)||value<=0)||new Set(amounts).size>1)fail('مبلغ الوصل لا يطابق التحصيل المحفوظ؛ راجع سجل التحصيل.');
  Object.assign(values,{receipt_no:first(stored?.id,payment?.reference,record.receiptNo),receipt_date:first(record.paidAt,payment?.paid_at,row[5]),rent_period:first(record.period,payment?.period?String(payment.period).slice(0,7):'',row[8]),amount:first(record.paid,payment?.amount,row[2]),payment_method:first(record.method,payment?.payment_method,row[9]),payment_reference:first(record.transactionNo,stored?.transactionNo,payment?.receipt?.transactionNo,record.paymentReference,stored?.paymentReference),receiver_name:first(stored?.receiverName,record.receiverName),accountant_name:first(stored?.accountant,record.accountant,payment?.receipt?.accountant,values.accountant_name)});
  receipt=stored||payment;
 }
 return {contract,tenant,property:propertyInfo,unit,receipt,values:normalizeDocumentValues(values),links:{contractId:scalar(contract.id),leaseId:scalar(lease?.id),tenantId:first(tenant.id,ref),propertyId:scalar(property.id),unitId:scalar(unit.id),receiptId:scalar(selection.receiptId)}};
}
