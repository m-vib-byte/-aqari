import {guardPageImport} from '../components/navigation-import.js';
import {t as translateStatic} from '../components/locale.js';
import '../../../v267-rental-records.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {createVerifiedUpload} from '../components/verified-upload.js';
import {validateDocument,kuwaitTime,currentMonth} from '../domain/payroll.js';
import {leaseEndFromMonths} from '../domain/lease-dates.js';
import {loadLeaseRenewal,renewalSummary} from '../components/lease-renewal.js';
import {mountRentalTemplatePicker,mountRentalTemplateManager,templateForContract,requireContractIdentity} from '../components/rental-templates.js';
const states={draft:'مسودة',ready:'جاهز للمراجعة',approved:'معتمد',signing:'بانتظار التوقيع',signed:'موقّع',cancelled:'ملغى',expired:'منتهي'};
const input=(type,value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
async function openContractExecutionDialog(d,id,onDone){
 const module=await guardPageImport(()=>import('./contract-execution.js'));
 d.session.check();
 if(typeof module.openContractExecution!=='function')throw Error('تعذر فتح اعتماد تسوية الإبرام.');
 d.close();
 return module.openContractExecution(id,{onDone});
}
function contractSearchText(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[أإآ]/g,'ا').replace(/[\u064b-\u065f\u0670ـ]/g,'');}
function matchesContract(c,query,profiles){
 const profile=profiles.find(p=>String(p.id)===String(c.tenantId));
 const text=contractSearchText([c.contract_no,c.tenant,c.tenantProfile?.nameEn,profile?.nameAr,profile?.nameEn,c.property,c.unit].join(' '));
 return contractSearchText(query).trim().split(/\s+/).filter(Boolean).every(term=>text.includes(term));
}
async function openContractStatements(d,c){
 const module=await guardPageImport(()=>import('./property-statements.js'));
 d.session.check();
 if(typeof module.openPropertyStatements!=='function')throw Error('تعذر فتح الكشف.');
 d.close();return module.openPropertyStatements({propertyName:c.property,period:currentMonth(),onBack:()=>openRentalContracts({id:c.id})});
}
function select(rows,value){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}if(value!==undefined)x.value=String(value);return x;}
function printControls(d,api,urls,id,choices){
 const output=node('div');let previousUrl;
 async function prepare(count,mode){
  output.replaceChildren();if(previousUrl){urls.release(previousUrl);previousUrl=null;}
  const prepared=await api.prepareContractPrint(id,count,mode);d.session.check();
  previousUrl=urls.create(new Blob([prepared.html],{type:'text/html;charset=utf-8'}));
  const link=node('a',mode==='official'?translateStatic('فتح النسخة المعتمدة وملاحقها للطباعة / Open approved copy and annexes'):translateStatic('فتح المسودة وملاحقها للمراجعة / Open draft and annexes'));
  link.href=previousUrl;link.target='_blank';link.rel='noopener';output.append(link);
  d.status.textContent=mode==='official'?translateStatic('تم التحقق من اعتماد العقد المحفوظ قبل إصدار النسخة.'):translateStatic('مسودة للمراجعة فقط، غير صالحة للتوقيع.');
 }
 for(const [count,mode,label]of choices){const b=node('button',label);b.type='button';b.onclick=()=>d.run(()=>prepare(count,mode));d.body.append(b);}
 d.body.append(output);return prepare;
}
export function openContractPrint(id,count=1,mode='official'){
 const d=createDialog(translateStatic('طباعة العقد وملاحقه / Contract printing'));if(!d)return false;
 const prepare=printControls(d,window.AQARI_RENTAL_RECORDS,createPrivateUrls(d),id,[[count,mode,translateStatic('إعادة التحقق وتجهيز النسخة / Check and prepare copy')]]);
 d.run(()=>prepare(count,mode));return true;
}
export function openRentalContracts(initial={}){
 const d=createDialog(translateStatic('إبرام عقود الإيجار / Rental contracts'));if(!d)return;
 d.el.classList.add('aq267-contracts');
 const api=window.AQARI_RENTAL_RECORDS,urls=createPrivateUrls(d);let data,properties=[],units=[];
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=()=>d.run(fn);return b;};
 const backButton=()=>{const b=node('button',translateStatic('العودة للعقود / Back'));b.type='button';b.onclick=()=>d.navigate(home);return b;};
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 async function load(){const saved=await rpc('aqari_read_state_v267',{p_workspace_id:d.session.bound.workspace});d.session.check();data=api.primary(saved.payload);}
 async function loadBindings(){
  const [nextProperties,nextUnits]=await Promise.all([
   d.session.request(d.session.client.from('aqari_properties').select('id,name,external_ref').eq('workspace_id',d.session.bound.workspace).order('name')),
   d.session.request(d.session.client.from('aqari_units').select('id,property_id,unit_no').eq('workspace_id',d.session.bound.workspace).order('unit_no'))
  ]);d.session.check();properties=nextProperties;units=nextUnits;
 }
 async function showDocuments(id,target=d.body){
  const docs=await d.session.request(d.session.client.from('aqari_documents').select('id,original_filename,storage_path,status').eq('workspace_id',d.session.bound.workspace).eq('entity_type','lease').eq('entity_ref',String(id)).eq('status','uploaded').order('created_at',{ascending:false}));d.session.check();
  if(target!==d.body)target.replaceChildren();
  target.append(node('h3',translateStatic('العقد الموقّع والملاحق المرتبطة')));
  if(!docs.length){target.append(node('p',translateStatic('لا توجد نسخة أصلية مرفوعة لهذا العقد حتى الآن. استخدم «مسح أو رفع العقد ومرفقاته» لإضافة الملف وربطه بهذا العقد.')));return;}
  for(const doc of docs){const row=node('section'),output=node('div');let link;
   row.append(button(doc.original_filename||doc.id,async()=>{if(link)return;const blob=await d.session.storage('GET',doc.storage_path);d.session.check();link=node('a',translateStatic('فتح الأصل المحفوظ')+' — '+(doc.original_filename||doc.id));link.href=urls.create(blob);link.target='_blank';link.rel='noopener';output.replaceChildren(link);d.status.textContent=translateStatic('الملف جاهز. اضغط «فتح الأصل المحفوظ» أسفل اسم الملف لعرضه.');}),output);target.append(row);
  }
 }

 function clear(title){urls.clear();d.body.replaceChildren(node('h3',title));}
 async function manageTemplates(){clear(translateStatic('إدارة قوالب العقود'));await mountRentalTemplateManager(d,d.body,{suggestion:api.defaultClauses(),onBack:home});}
 async function home(){clear(translateStatic('العقود المحفوظة / Saved contracts'));d.body.append(button(translateStatic('تحديث العقود / Refresh'),home));await load();d.body.append(node('p',translateStatic('ملف مستقل لإبرام العقد ومراجعته وملاحقه، مرتبط بملف المستأجر والعقار والوحدة وكشف الإيجار.')),button(translateStatic('إبرام عقد جديد / New rental contract'),async()=>form(null)));if(d.session.bound.role==='general_manager')d.body.append(button(translateStatic('إدارة واعتماد قوالب العقود'),manageTemplates));const search=input('search'),list=node('div');d.body.append(field(translateStatic('البحث برقم العقد أو اسم المستأجر / Search'),search),list);function draw(){list.replaceChildren();const q=search.value;for(const c of (data.contractsV202||[]).filter(c=>matchesContract(c,q,data.tenantProfilesV267||[])))list.append(button(`${c.contract_no} · ${c.tenant||translateStatic('غير مدون')} · ${translateStatic(states[c.status]||c.status)}`,()=>show(c.id)));if(!list.children.length)list.append(node('p',translateStatic('لا توجد عقود مطابقة.')));}search.oninput=draw;draw();d.status.textContent=translateStatic('تم استرجاع العقود من قاعدة البيانات.');}
 async function form(existing,renewal=null){await loadBindings();clear(existing?translateStatic('تعديل بيانات العقد مع حفظ السجل السابق'):translateStatic('إبرام عقد جديد'));d.body.append(backButton());const f=node('form'),g=node('div');g.className='aq267-grid';
  const templateBox=node('section');let selectedTemplate=existing?.contractTemplate||null;
  const profiles=data.tenantProfilesV267||[],tenant=select([['',translateStatic('اختر المستأجر')],...profiles.map(p=>[p.id,(p.nameAr||p.nameEn)+' / '+(p.nameEn||'')])],existing?.tenantId||renewal?.source.tenant_ref||''),property=select([['',translateStatic('اختر العقار')],...properties.map(p=>[p.name,p.name])],existing?.property||renewal?.source.property||''),unit=select([['',translateStatic('اختر الوحدة')]]),details=node('dl');tenant.required=property.required=unit.required=true;
  const controls={};for(const [key,label,type,value,required]of [['contract_no',translateStatic('رقم العقد / Contract number'),'text',existing?.contract_no,true],['floor',translateStatic('رقم الدور / Floor'),'text',existing?.floor,true],['start_date',translateStatic('بداية العقد / Start'),'date',existing?.start_date||renewal?.suggestedStart,true],['end_date',translateStatic('نهاية العقد / End'),'date',existing?.end_date,true],['contractRent',translateStatic('الإيجار عند إبرام العقد — د.ك / Original rent'),'text',existing?.contractRent,true],['discount',translateStatic('الخصم عند إبرام العقد — د.ك / Initial discount'),'text',existing?.discount??'0',true],['deposit',translateStatic('التأمين عند وجوده — د.ك / Deposit if applicable'),'text',existing?.deposit??'',false],['depositReceivedOn',translateStatic('تاريخ استلام التأمين عند استلامه / Deposit received'),'date',existing?.depositReceivedOn,false],['advance',translateStatic('العربون عند وجوده — د.ك / Advance if applicable'),'text',existing?.advance??'',false],['cleaningFee',translateStatic('رسوم النظافة عند وجودها — د.ك / Cleaning if applicable'),'text',existing?.cleaningFee??'',false],['receivedAt',translateStatic('تاريخ ووقت استلام العقد — الكويت / Received at Kuwait'),'datetime-local',existing?.receivedAt?.slice(0,16),false],['accountant',translateStatic('اسم المحاسب المسؤول / Responsible accountant'),'text',existing?.accountant,true]]){const c=input(type,value);c.required=required;c.maxLength=300;if(['contractRent','discount','deposit','advance','cleaningFee'].includes(key))c.inputMode='decimal';controls[key]=c;g.append(field(label,c));}
  if(!existing){const duration=input('number'),dateNote=node('p',translateStatic('تاريخ مقترح حسب المدة؛ راجعه قبل الحفظ. بداية الاستحقاق تُختار بشكل مستقل أدناه.'));duration.min='1';duration.max='600';duration.step='1';
   const proposeEnd=()=>{if(!duration.value||!controls.start_date.value)return;try{controls.end_date.value=leaseEndFromMonths(controls.start_date.value,Number(duration.value));dateNote.textContent=translateStatic('تاريخ مقترح حسب المدة؛ راجعه قبل الحفظ.');}catch(error){dateNote.textContent=error.message;}};
   duration.oninput=controls.start_date.onchange=proposeEnd;g.append(field(translateStatic('مدة العقد بالأشهر — لحساب تاريخ نهاية مقترح'),duration),dateNote);
  }
  const entitlementBox=node('section'),entitlementStart=input('date',existing?.rentEntitlement?.startDate||''),firstPolicy=select([['',translateStatic('اختر سياسة أول فترة')],['full_month',translateStatic('صافي شهر كامل في أول فترة تقويمية')],['daily_prorated',translateStatic('صافي الفترة بالأيام الفعلية حتى نهاية أول شهر')],['manual_first_period',translateStatic('صافي أول فترة بمبلغ يدوي صريح')]],existing?.rentEntitlement?.firstPeriodPolicy||''),manualFirst=input('text',existing?.rentEntitlement?.manualFirstPeriodAmount??''),entitlementPreview=node('p');
  const canEditEntitlement=!existing||['draft','ready'].includes(existing.status),includeEntitlement=!existing||!!existing.rentEntitlement||canEditEntitlement;
  if(includeEntitlement){
   entitlementStart.required=firstPolicy.required=true;entitlementStart.disabled=firstPolicy.disabled=!canEditEntitlement;manualFirst.inputMode='decimal';
   entitlementBox.append(node('h3',translateStatic('بداية استحقاق الإيجار')),field(translateStatic('تاريخ بداية الاستحقاق — ضمن مدة العقد'),entitlementStart),field(translateStatic('سياسة أول شهر تقويمي — اختيار صريح'),firstPolicy),field(translateStatic('صافي أول فترة فقط — د.ك؛ بعد أي خصم ودون التأمين والعربون والرسوم'),manualFirst),node('p',translateStatic('الاحتساب اليومي يخص أول شهر تقويمي فقط ويستخدم أيامه الفعلية. المبلغ اليدوي صافي نهائي؛ لا يُخصم منه خصم الشهر مرة ثانية. الشهر المجاني المعتمد يلغي مستحق شهره. الأشهر التالية تعود للإيجار الشهري وشروطه المعتمدة.')),entitlementPreview);
   const previewEntitlement=()=>{entitlementStart.min=controls.start_date.value;entitlementStart.max=controls.end_date.value;manualFirst.required=firstPolicy.value==='manual_first_period';manualFirst.disabled=!canEditEntitlement||!manualFirst.required;if(!manualFirst.required)manualFirst.value='';try{const rent=Math.round(Number(controls.contractRent.value)*1000)-Math.round(Number(controls.discount.value)*1000),candidate={start_date:controls.start_date.value,end_date:controls.end_date.value,rentalTermsVersion:1,rent:rent/1000,contractRent:Number(controls.contractRent.value),freeMonthApproved:false,rentAdjustments:[],rentEntitlement:{version:1,startDate:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:manualFirst.required?manualFirst.value:null}},value=api.effectiveRent(candidate,entitlementStart.value.slice(0,7));entitlementPreview.textContent=translateStatic('صافي أول فترة قبل تطبيق أي شهر مجاني معتمد: ')+value.toFixed(3)+translateStatic(' د.ك. هذا عرض للمراجعة؛ يثبت الحفظ والتحقق النتيجة.');}catch{entitlementPreview.textContent=translateStatic('أكمل التواريخ والسياسة والمبلغ لمراجعة صافي أول فترة.');}};
   for(const control of [entitlementStart,firstPolicy,manualFirst,controls.contractRent,controls.discount,controls.start_date,controls.end_date])control.addEventListener('input',previewEntitlement);previewEntitlement();
  }else entitlementBox.append(node('p',translateStatic('العقد التاريخي بلا بداية استحقاق مستقلة محفوظ كما هو؛ لا تضاف سياسة جديدة بأثر رجعي.')));
  if(existing?.rentEntitlement&&!canEditEntitlement){controls.start_date.disabled=controls.end_date.disabled=true;entitlementBox.append(node('p',translateStatic('تواريخ العقد والاستحقاق المعتمد ثابتة؛ استخدم «تجديد بعقد جديد» للمدة التالية.')));}
  const received=select([['لم يستلم',translateStatic('لم يستلم / Not received')],['مستلم',translateStatic('مستلم / Received')]],existing?.contractReceived||'لم يستلم'),free=input('checkbox'),freePeriod=input('month',existing?.freeMonthPeriod),eviction=select([['لم يُبلّغ',translateStatic('لم يُبلّغ')],['تم التبليغ',translateStatic('تم التبليغ')],['غير محدد',translateStatic('غير محدد')]],existing?.evictionNotice||'لم يُبلّغ'),reason=node('textarea');free.checked=existing?.freeMonthApproved===true;free.disabled=d.session.bound.role!=='general_manager';freePeriod.disabled=free.disabled;reason.required=!!existing;reason.maxLength=500;
  function delivery(){controls.receivedAt.required=received.value==='مستلم';controls.receivedAt.disabled=!controls.receivedAt.required;if(!controls.receivedAt.required)controls.receivedAt.value='';}received.onchange=delivery;delivery();free.onchange=()=>{freePeriod.required=free.checked;if(!free.checked)freePeriod.value='';};free.onchange();
  function tenantInfo(){details.replaceChildren();const p=profiles.find(p=>p.id===tenant.value);for(const [key,label]of [['nameAr',translateStatic('الاسم الكامل بالعربي')],['nameEn',translateStatic('الاسم الكامل بالإنجليزي — في العقد وملاحقه')],['passportNo',translateStatic('رقم الجواز')],['nationality',translateStatic('الجنسية')],['phone',translateStatic('الهاتف')],['email',translateStatic('البريد الإلكتروني')],['civilId',translateStatic('الرقم المدني')]])details.append(node('dt',label),node('dd',p?.[key]||translateStatic('غير مكتمل في ملف المستأجر')));const matches=(data.tenantDirectoryV202||[]).filter(x=>x.tenantProfileId===tenant.value);if(!existing&&matches.length===1){property.value=matches[0].property;unitOptions(matches[0].unit);controls.floor.value=matches[0].floor||'';}}
  function unitOptions(value){const prop=properties.find(p=>p.name===property.value);const options=units.filter(u=>u.property_id===prop?.id);unit.replaceChildren();const blank=node('option',translateStatic('اختر الوحدة'));blank.value='';unit.append(blank);for(const u of options){const o=node('option',u.unit_no);o.value=u.unit_no;unit.append(o);}if(value!==undefined)unit.value=String(value);}
  unit.onchange=()=>{if(existing)return;const rows=(data.tenantDirectoryV202||[]).filter(x=>x.property===property.value&&String(x.unit)===unit.value);const floor=rows.map(r=>r.floor).filter(Boolean);controls.floor.value=new Set(floor).size===1?floor[0]:'';};property.onchange=()=>{unitOptions();controls.floor.value='';};tenant.onchange=tenantInfo;unitOptions(existing?.unit||renewal?.source.unit);tenantInfo();if(renewal){tenant.value=renewal.source.tenant_ref;property.value=renewal.source.property;unitOptions(renewal.source.unit);for(const control of [tenant,property,unit])control.disabled=true;f.append(renewalSummary(renewal));}
  if(existing){for(const c of [tenant,property,unit,controls.contract_no,controls.contractRent,controls.discount])c.disabled=true;}
  f.append(templateBox,entitlementBox);
  f.append(field(translateStatic('المستأجر — سحب البيانات من ملفه / Tenant'),tenant),details,field(translateStatic('العقار / Property'),property),field(translateStatic('الوحدة المحفوظة / Saved unit'),unit),node('p',translateStatic('حُرر هذا العقد في دولة الكويت بتاريخ ')+(existing?.writtenOn||api.kuwaitDate())),g,field(translateStatic('حالة استلام العقد / Contract delivery'),received),field(translateStatic('اعتماد شهر مجاني / Approve free month'),free),field(translateStatic('الشهر المجاني عند اعتماده / Approved free month'),freePeriod),field(translateStatic('حالة تبليغ الإخلاء / Eviction notice'),eviction),field(translateStatic('سبب التعديل المعتمد / Change reason'),reason));
  if(existing&&d.session.bound.role==='general_manager'){const enable=input('checkbox'),effective=input('month',currentMonth()),discount=input('text'),why=input('text');controls.adjustment={enable,effective,discount,why};f.append(field(translateStatic('إضافة تعديل خصم مؤرخ — يحفظ القيم السابقة'),enable),field(translateStatic('شهر سريان الخصم الجديد'),effective),field(translateStatic('الخصم الجديد من الإيجار الأصلي — د.ك'),discount),field(translateStatic('سبب اعتماد الخصم'),why));}
  const save=node('button',translateStatic('حفظ العقد والتحقق من الربط / Save contract'));save.type='submit';save.disabled=!existing;f.append(save);d.body.append(f);d.status.textContent=translateStatic('أكمل شروط العقد. البيانات المسحوبة تُراجع في ملف المستأجر؛ المبالغ الاختيارية الفارغة تعني عدم وجودها.');const id=existing?.id||Date.now()*1024+crypto.getRandomValues(new Uint16Array(1))[0]%1024;
  f.onsubmit=event=>{event.preventDefault();const fields=Object.fromEntries(Object.entries(controls).filter(([k])=>k!=='adjustment').map(([k,c])=>[k,c.value]));d.run(async()=>{if(!existing)requireContractIdentity(profiles.find(p=>p.id===tenant.value));const template=existing?{}:templateForContract(selectedTemplate);const c={...existing,...fields,...template,id,tenantId:tenant.value,property:property.value,unit:unit.value,rent:fields.contractRent,writtenOn:existing?.writtenOn||api.kuwaitDate(),rentalTermsVersion:1,contractReceived:received.value,freeMonthApproved:free.checked,freeMonthPeriod:freePeriod.value,evictionNotice:eviction.value,changeReason:reason.value.trim(),status:existing?.status||'draft',rentAdjustments:[...(existing?.rentAdjustments||[])],clauses:existing?.clauses||template.clauses,language:existing?.language||'ar'};if(includeEntitlement)c.rentEntitlement={version:1,startDate:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:firstPolicy.value==='manual_first_period'?manualFirst.value:null};if(renewal)c.renewalSource=renewal.source;const a=controls.adjustment;if(a?.enable.checked)c.rentAdjustments.push({effectiveMonth:a.effective.value,discount:a.discount.value,reason:a.why.value.trim()});await api.saveLease(c);d.session.check();await show(id);d.status.textContent=translateStatic('حُفظ العقد وربطه بالمستأجر والوحدة والعقار، مع سجل التغيير.');});};
  if(existing){templateBox.append(node('p',existing.contractTemplate?translateStatic('قالب العقد المحفوظ: ')+existing.contractTemplate.title+translateStatic(' · الإصدار ')+existing.contractTemplate.version:translateStatic('عقد تاريخي محفوظ دون ربطه بقالب جديد بأثر رجعي.')));}
  else await mountRentalTemplatePicker(d,templateBox,{onChange:value=>{selectedTemplate=value;save.disabled=!value;},onManage:manageTemplates});
 }
 async function show(id){clear(translateStatic('العقود المحفوظة / Saved contracts'));d.body.append(backButton(),button(translateStatic('إعادة المحاولة'),()=>show(id)));await load();const c=(data.contractsV202||[]).find(x=>String(x.id)===String(id));if(!c)throw Error('العقد غير موجود.');clear(translateStatic('عقد ')+c.contract_no);d.body.append(backButton(),node('p',translateStatic(states[c.status]||c.status)+' · '+c.property+' · '+c.unit));
  d.body.append(button(translateStatic('كشوف العقارات المحفوظة'),()=>openContractStatements(d,c)));
  d.body.append(button(translateStatic('مسح أو رفع العقد ومرفقاته'),async()=>{const m=await import('./document-scanner.js');d.session.check();d.close();return m.openDocumentScanner({type:'lease',ref:String(c.id),category:'lease_contract',onBack:()=>openRentalContracts({id:c.id})});}));
  if(c.source==='statement-import'){await showDocuments(id);d.body.append(node('p',translateStatic('هذا عقد مستورد محفوظ للمراجعة. تُحسم بياناته من المرجع الأصلي عبر مسار اعتماد عقود المصدر.')));d.status.textContent=translateStatic('تم فتح مرجع العقد المستورد دون تعديل بيانات المصدر.');return;}
  if(['approved','signed','expired'].includes(c.status))d.body.append(button(translateStatic('تجديد بعقد جديد'),async()=>form(null,await loadLeaseRenewal(d,String(c.id)))));
  if(c.renewalSource&&(['draft','ready'].includes(c.status)||d.session.bound.role==='general_manager'&&['approved','signing'].includes(c.status))){const cancelForm=node('form'),why=node('textarea'),cancel=node('button',['approved','signing'].includes(c.status)?translateStatic('إلغاء تجديد غير موقّع'):translateStatic('إلغاء مسودة التجديد'));why.required=true;why.minLength=3;why.maxLength=500;cancel.type='submit';cancelForm.append(field(translateStatic('سبب إلغاء التجديد غير الموقّع — يبقى الأصل والربط والسجل محفوظين'),why),cancel);cancelForm.onsubmit=event=>{event.preventDefault();if(!cancelForm.reportValidity())return;d.run(async()=>{await api.saveLease({...c,status:'cancelled',changeReason:why.value.trim()});d.session.check();await show(id);d.status.textContent=translateStatic('ألغيت مسودة التجديد مع حفظ أصلها وسبب الإلغاء.');});};d.body.append(cancelForm);}
  const markup=node('div');markup.innerHTML=api.contractMarkup(c,1);d.body.append(markup);
  printControls(d,api,urls,id,[[1,'draft',translateStatic('مسودة للمراجعة فقط / Review draft')],[1,'official',translateStatic('تجهيز نسخة معتمدة للطباعة / Prepare approved copy')],[2,'official',translateStatic('تجهيز نسختين معتمدتين مع الملاحق / Prepare two approved sets')]]);
  if(c.rentalTermsVersion===1)d.body.append(button(translateStatic('تعديل معتمد مع حفظ السجل السابق'),async()=>form(c)));
  d.body.append(button(translateStatic('جدول الاستحقاقات والتحصيل'),async()=>{const lease=await d.session.request(d.session.client.from('aqari_leases').select('id').eq('workspace_id',d.session.bound.workspace).eq('external_ref',String(c.id)).single());const schedule=await rpc('aqari_rent_due_schedule',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.id});if(!Array.isArray(schedule?.periods))throw Error('تعذر تأكيد جدول الاستحقاق.');const box=node('section'),table=node('table'),head=node('tr');for(const label of [translateStatic('الفترة'),translateStatic('تاريخ الاستحقاق'),translateStatic('صافي المستحق'),translateStatic('المحصل'),translateStatic('الرصيد الدائن المخصص'),translateStatic('رصيد الفترة')])head.append(node('th',label));table.append(head);for(const row of schedule.periods){if(row.lease_id!==lease.id)throw Error('جدول استحقاق لا يخص العقد.');const tr=node('tr');for(const value of [row.period,row.due_on||translateStatic('لا استحقاق'),...['due_amount','paid_amount','credit_amount','balance'].map(key=>api.amount(row[key]).toFixed(3))])tr.append(node('td',String(value??translateStatic('غير مدون'))));table.append(tr);}const scroll=node('div');scroll.style.overflowX='auto';scroll.style.maxWidth='100%';scroll.append(table);box.append(node('h3',translateStatic('جدول الاستحقاقات المحفوظ للعقد')),node('p',translateStatic('رصيد الفترة المستقبلية ليس متأخرًا قبل تاريخ استحقاقها. لا يشمل الجدول تحويل التأمين أو العربون تلقائيًا.')),scroll);d.body.append(box);}));
  const transitions={draft:'ready',ready:'approved',approved:'signing',signing:'signed'};const next=transitions[c.status];if(next)d.body.append(button(translateStatic('نقل إلى: ')+translateStatic(states[next]),async()=>{if(['approved','signed'].includes(next)&&d.session.bound.role!=='general_manager')throw Error('اعتماد المدير العام مطلوب.');if(next==='signed'&&c.source==='v267-cloud')return openContractExecutionDialog(d,id,()=>openRentalContracts({id}));await api.saveLease({...c,status:next,changeReason:'اعتماد انتقال حالة العقد إلى '+states[next]});await show(id);}));
  const documents=node('section');d.body.append(button(translateStatic('عرض المرفقات المحفوظة'),async()=>{await showDocuments(id,documents);d.status.textContent=translateStatic('تمت قراءة المرفقات المحفوظة.');}),documents);
  const upload=node('form'),file=input('file'),confirm=input('checkbox'),save=node('button',translateStatic('رفع النسخة الموقعة وربطها بالعقد'));file.accept='application/pdf,image/jpeg,image/png';file.required=confirm.required=true;upload.append(field(translateStatic('النسخة الموقعة — PDF أو صورة — حتى 25 ميجابايت'),file),field(translateStatic('راجعت النسخة وهي العقد الموقّع الفعلي لهذا المستأجر والوحدة'),confirm),save);d.body.append(upload);let pending=null;
  file.onchange=()=>{pending=null;confirm.checked=false;};
  upload.onsubmit=event=>{event.preventDefault();const chosen=file.files?.[0];d.run(async()=>{
   await validateDocument(chosen,26214400);d.session.check();if(!confirm.checked)throw Error('أكد مطابقة النسخة الموقعة.');
   if(!pending){
    const r=await rpc('aqari_reserve_document',{p_workspace_id:d.session.bound.workspace,p_document_type:'signed_contract',p_entity_type:'lease',p_entity_ref:String(id),p_title:'عقد موقّع '+c.contract_no,p_original_filename:chosen.name,p_mime_type:chosen.type,p_metadata:{release:'V267',tenantId:c.tenantId,property:c.property,unit:c.unit}}),doc=Array.isArray(r)?r[0]:r;
    if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path?.startsWith(d.session.bound.workspace+'/'))throw Error('تعذر حجز نسخة المستند.');
    pending={doc,upload:createVerifiedUpload(d.session,{path:doc.storage_path,blob:chosen})};
   }
   const {doc}=pending,hash=await pending.upload();
   await rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:chosen.size,p_mime_type:chosen.type,p_checksum:hash});
   const verified=await d.session.request(d.session.client.from('aqari_documents').select('id,status,entity_type,entity_ref,created_by,checksum_sha256').eq('workspace_id',d.session.bound.workspace).eq('id',doc.document_id).single());
   if(verified?.id!==doc.document_id||verified.status!=='uploaded'||verified.entity_type!=='lease'||verified.entity_ref!==String(id)||verified.created_by!==d.session.bound.user||verified.checksum_sha256!==hash)throw Error('لم تتأكد إعادة قراءة سجل المستند.');
   await show(id);d.status.textContent=translateStatic('حُفظت النسخة الموقعة وربطت بالعقد والمستأجر والوحدة.');
  });};
  const historyTarget=node('section');
  d.body.append(button(translateStatic('عرض سجل العقد والنسخ السابقة'),async()=>{
   const history=await rpc('aqari_contract_history',{p_workspace_id:d.session.bound.workspace,p_contract_ref:String(id)});d.session.check();
   const box=node('details');box.open=true;box.append(node('summary',translateStatic('سجل العقد والنسخ السابقة / Contract history')));
   for(const h of history){const item=node('details');item.append(node('summary',h.actor_name+' · '+kuwaitTime(h.recorded_at)+' · '+h.reason),node('pre',JSON.stringify({before:h.before_snapshot,after:h.after_snapshot},null,2)));box.append(item);}
   historyTarget.replaceChildren(box);d.status.textContent=translateStatic('تمت قراءة سجل العقد.');
  }),historyTarget);
  d.status.textContent=translateStatic('تمت قراءة بيانات العقد. يمكنك فتح المرفقات وسجل النسخ عند الحاجة.');
 }
 const initialRead=initial.renewalFrom!==undefined?async()=>{await load();await form(null,await loadLeaseRenewal(d,String(initial.renewalFrom)));}:initial.id!==undefined?()=>show(initial.id):initial.create?async()=>{await load();await form(null);}:home;
 d.body.append(button(translateStatic('إعادة المحاولة'),initialRead),backButton());
 d.run(initialRead);
}



