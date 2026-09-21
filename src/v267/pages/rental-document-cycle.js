import {node,field} from '../components/dialog.js';
import {createPage} from '../components/page.js';
import {t} from '../components/locale.js';
import {validTemplate} from '../components/rental-templates.js';
import {documentTemplateBlueprints,documentFieldCatalog,linkedDocumentFieldKeys,fieldValue,resolveRentalDocumentContext,renderDocumentTemplate,rentalDocumentDigestPayload,assertContractProperty} from '../domain/rental-document-cycle.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const key=value=>String(value??'');
const linkedKeys=new Set(linkedDocumentFieldKeys);
const option=(value,label)=>Object.assign(node('option',label),{value:key(value)});
const primary=payload=>payload?.format==='aqari-cloud-state-v1'?payload.snapshot?.values?.aqari_v30:payload?.schema==='aqari-local-snapshot-v1'?payload.values?.aqari_v30:payload;
const nonLeaseKinds=new Set(['apartment_handover','rent_receipt','eviction','owner_final_clearance']);
const templateMatches=(template,kind)=>kind==='rental_agreement'?!nonLeaseKinds.has(template.kind):template.kind===kind;
const tenantRef=contract=>key(contract?.tenantId||contract?.tenant_id||contract?.tenant_ref);
const identities=record=>[record?.id,record?.external_ref,record?.externalRef].filter(x=>x!=null).map(key);
const fingerprint=({rendered,template})=>JSON.stringify(rentalDocumentDigestPayload(template,rendered));
const previewTemplate=template=>({id:template.id,kind:template.kind,...(template.kind_label?{kind_label:template.kind_label}:{}),title:template.title,...(template.family_id?{family_id:template.family_id}:{}),...(template.presentation?{presentation:copy(template.presentation)}:{}),fields:(template.fields||[]).map(({key,label,type='text',required=false})=>({key,label,type,required})),clauses:template.clauses.map(({title,text})=>({title,text}))});
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}

// Page opening and preview never write. Issuance requires the owner's explicit
// review of the exact PDF, confirmation and reason; the server archives it.
export async function mountRentalDocumentCycle(d,target,{propertyId=null,contractId=null,onBack}={}){
 if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
 target.className='aq267-template-studio';
 let payload=null,data=null,templates=[],tables=null,context=null,fields=new Map(),reviewed=null,epoch=0,pdfUrl=null,pdfBlob=null,pendingIssue=null,issuedId=null,selectedPropertyId=propertyId?key(propertyId):null;const archiveUrls=new Set();
 const kind=node('select'),tenant=node('select'),contract=node('select'),template=node('select'),receipt=node('select');
 kind.name='document_kind';tenant.name='tenant_id';contract.name='contract_id';template.name='template_id';receipt.name='receipt_id';
 for(const spec of documentTemplateBlueprints)kind.append(option(spec.kind,t(spec.label)));
 kind.value='rental_agreement';
 const header=node('header'),heading=node('div'),intro=node('p',t('اختر العقد لربط المستند بنفس العقار والوحدة والمستأجر. هذه معاينة للمراجعة؛ لا تعتمد نموذجًا أو مستندًا ولا تسجل دفعة.'));
 const propertyHeading=node('h3',t('دورة مستندات الإيجار'));heading.append(propertyHeading,intro);header.append(heading);
 if(onBack){const back=node('button',t('العودة'));back.type='button';back.onclick=()=>{d.session.check();d.close();return onBack();};header.prepend(back);}
 const form=node('form'),selectors=node('section'),editor=node('section'),preview=node('section'),note=node('p'),binding=node('p'),actions=node('div'),receiptField=field(t('الوصل المحفوظ المرتبط بالعقد'),receipt);
 form.className='aq267-template-form';selectors.className='aq267-template-identity';preview.className='aq267-template-preview';actions.className='aq267-template-actions';receiptField.hidden=true;
 selectors.append(field(t('نوع المستند'),kind),field(t('المستأجر'),tenant),field(t('العقد'),contract),field(t('النموذج المعتمد'),template),receiptField);
 const show=node('button',t('معاينة نهائية')),pdf=node('button',t('فتح وتحميل PDF')),manage=node('button',t('فتح إدارة النماذج')),archive=node('section'),issueSection=node('section'),issue=node('button',t('إصدار المستند وحفظ نسخته النهائية')),approval=node('input'),issueReason=node('textarea');
 issue.type='button';approval.type='checkbox';approval.name='confirm_document_issue';issueReason.name='document_issue_reason';issueReason.minLength=6;issueReason.maxLength=500;issueSection.hidden=true;issueSection.className='aq267-template-approval';archive.className='aq267-issued-document-archive';
 issueSection.append(node('h4',t('إصدار نسخة نهائية محفوظة')),field(t('راجعت PDF وأطلب إصدار هذه النسخة وحفظها كما هي'),approval),field(t('سبب الإصدار'),issueReason),issue);
 const archiveButton=node('button',t('عرض مستندات العقار والعقد الصادرة'));archiveButton.type='button';archiveButton.onclick=()=>run(loadArchive);
 for(const button of [show,pdf,manage])button.type='button';
 actions.append(show,pdf,manage);form.append(selectors,note,binding,editor,actions,preview,issueSection,archiveButton,archive);target.replaceChildren(header,form);
 form.onsubmit=event=>event.preventDefault();
 function resetPreview(){reviewed=null;pdfBlob=null;preview.replaceChildren();if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}pdf.disabled=true;approval.checked=false;issueReason.value='';issueSection.hidden=true;issuedId=null;}
 function clearDocument(){if(pendingIssue)throw Error('تحقق من نتيجة الإصدار السابق قبل تغيير المستند.');epoch++;resetPreview();fields.clear();editor.replaceChildren();archive.replaceChildren();context=null;binding.textContent='';}
 function check(){d.session.check();if(d.closed)throw Error('أغلقت الصفحة؛ افتح المستند من جديد.');}
 function scoped(result,withUser=true){check();if(result?.workspace_id!==d.session.bound.workspace||(withUser&&result?.user_id!==d.session.bound.user))throw Error('تعذر تأكيد مساحة العمل والمستخدم للمستند.');return result;}
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const selectedTemplate=()=>templates.find(row=>row.id===template.value&&templateMatches(row,kind.value))||null;
 function selectedContract(){return (data?.contractsV202||[]).find(row=>key(row.id)===contract.value)||null;}
 const contractsForTenant=()=> (data?.contractsV202||[]).filter(row=>!tenant.value||tenantRef(row)===tenant.value);
 function drawContracts(selected=''){
  const rows=contractsForTenant();contract.replaceChildren(option('',t(rows.length>1?'اختر العقد المطلوب — يوجد أكثر من عقد':'اختر العقد')),...rows.map(row=>option(row.id,[row.contract_no||row.id,row.tenant,row.property,row.unit].filter(Boolean).join(' · '))));contract.value=selected;
 }
 function drawTemplates(){
  const matching=templates.filter(row=>templateMatches(row,kind.value));
  template.replaceChildren(option('',t('اختر النموذج المعتمد')),...matching.map(row=>option(row.id,`${row.title} · ${t('الإصدار')} ${row.version}`)));template.value='';
  template.disabled=matching.length===0;note.textContent=t(matching.length?'اختر نسخة النموذج التي اعتمدتها ثم راجع البيانات قبل PDF.':'لم تعتمد نموذجًا لهذا النوع بعد. أدخل نصك الأصلي وراجعه في إدارة النماذج؛ هذه الصفحة لا تنشئ نموذجًا تلقائيًا.');
 }
 function controls(){const locked=!!pendingIssue||!!issuedId;show.disabled=locked||!selectedTemplate()||!context||(kind.value==='rent_receipt'&&!receipt.value);pdf.disabled=!reviewed||!pdfBlob;issue.disabled=!!issuedId||!reviewed||!pdfBlob||!approval.checked||issueReason.value.trim().length<6;for(const control of [kind,tenant,contract,receipt])control.disabled=locked;template.disabled=locked||!templates.some(row=>templateMatches(row,kind.value));for(const [name,control]of fields)control.readOnly=locked||linkedKeys.has(name);manage.disabled=locked;}
 async function rows(table,columns,column,value){
  const result=await d.session.request(d.session.client.from(table).select(columns).eq('workspace_id',d.session.bound.workspace).eq(column,value).limit(2));check();
  if(!Array.isArray(result)||result.some(row=>row.workspace_id!==d.session.bound.workspace)||result.length!==1)throw Error('تعذر تأكيد السجل المرتبط؛ راجع ربط العقد والمستأجر والعقار والوحدة.');
  return result;
 }
 async function list(factory){
  const result=[];for(let start=0;start<100000;start+=500){const batch=await d.session.request(factory().order('id').range(start,start+499));check();if(!Array.isArray(batch)||batch.some(row=>row.workspace_id!==d.session.bound.workspace))throw Error('تعذر تأكيد نطاق سجلات العقار.');result.push(...batch);if(batch.length<500)return result;}
  throw Error('تعذر تأكيد اكتمال قائمة عقود العقار.');
 }
 async function loadPropertyScope(){
  if(contractId){
   const [lease]=await rows('aqari_leases','id,workspace_id,external_ref,tenant_id,unit_id','external_ref',key(contractId));
   const [unit]=await rows('aqari_units','id,workspace_id,property_id,unit_no','id',lease.unit_id);
   if(selectedPropertyId&&key(unit.property_id)!==selectedPropertyId)throw Error('العقد لا يخص العقار المحدد.');selectedPropertyId=key(unit.property_id);
  }
  if(!selectedPropertyId)throw Error('اختر العقار من صفحة العقود أولًا.');
  const [property]=await rows('aqari_properties','id,workspace_id,name,external_ref,metadata','id',selectedPropertyId);
  const [propertyUnits,propertyLeases]=await Promise.all([
   list(()=>d.session.client.from('aqari_units').select('id,workspace_id,property_id,unit_no').eq('workspace_id',d.session.bound.workspace).eq('property_id',selectedPropertyId)),
   list(()=>d.session.client.from('aqari_leases').select('id,workspace_id,external_ref,tenant_id,unit_id,aqari_units!inner(property_id)').eq('workspace_id',d.session.bound.workspace).eq('aqari_units.property_id',selectedPropertyId))
  ]);
  const tenantIds=[...new Set(propertyLeases.map(row=>row.tenant_id))],propertyTenants=[];
  for(let start=0;start<tenantIds.length;start+=100){const ids=tenantIds.slice(start,start+100);propertyTenants.push(...await list(()=>d.session.client.from('aqari_tenants').select('id,workspace_id,external_ref').eq('workspace_id',d.session.bound.workspace).in('id',ids)));}
  const source={workspaceId:d.session.bound.workspace,properties:[property],units:propertyUnits,leases:propertyLeases,tenants:propertyTenants},refs=new Set(propertyLeases.flatMap(row=>identities(row))),allowed=[];
  let conflicts=0;
  for(const c of data.contractsV202){if(!refs.has(key(c.id)))continue;try{assertContractProperty(c,selectedPropertyId,source);allowed.push(c);}catch{conflicts++;}}
  if(contractId&&!allowed.some(c=>key(c.id)===key(contractId)))throw Error('تعذر تأكيد ربط العقد بالعقار والمستأجر الصحيحين.');
  data={...data,contractsV202:allowed};propertyHeading.textContent=t('مستندات الإيجار — ')+property.name;
  if(conflicts)intro.textContent=t('توجد سجلات تحتاج تصحيح معرّفات الربط قبل استخدامها: ')+conflicts;
 }
 async function readBindings(){
  const c=selectedContract();if(!c){tables=null;return;}
  const leases=await rows('aqari_leases','id,workspace_id,external_ref,tenant_id,unit_id,snapshot,start_date,end_date,monthly_rent','external_ref',key(c.id));
  const lease=leases[0];
  const [units,tenants]=await Promise.all([
   rows('aqari_units','id,workspace_id,property_id,unit_no','id',lease.unit_id),
   rows('aqari_tenants','id,workspace_id,external_ref,full_name,civil_id,phone,email,profile','id',lease.tenant_id)
  ]);
  const unit=units[0];if(key(unit.property_id)!==selectedPropertyId)throw Error('العقد أو الوحدة لا يخصان العقار المحدد.');
  const [properties,master]=await Promise.all([
   rows('aqari_properties','id,workspace_id,name,external_ref,metadata','id',unit.property_id),
   rpc('aqari_property_contract_context',{p_workspace_id:d.session.bound.workspace,p_property_id:unit.property_id,p_unit_id:unit.id})
  ]);
  scoped(master);if(master.property?.id!==unit.property_id||master.unit?.id!==unit.id||master.unit?.propertyId!==unit.property_id)throw Error('تعذر تأكيد ملف العقار والوحدة المرتبطين.');
  tables={workspaceId:d.session.bound.workspace,leases,tenants,properties,units:[{...unit,...master.unit,workspace_id:d.session.bound.workspace}],propertyMasters:[master],receipts:[]};
 }
 async function loadReceiptOptions(){
  receipt.replaceChildren(option('',t('اختر وصلًا محفوظًا')));receipt.value='';receiptField.hidden=kind.value!=='rent_receipt';
  if(kind.value!=='rent_receipt'||!tables)return;
  const result=scoped(await rpc('aqari_official_document_context',{p_workspace_id:d.session.bound.workspace,p_kind:'rent_receipt',p_entity_id:tables.leases[0].id,p_source_id:null,p_fields:{}}));
  if(result.kind!=='rent_receipt'||result.entity_id!==tables.leases[0].id||!Array.isArray(result.sources))throw Error('تعذر تأكيد الوصولات المرتبطة بالعقد.');
  receipt.append(...result.sources.map(row=>option(row.id,row.label)));receipt.disabled=result.sources.length===0;
  if(!result.sources.length)note.textContent=t('لا يوجد وصل دفع محفوظ ومؤكد لهذا العقد. المعاينة لا تسجل دفعة أو تنشئ رقم وصل.');
 }
 function resolve(){
  if(!tables||!contract.value)return null;
  const resolved=resolveRentalDocumentContext(payload,{contractId:contract.value,...(tenant.value?{tenantId:tenant.value}:{}),...(receipt.value?{receiptId:receipt.value}:{})},tables);if(key(resolved.links.propertyId)!==selectedPropertyId)throw Error('المستند لا يخص العقار المحدد.');return resolved;
 }
 function drawFields(){
  resetPreview();fields.clear();editor.replaceChildren();context=resolve();
  if(context)binding.textContent=[context.values.property_name,context.values.unit_no,context.values.tenant_name,context.values.contract_no].filter(Boolean).join(' · ');
  const selected=selectedTemplate();if(!context||!selected){controls();return;}
  const specs=[...selected.fields||[]],blueprint=documentTemplateBlueprints.find(row=>row.kind===kind.value);
  for(const signer of blueprint?.signers||[])if(!specs.some(spec=>spec.key===signer.nameKey))specs.push({...documentFieldCatalog[signer.nameKey],required:false});
  editor.append(node('h4',t('بيانات المستند')),node('p',t('البيانات المرتبطة للقراءة فقط. إذا نقصت معلومة من العقد أو ملف المستأجر أو العقار، أكملها في سجلها الأصلي ثم أعد فتح المعاينة.')));
  for(const spec of specs){
   const control=node('input'),locked=linkedKeys.has(spec.key);
   control.type=spec.type==='date'?'date':'text';control.name=spec.key;control.maxLength=2000;control.required=spec.required===true;control.readOnly=locked;control.autocomplete='off';
   if(['money','number'].includes(spec.type))control.inputMode='decimal';
   control.value=fieldValue(context.values,spec.key);control.placeholder=t(locked?'غير موجود في السجل المرتبط':'أدخل بيانات هذا المستند');
   control.oninput=()=>{resetPreview();controls();};fields.set(spec.key,control);
   editor.append(field(t(spec.label)+(locked?t(' — من السجل المحفوظ'):''),control));
  }
  controls();
 }
 async function changeContract(){
  clearDocument();tables=null;receipt.value='';controls();
  const current=epoch,c=selectedContract();if(!c){await loadReceiptOptions();return;}
  if(!tenant.value){tenant.value=tenantRef(c);drawContracts(key(c.id));}
  await readBindings();if(current!==epoch||d.closed)return;
  await loadReceiptOptions();if(current!==epoch||d.closed)return;drawFields();
 }
 const run=task=>d.run(async()=>{try{return await task();}finally{if(!d.closed)controls();}});
 tenant.onchange=()=>run(async()=>{clearDocument();tables=null;receipt.value='';const matches=contractsForTenant();drawContracts(matches.length===1?key(matches[0].id):'');await changeContract();});
 contract.onchange=()=>run(changeContract);
 kind.onchange=()=>run(async()=>{clearDocument();drawTemplates();await loadReceiptOptions();drawFields();});
 template.onchange=()=>run(()=>drawFields());
 receipt.onchange=()=>run(async()=>{clearDocument();if(tables)tables.receipts=receipt.value?await rows('aqari_rent_payments','id,workspace_id,lease_id,reference,paid_at,period,amount,payment_method,status,record,receipt','id',receipt.value):[];drawFields();});
 manage.onclick=()=>run(async()=>{const module=await import('./contract-templates.js');check();d.close();return module.openContractTemplates({propertyId:selectedPropertyId,onBack:()=>openRentalDocumentCycle({propertyId:selectedPropertyId,contractId:contract.value||null,onBack})});});
 function documentValues(){return Object.fromEntries([...fields].filter(([name])=>!linkedKeys.has(name)).map(([name,control])=>[name,control.value]));}
 function candidate(){
  check();const selected=selectedTemplate();if(!context||!selected)throw Error('اختر العقد والنموذج المعتمد أولًا.');
  if(kind.value==='rent_receipt'&&!receipt.value)throw Error('اختر وصلًا محفوظًا مرتبطًا بالعقد أولًا.');
  const values={...documentValues(),...context.values},rendered=renderDocumentTemplate(selected,values,{requireValues:true});
  return {template:previewTemplate(copy(selected)),document:{propertyId:selectedPropertyId,contractId:contract.value,...(tenant.value?{tenantId:tenant.value}:{}),...(receipt.value?{receiptId:receipt.value}:{}),values:documentValues()},rendered,values,epoch};
 }
 async function authenticatedPdf(url,body,{expectedDigest=null,expectedPdfHash=null,archived=false}={}){
  return d.session.operation(async signal=>{
   const auth=await d.session.client.auth.getSession();check();const session=auth?.data?.session;
   if(!session?.access_token||session.user?.id!==d.session.bound.user)throw Error('تغيرت جلسة الدخول؛ أعد فتح المستند.');
   const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),signal,cache:'no-store',credentials:'same-origin',redirect:'error'});
   check();if(response.status===409)throw Error('تغيرت البيانات المحفوظة بعد المعاينة؛ أعد فتح المستند ومعاينته.');
   if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw Error(archived?'تعذر تأكيد إصدار المستند أو استرجاع نسخته؛ أعد التحقق بنفس الطلب.':'تعذر إنشاء PDF للمعاينة.');
   if(expectedDigest&&response.headers.get('X-Aqari-Document-SHA256')!==expectedDigest)throw Error('لم يطابق PDF بيانات المعاينة. أعد فتح المستند.');
   const blob=await response.blob();check();if(blob.size<5||blob.size>10485760||await blob.slice(0,5).text()!=='%PDF-')throw Error('ملف المعاينة ليس PDF صالحًا.');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');check();
   if(expectedPdfHash&&hash!==expectedPdfHash||archived&&response.headers.get('X-Aqari-Archived-SHA256')!==hash)throw Error('لم تتطابق بصمة PDF المحفوظ مع النسخة التي راجعتها.');
   const final=await d.session.client.auth.getSession();check();if(final?.data?.session?.user?.id!==d.session.bound.user||!final?.data?.session?.access_token)throw Error('تغيرت جلسة الدخول؛ لم يتم تنزيل الملف.');
   return {blob,hash,documentId:response.headers.get('X-Aqari-Document-Id')};
  });
 }
 function displayPdf(target,url,title,filename){
  const frame=node('iframe');frame.className='aq267-document-pdf';frame.title=title;frame.src=url;frame.setAttribute('aria-label',title);
  const open=node('a',t('فتح PDF')),download=node('a',t('تنزيل PDF'));open.href=download.href=url;open.target='_blank';open.rel=download.rel='noopener';download.download=filename;target.append(frame,open,download);return download;
 }
 show.onclick=()=>run(async()=>{
  if(pendingIssue||issuedId)throw Error('النسخة الصادرة ثابتة؛ افتح دورة جديدة لإنشاء مستند آخر.');
  resetPreview();const snapshot=candidate(),hash=await digest(fingerprint(snapshot));check();if(snapshot.epoch!==epoch)return;
  const prepared=await authenticatedPdf('/api/contract-template-preview',{workspaceId:d.session.bound.workspace,template:snapshot.template,document:{...snapshot.document,previewDigest:hash}},{expectedDigest:hash});check();if(snapshot.epoch!==epoch)return;
  pdfBlob=prepared.blob;pdfUrl=URL.createObjectURL(pdfBlob);reviewed={...snapshot,digest:hash,pdfHash:prepared.hash,leaseId:context.links.leaseId};
  preview.append(node('h3',snapshot.rendered.title||snapshot.template.title),node('p',t('معاينة PDF الفعلية — الملف المعروض هو نفسه ملف التنزيل')));displayPdf(preview,pdfUrl,t('معاينة المستند بصيغة PDF — A4'),'rental-document-'+kind.value+'-preview.pdf');
  const text=node('details');text.append(node('summary',t('قراءة نص المستند')));for(const clause of snapshot.rendered.clauses){const article=node('article');article.append(node('h4',clause.title),node('p',clause.text));text.append(article);}preview.append(text);
  issueSection.hidden=false;controls();d.status.textContent=t('PDF جاهز للمراجعة. لم يُصدر المستند؛ الإصدار يحتاج اختيارك الصريح أدناه.');
 });
 pdf.onclick=()=>run(async()=>{
  if(!reviewed||!pdfBlob||!pdfUrl)throw Error('اعرض المعاينة النهائية بعد آخر تعديل أولًا.');
  if(fingerprint(candidate())!==fingerprint(reviewed)){resetPreview();throw Error('تغيرت بيانات المستند؛ أعد المعاينة النهائية.');}
  const download=node('a');download.href=pdfUrl;download.download='rental-document-'+kind.value+(issuedId?'-issued':'-preview')+'.pdf';download.rel='noopener';download.click();
  d.status.textContent=t('نُزّل نفس PDF المعروض دون تغيير.');
 });
 approval.onchange=issueReason.oninput=controls;
 issue.onclick=()=>run(async()=>{
  if(issuedId)throw Error('المستند صادر ومحفوظ؛ افتحه من الأرشيف.');
  if(!reviewed||!pdfBlob||!approval.checked||issueReason.value.trim().length<6)throw Error('راجع PDF وأكد الإصدار وأدخل سببه.');
  if(fingerprint(candidate())!==fingerprint(reviewed))throw Error('تغيرت بيانات المستند؛ أعد المعاينة قبل الإصدار.');
  pendingIssue||={workspaceId:d.session.bound.workspace,requestId:crypto.randomUUID(),templateId:reviewed.template.id,leaseId:reviewed.leaseId,propertyId:selectedPropertyId,...(reviewed.document.receiptId?{receiptId:reviewed.document.receiptId}:{}),values:copy(reviewed.document.values),previewDigest:reviewed.digest,reviewedPdfSha256:reviewed.pdfHash,approved:true,reason:issueReason.value.trim()};controls();
  const result=await authenticatedPdf('/api/rental-document',pendingIssue,{expectedDigest:reviewed.digest,expectedPdfHash:reviewed.pdfHash,archived:true});check();
  if(!result.documentId)throw Error('لم يتأكد رقم المستند الصادر؛ أعد التحقق بنفس الطلب.');
  issuedId=result.documentId;pendingIssue=null;issueSection.hidden=true;controls();await loadArchive();d.status.textContent=t('صدر المستند بطلبك وحُفظت نسخته النهائية ثابتة في أرشيف العقار والعقد.');
 });
 async function loadArchive(){
  const result=scoped(await rpc('aqari_rental_document_archive',{p_workspace_id:d.session.bound.workspace,p_action:'list',p_data:{property_id:selectedPropertyId,...(context?.links.leaseId?{lease_id:context.links.leaseId}:{})}}));
  if(!Array.isArray(result.items)||result.items.some(item=>key(item.property_id)!==selectedPropertyId||context?.links.leaseId&&item.lease_id!==context.links.leaseId))throw Error('تعذر تأكيد نطاق أرشيف العقار والعقد.');
  for(const url of archiveUrls)URL.revokeObjectURL(url);archiveUrls.clear();archive.replaceChildren(node('h3',t('النسخ النهائية الصادرة — للقراءة فقط')));
  if(!result.items.length)archive.append(node('p',t('لا توجد مستندات صادرة في هذا النطاق.')));
  for(const item of result.items){const card=node('article'),open=node('button',t('عرض النسخة المحفوظة')),output=node('section');open.type='button';card.append(node('h4',item.title),node('p',t('إصدار النموذج: ')+item.template_version+' · '+item.issued_at),open,output);archive.append(card);
   open.onclick=()=>run(async()=>{const result=await authenticatedPdf('/api/rental-document',{action:'get',workspaceId:d.session.bound.workspace,documentId:item.id,propertyId:selectedPropertyId},{expectedPdfHash:item.pdf_sha256,archived:true});check();if(result.documentId!==item.id)throw Error('نسخة الأرشيف لا تطابق المستند المطلوب.');const url=URL.createObjectURL(result.blob);archiveUrls.add(url);output.replaceChildren();displayPdf(output,url,t('النسخة النهائية المحفوظة'),'rental-document-'+item.id+'.pdf');});
  }
 }
 d.onDispose(()=>{epoch++;resetPreview();for(const url of archiveUrls)URL.revokeObjectURL(url);archiveUrls.clear();fields.clear();pendingIssue=null;payload=data=tables=context=null;templates=[];});
 const [saved,templateContext]=await Promise.all([
  rpc('aqari_read_state_v267',{p_workspace_id:d.session.bound.workspace}),
  rpc('aqari_rental_templates',{p_workspace_id:d.session.bound.workspace,p_action:'context',p_data:{}})
 ]);
 scoped(saved,false);scoped(templateContext);
 if(templateContext.can_publish!==true||!Array.isArray(templateContext.items)||!templateContext.items.every(validTemplate))throw Error('تعذر تأكيد صلاحية المدير والنماذج المعتمدة.');
 payload=saved.payload;data=primary(payload);if(!data||!Array.isArray(data.contractsV202))throw Error('تعذر قراءة العقود المحفوظة.');templates=templateContext.items;
 await loadPropertyScope();
 const tenantMap=new Map();for(const c of data.contractsV202){const id=tenantRef(c);if(!id)continue;const profile=(data.tenantProfilesV267||[]).find(row=>identities(row).includes(id));tenantMap.set(id,profile?.nameAr||profile?.nameEn||c.tenant||id);}
 tenant.replaceChildren(option('',t('كل المستأجرين')),...[...tenantMap].map(([id,label])=>option(id,label)));tenant.value='';
 drawContracts(contractId?key(contractId):'');drawTemplates();controls();
 if(contractId){if(!selectedContract())throw Error('العقد المحدد غير موجود في مساحة العمل.');await changeContract();}
 return {refresh:changeContract};
}

export function openRentalDocumentCycle(options={}){
 if(!options.propertyId&&!options.contractId)return import('./rental-contracts.js').then(module=>module.openRentalContracts());
 const d=createPage(t('دورة مستندات الإيجار'));if(!d)return false;
 d.el.classList.add('aq267-contract-template-dialog');
 if(!document.getElementById('aq267-contract-template-css')){const css=node('link');css.id='aq267-contract-template-css';css.rel='stylesheet';css.href='/src/v267/styles/contract-template-studio.css?release=V267';document.head.append(css);}
 d.run(()=>mountRentalDocumentCycle(d,d.body,options));return true;
}
