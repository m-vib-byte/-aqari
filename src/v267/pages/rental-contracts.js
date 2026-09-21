import {resolveRentalDocumentContext,linkedDocumentFieldKeys,groupRentalContractsByProperty,assertContractProperty,resolveContractPropertyBinding} from '../domain/rental-document-cycle.js';
import {mountSignatureReview,mountContractChangeRequest} from '../components/contract-administration.js';
import {guardPageImport} from '../components/navigation-import.js';
import {t as translateStatic} from '../components/locale.js';
import '../../../v267-rental-records.js';
import {node,field} from '../components/dialog.js';
import {createPage} from '../components/page.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {createVerifiedUpload} from '../components/verified-upload.js';
import {validateDocument,kuwaitTime,currentMonth} from '../domain/payroll.js';
import {leaseEndFromMonths} from '../domain/lease-dates.js';
import {loadLeaseRenewal,renewalSummary} from '../components/lease-renewal.js';
import {mountRentalTemplatePicker,templateForContract,requireContractIdentity} from '../components/rental-templates.js';
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
 d.close();return module.openPropertyStatements({propertyId:c.propertyId,propertyName:c.property,period:currentMonth(),onBack:()=>openRentalContracts({propertyId:c.propertyId,id:c.id})});
}
function select(rows,value){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}if(value!==undefined)x.value=String(value);return x;}
function savedContractStyles(){
 if(typeof document==='undefined'||!document.head)return null;
 let css=document.getElementById('aq267-saved-contract-viewer-css');
 if(!css){css=document.createElement('link');css.id='aq267-saved-contract-viewer-css';css.rel='stylesheet';css.href='/src/v267/styles/saved-contract-viewer.css?release=V267';document.head.append(css);}
 return css;
}
function splitContractBlock(block,offset){
 const doc=block.ownerDocument,walker=doc.createTreeWalker(block,4);let current,remaining=offset;
 while((current=walker.nextNode())){if(remaining<=current.textContent.length)break;remaining-=current.textContent.length;}
 if(!current)return [block.cloneNode(true),null];
 const first=doc.createRange(),last=doc.createRange();first.selectNodeContents(block);first.setEnd(current,remaining);last.selectNodeContents(block);last.setStart(current,remaining);
 const before=block.cloneNode(false),after=block.cloneNode(false);before.append(first.cloneContents());after.append(last.cloneContents());return [before,after];
}
// Paginate copies of the saved rendering. The contract and its clauses are never edited.
export function paginateSavedContract(source,stage){
 const articles=[...source.children];if(!articles.length)return false;
 stage.replaceChildren();let content;
 const page=()=>{const sheet=node('article');sheet.className='aq267-contract-paper';content=node('div');content.className='aq267-contract-paper-content';const footer=node('footer');footer.className='aq267-contract-paper-footer';sheet.append(content,footer);stage.append(sheet);return content;};
 const fits=()=>content.scrollHeight<=content.clientHeight+1;
 for(const article of articles){
  const blocks=article.classList?.contains('v267-contract-copy')?[...article.children]:[article];page();
  if(!content.clientHeight){stage.replaceChildren();return false;}
  for(const original of blocks){
   let block=original.cloneNode(true);
   while(block){
    const occupied=content.children.length>0;content.append(block);
    if(fits())break;
    block.remove();if(occupied){page();continue;}
    const length=block.textContent.length;let low=1,high=length-1,best=0;
    while(low<=high){const mid=Math.floor((low+high)/2),[part]=splitContractBlock(block,mid);content.append(part);const ok=fits();part.remove();if(ok){best=mid;low=mid+1;}else high=mid-1;}
    if(!best){content.append(block);content.style.height='auto';content.parentElement.dataset.overflow='true';break;}
    const prefix=block.textContent.slice(0,best),word=prefix.search(/\s+\S*$/u);if(word>0)best=word+1;
    const [part,rest]=splitContractBlock(block,best);content.append(part);block=rest;if(block?.textContent.length)page();else block=null;
   }
  }
 }
 const pages=[...stage.children];pages.forEach((sheet,i)=>{sheet.lastElementChild.textContent=translateStatic('صفحة ')+(i+1)+' / '+pages.length;});return true;
}
export function mountSavedContractViewer(d,target,html){
 const viewer=node('section');viewer.className='aq267-saved-contract-viewer';viewer.setAttribute('aria-label',translateStatic('العقد المحفوظ — عرض صفحات A4'));viewer.dataset.focus='false';
 const toolbar=node('div');toolbar.className='aq267-contract-viewer-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label',translateStatic('حجم عرض العقد'));
 const reading=node('p',translateStatic('نص العقد المحفوظ للقراءة. تغيير حجم العرض لا يغيّر البنود أو البيانات.'));reading.className='aq267-contract-viewer-note';
 const viewport=node('div');viewport.className='aq267-contract-viewer-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label',translateStatic('صفحات العقد المحفوظ'));
 const stage=node('div');stage.className='aq267-contract-zoom-stage';const source=node('div');source.className='aq267-contract-viewer-source';source.innerHTML=html;
 const zoomLabel=node('output');zoomLabel.setAttribute('aria-live','polite');let zoom=1,mode='actual',focused=false,disposed=false;
 const actions=[];
 const action=(label,fn)=>{const b=node('button',translateStatic(label));b.type='button';b.onclick=()=>{d.session.check();fn();};actions.push(b);toolbar.append(b);return b;};
 const updateZoom=()=>{if(mode==='fit')zoom=Math.max(.25,Math.min(2,((viewport.clientWidth||826)-32)/794));stage.style.zoom=String(zoom);source.style.zoom=String(zoom);zoomLabel.textContent=Math.round(zoom*100)+'%';fit.setAttribute('aria-pressed',String(mode==='fit'));actual.setAttribute('aria-pressed',String(mode==='actual'));larger.disabled=zoom>=2;};
 const fit=action('ملاءمة العرض',()=>{mode='fit';updateZoom();}),actual=action('100% — الحجم الأصلي',()=>{mode='actual';zoom=1;updateZoom();}),larger=action('تكبير +',()=>{mode='custom';zoom=Math.min(2,zoom+.25);updateZoom();});
 const setFocus=value=>{focused=value;viewer.dataset.focus=String(value);focus.textContent=translateStatic(value?'إنهاء وضع القراءة':'قراءة بملء الشاشة');focus.setAttribute('aria-pressed',String(value));updateZoom();};
 const focus=action('قراءة بملء الشاشة',()=>setFocus(!focused));focus.setAttribute('aria-pressed','false');toolbar.append(zoomLabel);viewer.onkeydown=event=>{if(event.key==='Escape'&&focused){event.preventDefault();event.stopPropagation();setFocus(false);focus.focus?.();}};
 viewport.append(stage,source);viewer.append(toolbar,reading,viewport);target.append(viewer);updateZoom();
 const layout=()=>{if(disposed||viewer.isConnected===false)return;d.session.check();stage.style.zoom='1';if(paginateSavedContract(source,stage)){source.hidden=true;source.setAttribute('aria-hidden','true');viewer.dataset.pages=String(stage.children.length);}updateZoom();};
 const schedule=()=>{if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{try{layout();}catch{}});};
 const css=savedContractStyles();if(css?.sheet)schedule();else css?.addEventListener('load',schedule,{once:true});
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(()=>{if(!disposed&&viewer.isConnected!==false)updateZoom();});observer.observe(viewport);d.onDispose?.(()=>observer.disconnect());}
 if(typeof document!=='undefined')document.fonts?.ready.then(schedule).catch(()=>{});
 d.onDispose?.(()=>{disposed=true;css?.removeEventListener('load',schedule);viewer.onkeydown=null;for(const b of actions)b.onclick=null;});
 return viewer;
}
function printControls(d,api,urls,id,choices){
 const output=node('div');let previousUrl;
 async function prepare(count,mode){
  output.replaceChildren();if(previousUrl){urls.release(previousUrl);previousUrl=null;}
  const prepared=await api.prepareContractPrint(id,count,mode);d.session.check();
  previousUrl=urls.create(new Blob([prepared.html],{type:'text/html;charset=utf-8'}));
  const preview=node('iframe');preview.title=translateStatic('معاينة العقد والملاحق داخل عقاري');preview.setAttribute('sandbox','');preview.src=previousUrl;preview.style.cssText='width:100%;height:75vh;border:1px solid #d8c8ae';output.append(preview);
  const download=node('a',translateStatic('تنزيل نسخة العقد والملاحق'));download.href=previousUrl;download.download='contract-'+id+'.html';output.append(download);
  d.status.textContent=mode==='official'?translateStatic('تم التحقق من اعتماد العقد المحفوظ قبل إصدار النسخة.'):translateStatic('مسودة للمراجعة فقط، غير صالحة للتوقيع.');
 }
 for(const [count,mode,label]of choices){const b=node('button',label);b.type='button';b.onclick=()=>d.run(()=>prepare(count,mode));d.body.append(b);}
 d.body.append(output);return prepare;
}
export function openContractPrint(id,count=1,mode='official'){
 const d=createPage(translateStatic('طباعة العقد وملاحقه / Contract printing'));if(!d)return false;
 const prepare=printControls(d,window.AQARI_RENTAL_RECORDS,createPrivateUrls(d),id,[[count,mode,translateStatic('إعادة التحقق وتجهيز النسخة / Check and prepare copy')]]);
 d.run(()=>prepare(count,mode));return true;
}
export function openRentalContracts(initial={}){
 const d=createPage(translateStatic('إبرام عقود الإيجار / Rental contracts'));if(!d)return;
 d.el.classList.add('aq267-contracts');
 const api=window.AQARI_RENTAL_RECORDS,urls=createPrivateUrls(d);let data,properties=[],units=[],leases=[],tenants=[],index=null,selectedPropertyId=initial.propertyId?String(initial.propertyId):null,selectedUnitId=null;
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=()=>d.run(fn);return b;};
 const backButton=()=>{const b=node('button',translateStatic('العودة للعقود / Back'));b.type='button';b.onclick=()=>d.navigate(()=>selectedPropertyId?propertyHome(selectedPropertyId):home());return b;};
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const scopeSources=()=>({workspaceId:d.session.bound.workspace,properties,units,leases,tenants});
 async function readIndexRows(table,columns){
  const result=[];
  for(let start=0;start<100000;start+=500){
   const batch=await d.session.request(d.session.client.from(table).select(columns).eq('workspace_id',d.session.bound.workspace).order('id').range(start,start+499));d.session.check();
   if(!Array.isArray(batch)||batch.some(row=>row.workspace_id!==d.session.bound.workspace))throw Error('تعذر تأكيد نطاق سجلات العقار.');
   result.push(...batch);if(batch.length<500)return result;
  }
  throw Error('عدد السجلات يتجاوز حد العرض؛ تعذر تأكيد اكتمال القائمة.');
 }
 async function load(){
  const [saved]=await Promise.all([rpc('aqari_read_state_v267',{p_workspace_id:d.session.bound.workspace}),loadBindings()]);d.session.check();
  if(saved?.workspace_id!==d.session.bound.workspace)throw Error('تعذر تأكيد مساحة عمل العقود.');
  data=api.primary(saved.payload);
  index=groupRentalContractsByProperty(data.contractsV202||[],scopeSources());
 }
 async function loadBindings(){
  const [nextProperties,nextUnits,nextLeases,nextTenants]=await Promise.all([
   readIndexRows('aqari_properties','id,workspace_id,name,external_ref,metadata'),
   readIndexRows('aqari_units','id,workspace_id,property_id,unit_no'),
   readIndexRows('aqari_leases','id,workspace_id,external_ref,tenant_id,unit_id'),
   readIndexRows('aqari_tenants','id,workspace_id,external_ref')
  ]);d.session.check();properties=nextProperties;units=nextUnits;leases=nextLeases;tenants=nextTenants;
 }
 function propertyRecord(id=selectedPropertyId){const rows=properties.filter(row=>String(row.id)===String(id));if(rows.length!==1)throw Error('اختر عقارًا محفوظًا بمعرّفه الصحيح.');return rows[0];}
 function boundContract(id){
  const rows=(data.contractsV202||[]).filter(row=>String(row.id)===String(id));if(rows.length!==1)throw Error('العقد غير موجود أو معرّفه مكرر.');
  const row=rows[0],binding=selectedPropertyId?assertContractProperty(row,selectedPropertyId,scopeSources()):resolveContractPropertyBinding(row,scopeSources());
  if(binding.status!=='bound'||!binding.unit||!binding.lease)throw Error('العقد محفوظ ويحتاج استكمال ربط العقار والوحدة قبل فتحه في هذه الدورة.');
  if(!selectedPropertyId)selectedPropertyId=binding.propertyId;
  return {contract:row,binding};
 }
 function currentPropertyContracts(){if(!selectedPropertyId)return [];return (index?.groups.find(group=>String(group.propertyId)===selectedPropertyId)?.contracts||[]);}
 async function showDocuments(id,target=d.body){
  boundContract(id);
  const docs=await d.session.request(d.session.client.from('aqari_documents').select('id,original_filename,storage_path,status').eq('workspace_id',d.session.bound.workspace).eq('entity_type','lease').eq('entity_ref',String(id)).eq('status','uploaded').order('created_at',{ascending:false}));d.session.check();
  if(target!==d.body)target.replaceChildren();
  target.append(node('h3',translateStatic('العقد الموقّع والملاحق المرتبطة')));
  if(!docs.length){target.append(node('p',translateStatic('لا توجد نسخة أصلية مرفوعة لهذا العقد حتى الآن. استخدم «مسح أو رفع العقد ومرفقاته» لإضافة الملف وربطه بهذا العقد.')));return;}
  for(const doc of docs){const row=node('section'),output=node('div');
   row.append(button(doc.original_filename||doc.id,async()=>{const blob=await d.session.storage('GET',doc.storage_path);d.session.check();const preview=node('iframe');preview.title=doc.original_filename||translateStatic('أصل العقد');preview.setAttribute('sandbox','');preview.src=urls.create(blob);preview.style.cssText='width:100%;height:75vh;border:1px solid #d8c8ae';output.replaceChildren(preview);d.status.textContent=translateStatic('المستند معروض داخل عقاري.');}),output);row.append(button(translateStatic('حالة المستند والتواقيع'),async()=>{output.replaceChildren();await mountSignatureReview(d,output,doc.id);}));target.append(row);
  }
 }

 function clear(title){urls.clear();d.body.replaceChildren(node('h3',title));}
 async function documentCycle(contractId){if(!selectedPropertyId)throw Error('اختر العقار أولًا.');if(contractId)boundContract(contractId);const m=await guardPageImport(()=>import('./rental-document-cycle.js'));d.session.check();d.close();return m.openRentalDocumentCycle({propertyId:selectedPropertyId,contractId,onBack:()=>openRentalContracts({propertyId:selectedPropertyId,...(contractId?{id:contractId}:{})})});}
 async function manageTemplates(){const m=await guardPageImport(()=>import('./contract-templates.js'));d.session.check();d.close();return m.openContractTemplates({propertyId:selectedPropertyId,onBack:()=>openRentalContracts({propertyId:selectedPropertyId})});}
 async function trackContract(id){
  clear(translateStatic('متابعة العقد'));d.body.append(button(translateStatic('إعادة المحاولة'),()=>trackContract(id)),backButton());await load();
  const {contract:c}=boundContract(id);
  d.body.append(node('h3',String(c.contract_no||id)),node('p',[c.tenant,c.property,c.unit,translateStatic(states[c.status]||c.status||'غير مدون')].filter(Boolean).join(' · ')),button(translateStatic('عرض العقد'),()=>show(id)));
  const history=await rpc('aqari_contract_history',{p_workspace_id:d.session.bound.workspace,p_contract_ref:String(id)});d.session.check();
  if(!Array.isArray(history))throw Error('تعذر قراءة سجل العقد.');
  d.body.append(node('h3',translateStatic('سجل العقد والنسخ السابقة / Contract history')));
  if(!history.length)d.body.append(node('p',translateStatic('لا توجد تغييرات مسجلة لهذا العقد.')));
  for(const h of history){const item=node('details');item.append(node('summary',[h.actor_name,kuwaitTime(h.recorded_at),h.reason].filter(Boolean).join(' · ')),node('pre',JSON.stringify({before:h.before_snapshot,after:h.after_snapshot},null,2)));d.body.append(item);}
  d.status.textContent=translateStatic('تمت قراءة سجل العقد.');
 }
 async function contractDocuments(id){
  clear(translateStatic('عرض المرفقات المحفوظة'));d.body.append(button(translateStatic('إعادة المحاولة'),()=>contractDocuments(id)),backButton());await load();
  const {contract:c}=boundContract(id);
  d.body.append(node('h3',String(c.contract_no||id)),button(translateStatic('عرض العقد'),()=>show(id)));
  await showDocuments(id);d.status.textContent=translateStatic('تمت قراءة المرفقات المحفوظة.');
 }
 async function home(){
  if(initial.mode==='approval'&&d.session.bound.role!=='general_manager')throw Error('اعتماد المدير العام مطلوب.');
  selectedPropertyId=null;selectedUnitId=null;clear(translateStatic('عقود الإيجار حسب العقار'));d.body.append(button(translateStatic('تحديث العقود / Refresh'),home));await load();
  d.body.append(node('p',translateStatic('اختر العقار أولًا لعرض وحداته وعقوده ومستأجريه ومستنداته.')));
  const cards=node('section');cards.className='aq267-property-contract-grid';
  for(const group of index.groups){
   const card=node('button');card.type='button';card.className='aq267-property-contract-card';card.dataset.propertyId=String(group.propertyId);
   const active=group.contracts.filter(c=>c.source!=='statement-import'&&!['cancelled','expired'].includes(c.status)).length;
   card.append(node('strong',group.property.name),node('span',translateStatic('العقود: ')+group.count),node('span',translateStatic('العقود التشغيلية: ')+active),node('span',translateStatic('الوحدات: ')+units.filter(unit=>unit.property_id===group.propertyId).length));
   card.onclick=()=>d.navigate(()=>propertyHome(String(group.propertyId)));cards.append(card);
  }
  if(!index.groups.length)cards.append(node('p',translateStatic('لا توجد عقارات متاحة.')));d.body.append(cards);
  const unresolved=[...index.unbound,...index.conflicts];
  if(unresolved.length){const review=node('details');review.className='aq267-unbound-contracts';review.append(node('summary',translateStatic('سجلات محفوظة تحتاج مراجعة الربط: ')+unresolved.length),node('p',translateStatic('هذه السجلات محفوظة ولم تُنسب إلى عقار بالاسم أو رقم الوحدة. يلزم تثبيت المعرّفات قبل تشغيل الدورة.')));for(const item of unresolved)review.append(node('p',String(item.contract.contract_no||item.contract.id)+' — '+item.reason));d.body.append(review);}
  d.status.textContent=translateStatic('اختر بطاقة العقار لبدء دورة العقود.');
 }
 async function propertyHome(propertyId){
  if(initial.mode==='approval'&&d.session.bound.role!=='general_manager')throw Error('اعتماد المدير العام مطلوب.');
  selectedPropertyId=String(propertyId);selectedUnitId=null;clear(translateStatic('عقود العقار'));d.body.append(button(translateStatic('العودة إلى العقارات'),home),button(translateStatic('إعادة المحاولة'),()=>propertyHome(propertyId)));await load();
  const property=propertyRecord(),contracts=currentPropertyContracts();d.body.append(node('h3',property.name));
  if(d.session.bound.role==='general_manager')d.body.append(button(translateStatic('إبرام عقد جديد / New rental contract'),()=>form(null)),button(translateStatic('إدارة نماذج هذا العقار'),manageTemplates),button(translateStatic('دورة مستندات هذا العقار'),()=>documentCycle()));
  const search=input('search'),list=node('section'),summary=node('p');search.name='property_contract_search';search.placeholder=translateStatic('ابحث داخل هذا العقار');list.className='aq267-property-unit-grid';
  const sourceCount=contracts.filter(c=>c.source==='statement-import').length;summary.textContent=translateStatic('العقود التشغيلية: ')+(contracts.length-sourceCount)+translateStatic(' · عقود المصدر للمراجعة: ')+sourceCount;
  d.body.append(summary,field(translateStatic('البحث داخل العقار برقم الوحدة أو العقد أو المستأجر'),search),list);
  const incomplete=contracts.filter(c=>{const binding=assertContractProperty(c,selectedPropertyId,scopeSources());return !binding.unit||!binding.lease;});
  if(incomplete.length){const review=node('details');review.append(node('summary',translateStatic('عقود العقار التي تحتاج استكمال ربط الوحدة: ')+incomplete.length));for(const c of incomplete)review.append(node('p',String(c.contract_no||c.id)));d.body.append(review);}
  function draw(){
   list.replaceChildren();
   for(const unit of units.filter(row=>String(row.property_id)===selectedPropertyId)){
    const linked=contracts.filter(c=>assertContractProperty(c,selectedPropertyId,scopeSources()).unitId===unit.id);
    const eligible=linked.filter(c=>initial.mode!=='approval'||(c.source!=='statement-import'&&['draft','ready'].includes(c.status)));
    const matching=eligible.filter(c=>matchesContract({...c,property:property.name,unit:unit.unit_no},search.value,data.tenantProfilesV267||[]));
    const unitMatch=contractSearchText(unit.unit_no).includes(contractSearchText(search.value).trim());
    if(initial.mode==='approval'&&!eligible.length)continue;if(search.value&&!matching.length&&!unitMatch)continue;
    const card=button(translateStatic('الوحدة ')+unit.unit_no,()=>unitContracts(unit.id));card.className='aq267-unit-contract-card';card.dataset.unitId=String(unit.id);
    card.append(node('span',translateStatic('العقود: ')+eligible.length));for(const c of (search.value?matching:eligible))card.append(node('span',[c.contract_no,c.tenant].filter(Boolean).join(' · ')));list.append(card);
   }
   if(!list.children.length)list.append(node('p',translateStatic('لا توجد وحدات أو عقود مطابقة داخل هذا العقار.')));
  }
  search.oninput=draw;draw();d.status.textContent=translateStatic('المعروض خاص بالعقار المحدد فقط.');
 }
 async function unitContracts(unitId){
  clear(translateStatic('عقود الوحدة'));d.body.append(backButton(),button(translateStatic('إعادة المحاولة'),()=>unitContracts(unitId)));await load();
  const unit=units.find(row=>String(row.id)===String(unitId)&&String(row.property_id)===selectedPropertyId);if(!unit)throw Error('الوحدة لا تخص العقار المحدد.');selectedUnitId=unit.id;
  const property=propertyRecord();d.body.append(node('h3',property.name+' — '+translateStatic('الوحدة ')+unit.unit_no));
  const rows=currentPropertyContracts().filter(c=>assertContractProperty(c,selectedPropertyId,scopeSources()).unitId===unit.id).filter(c=>initial.mode!=='approval'||(c.source!=='statement-import'&&['draft','ready'].includes(c.status)));
  if(d.session.bound.role==='general_manager')d.body.append(button(translateStatic('إبرام عقد جديد لهذه الوحدة'),()=>form(null)));
  for(const c of rows){
   const sourceOnly=c.source==='statement-import',card=node('section');card.className='aq267-contract-card'+(sourceOnly?' aq267-contract-source-review':'');card.dataset.contractMode=sourceOnly?'source_review':'operational';
   card.append(node('h3',String(c.contract_no||c.id)),node('p',[c.tenant||translateStatic('غير مدون'),sourceOnly?translateStatic('مصدر للمراجعة — غير تشغيلي'):translateStatic(states[c.status]||c.status||'غير مدون')].filter(Boolean).join(' · ')));
   if(sourceOnly)card.append(node('p',translateStatic('هذا سجل مصدر تاريخي محفوظ للمراجعة فقط؛ لا يحتسب إشغالاً أو تحصيلاً ولا يمنع عقداً تشغيلياً جديداً.')));
   const actions=node('div');actions.className='aq267-contract-card-actions';
   for(const [label,fn]of [['عرض العقد',()=>show(c.id)],['عرض المرفقات المحفوظة',()=>contractDocuments(c.id)],['متابعة العقد',()=>trackContract(c.id)]]){const action=button(translateStatic(label)+' — '+String(c.contract_no||c.id),fn);action.setAttribute('aria-label',translateStatic(label)+' — '+String(c.contract_no||c.id));actions.append(action);}
   if(d.session.bound.role==='general_manager')actions.append(button(translateStatic('المستندات الخمسة'),()=>documentCycle(c.id)));card.append(actions);d.body.append(card);
  }
  if(!rows.length)d.body.append(node('p',translateStatic('لا توجد عقود محفوظة لهذه الوحدة.')));
 }
 async function form(existing,renewal=null){if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});await loadBindings();const chosenProperty=propertyRecord();const sourceBinding=existing?boundContract(existing.id).binding:renewal?boundContract(renewal.source.contract_ref).binding:null;clear(existing?translateStatic('تعديل بيانات العقد مع حفظ السجل السابق'):translateStatic('إبرام عقد جديد'));d.body.append(backButton());const f=node('form'),g=node('div');g.className='aq267-grid';
  const templateBox=node('section');let selectedTemplate=existing?.contractTemplate||null,templatePicker=null,templateMaster=null,templateBindingKey='';
  const profiles=data.tenantProfilesV267||[],tenant=select([['',translateStatic('اختر المستأجر')],...profiles.map(p=>[p.id,(p.nameAr||p.nameEn)+' / '+(p.nameEn||'')])],existing?.tenantId||renewal?.source.tenant_ref||''),property=select([[chosenProperty.id,chosenProperty.name]],chosenProperty.id),unit=select([['',translateStatic('اختر الوحدة')]]),details=node('dl');tenant.required=property.required=unit.required=true;property.disabled=true;property.name='contract_property_id';unit.name='contract_unit_id';tenant.name='contract_tenant_id';
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
  function templateSourceValues(){
   const empty=Object.fromEntries(linkedDocumentFieldKeys.map(key=>[key,'']));
   const propertyRows=properties.filter(p=>String(p.id)===property.value&&String(p.id)===selectedPropertyId),p=propertyRows.length===1?propertyRows[0]:null;
   const unitRows=units.filter(u=>u.property_id===p?.id&&String(u.id)===unit.value),u=unitRows.length===1?unitRows[0]:null;
   if(!p||!u||!tenant.value)return empty;
   const source={id,tenantId:tenant.value,propertyId:p.id,unitId:u.id,property:p.name,unit:u.unit_no,writtenOn:existing?.writtenOn||api.kuwaitDate(),...Object.fromEntries(Object.entries(controls).filter(([key])=>key!=='adjustment').map(([key,control])=>[key,control.value]))};
   try{return {...empty,...resolveRentalDocumentContext({...data,contractsV202:[source]},{contractId:id},{properties,units:templateMaster?.unit?units.map(row=>row.id===templateMaster.unit.id?{...row,...templateMaster.unit}:row):units,propertyMasters:templateMaster?[templateMaster]:[]}).values};}catch{return empty;}
  }
  async function refreshTemplateSource(){
   const propertyRows=properties.filter(p=>String(p.id)===property.value&&String(p.id)===selectedPropertyId),p=propertyRows.length===1?propertyRows[0]:null;
   const unitRows=units.filter(u=>u.property_id===p?.id&&String(u.id)===unit.value),u=unitRows.length===1?unitRows[0]:null;
   const bindingKey=p&&u?p.id+':'+u.id:'';
   if(bindingKey!==templateBindingKey){
    templateMaster=null;templateBindingKey='';templatePicker?.setValues?.(templateSourceValues());
    if(bindingKey){
     const master=await rpc('aqari_property_contract_context',{p_workspace_id:d.session.bound.workspace,p_property_id:p.id,p_unit_id:u.id});d.session.check();
     if(master?.workspace_id!==d.session.bound.workspace||master?.user_id!==d.session.bound.user||master?.property?.id!==p.id||master?.unit?.id!==u.id||master.unit.propertyId!==p.id)throw Error('تعذر تأكيد ملف العقار والوحدة لحقول النموذج.');
     templateMaster=master;templateBindingKey=bindingKey;if(!existing&&master.unit.floor)controls.floor.value=master.unit.floor;
    }
   }
   templatePicker?.setValues?.(templateSourceValues());
  }
  function tenantInfo(){details.replaceChildren();const p=profiles.find(p=>p.id===tenant.value);for(const [key,label]of [['nameAr',translateStatic('الاسم الكامل بالعربي')],['nameEn',translateStatic('الاسم الكامل بالإنجليزي — في العقد وملاحقه')],['passportNo',translateStatic('رقم الجواز')],['nationality',translateStatic('الجنسية')],['phone',translateStatic('الهاتف')],['email',translateStatic('البريد الإلكتروني')],['civilId',translateStatic('الرقم المدني')]])details.append(node('dt',label),node('dd',p?.[key]||translateStatic('غير مكتمل في ملف المستأجر')));}
  function unitOptions(value){const options=units.filter(u=>String(u.property_id)===selectedPropertyId);unit.replaceChildren();const blank=node('option',translateStatic('اختر الوحدة'));blank.value='';unit.append(blank);for(const u of options){const o=node('option',u.unit_no);o.value=String(u.id);unit.append(o);}if(value!==undefined)unit.value=String(value);}
  unit.onchange=()=>{if(!existing){controls.floor.value='';return d.run(refreshTemplateSource);}};tenant.onchange=tenantInfo;unitOptions(sourceBinding?.unitId||selectedUnitId||'');tenantInfo();
  if(renewal){tenant.value=renewal.source.tenant_ref;unit.value=sourceBinding.unitId;for(const control of [tenant,property,unit])control.disabled=true;f.append(renewalSummary(renewal));}
  if(existing){for(const c of [tenant,property,unit,controls.contract_no,controls.contractRent,controls.discount])c.disabled=true;}
  f.append(templateBox,entitlementBox);
  f.append(field(translateStatic('المستأجر — سحب البيانات من ملفه / Tenant'),tenant),details,field(translateStatic('العقار / Property'),property),field(translateStatic('الوحدة المحفوظة / Saved unit'),unit),node('p',translateStatic('حُرر هذا العقد في دولة الكويت بتاريخ ')+(existing?.writtenOn||api.kuwaitDate())),g,field(translateStatic('حالة استلام العقد / Contract delivery'),received),field(translateStatic('اعتماد شهر مجاني / Approve free month'),free),field(translateStatic('الشهر المجاني عند اعتماده / Approved free month'),freePeriod),field(translateStatic('حالة تبليغ الإخلاء / Eviction notice'),eviction),field(translateStatic('سبب التعديل المعتمد / Change reason'),reason));
  if(existing&&d.session.bound.role==='general_manager'){const enable=input('checkbox'),effective=input('month',currentMonth()),discount=input('text'),why=input('text');controls.adjustment={enable,effective,discount,why};f.append(field(translateStatic('إضافة تعديل خصم مؤرخ — يحفظ القيم السابقة'),enable),field(translateStatic('شهر سريان الخصم الجديد'),effective),field(translateStatic('الخصم الجديد من الإيجار الأصلي — د.ك'),discount),field(translateStatic('سبب اعتماد الخصم'),why));}
  const save=node('button',translateStatic('حفظ العقد والتحقق من الربط / Save contract'));save.type='submit';save.disabled=!existing;f.append(save);d.body.append(f);d.status.textContent=translateStatic('أكمل شروط العقد. البيانات المسحوبة تُراجع في ملف المستأجر؛ المبالغ الاختيارية الفارغة تعني عدم وجودها.');const id=existing?.id||Date.now()*1024+crypto.getRandomValues(new Uint16Array(1))[0]%1024;
  f.onsubmit=event=>{event.preventDefault();const fields=Object.fromEntries(Object.entries(controls).filter(([k])=>k!=='adjustment').map(([k,c])=>[k,c.value]));d.run(async()=>{if(property.value!==selectedPropertyId)throw Error('العقار المحدد لا يطابق نطاق الصفحة.');const savedUnit=units.find(row=>String(row.id)===unit.value&&String(row.property_id)===selectedPropertyId);if(!savedUnit)throw Error('الوحدة لا تخص العقار المحدد.');if(sourceBinding&&(savedUnit.id!==sourceBinding.unitId||tenant.value!==String(existing?.tenantId||renewal?.source.tenant_ref)))throw Error('لا يمكن تغيير ربط العقد أثناء التعديل أو التجديد.');await refreshTemplateSource();if(!existing)requireContractIdentity(profiles.find(p=>p.id===tenant.value));const template=existing?{}:templateForContract(selectedTemplate,templatePicker?.values());const c={...existing,...fields,...template,id,tenantId:tenant.value,propertyId:selectedPropertyId,unitId:savedUnit.id,property:existing?.property||chosenProperty.name,unit:existing?.unit||savedUnit.unit_no,rent:fields.contractRent,writtenOn:existing?.writtenOn||api.kuwaitDate(),rentalTermsVersion:1,contractReceived:received.value,freeMonthApproved:free.checked,freeMonthPeriod:freePeriod.value,evictionNotice:eviction.value,changeReason:reason.value.trim(),status:existing?.status||'draft',rentAdjustments:[...(existing?.rentAdjustments||[])],clauses:existing?.clauses||template.clauses,language:existing?.language||'ar'};if(includeEntitlement)c.rentEntitlement={version:1,startDate:entitlementStart.value,firstPeriodPolicy:firstPolicy.value,manualFirstPeriodAmount:firstPolicy.value==='manual_first_period'?manualFirst.value:null};if(renewal)c.renewalSource=renewal.source;const a=controls.adjustment;if(a?.enable.checked)c.rentAdjustments.push({effectiveMonth:a.effective.value,discount:a.discount.value,reason:a.why.value.trim()});await api.saveLease(c);d.session.check();await show(id);d.status.textContent=translateStatic('حُفظ العقد وربطه بالمستأجر والوحدة والعقار، مع سجل التغيير.');});};
  if(existing){templateBox.append(node('p',existing.contractTemplate?translateStatic('قالب العقد المحفوظ: ')+existing.contractTemplate.title+translateStatic(' · الإصدار ')+existing.contractTemplate.version:translateStatic('عقد تاريخي محفوظ دون ربطه بقالب جديد بأثر رجعي.')));d.body.append(node('h3',translateStatic('نص العقد المحفوظ — للقراءة أثناء تعديل البيانات')));mountSavedContractViewer(d,d.body,api.contractMarkup(existing,1));}
  else {await refreshTemplateSource();templatePicker=await mountRentalTemplatePicker(d,templateBox,{getValues:templateSourceValues,onChange:value=>{selectedTemplate=value;save.disabled=!value;},onManage:manageTemplates});}
  for(const control of [tenant,property,unit,...Object.values(controls).filter(c=>c?.addEventListener)]){control.addEventListener('input',()=>d.run(refreshTemplateSource));control.addEventListener('change',()=>d.run(refreshTemplateSource));}
 }
 async function show(id){clear(translateStatic('العقود المحفوظة / Saved contracts'));d.body.append(backButton(),button(translateStatic('إعادة المحاولة'),()=>show(id)));await load();const {contract:c,binding}=boundContract(id);selectedUnitId=binding.unitId;clear(translateStatic('عقد ')+c.contract_no);d.body.append(backButton(),node('p',translateStatic(states[c.status]||c.status)+' · '+binding.property.name+' · '+binding.unit.unit_no));
  if(d.session.bound.role==='general_manager')d.body.append(button(translateStatic('مستندات هذا العقد — استلام، وصل، إخلاء، براءة ذمة'),()=>documentCycle(c.id)));
  d.body.append(button(translateStatic('كشوف العقارات المحفوظة'),()=>openContractStatements(d,{...c,propertyId:selectedPropertyId,property:propertyRecord().name})));
  d.body.append(button(translateStatic('مسح أو رفع العقد ومرفقاته'),async()=>{const m=await import('./document-scanner.js');d.session.check();d.close();return m.openDocumentScanner({type:'lease',ref:String(c.id),category:'lease_contract',onBack:()=>openRentalContracts({propertyId:selectedPropertyId,id:c.id})});}));
  if(c.source==='statement-import'){const originals=node('section');d.body.append(node('p',translateStatic('هذا عقد مستورد محفوظ للمراجعة. تُحسم بياناته من المرجع الأصلي عبر مسار اعتماد عقود المصدر.')),button(translateStatic('إعادة تحميل مرفقات العقد'),()=>showDocuments(id,originals)),originals);await showDocuments(id,originals);d.status.textContent=translateStatic('تم فتح مرجع العقد المستورد دون تعديل بيانات المصدر.');return;}
  if(d.session.bound.role==='general_manager'&&['approved','signed','expired'].includes(c.status))d.body.append(button(translateStatic('تجديد بعقد جديد'),async()=>form(null,await loadLeaseRenewal(d,String(c.id)))));
  if(d.session.bound.role==='general_manager'&&c.renewalSource&&(['draft','ready'].includes(c.status)||d.session.bound.role==='general_manager'&&['approved','signing'].includes(c.status))){const cancelForm=node('form'),why=node('textarea'),cancel=node('button',['approved','signing'].includes(c.status)?translateStatic('إلغاء تجديد غير موقّع'):translateStatic('إلغاء مسودة التجديد'));why.required=true;why.minLength=3;why.maxLength=500;cancel.type='submit';cancelForm.append(field(translateStatic('سبب إلغاء التجديد غير الموقّع — يبقى الأصل والربط والسجل محفوظين'),why),cancel);cancelForm.onsubmit=event=>{event.preventDefault();if(!cancelForm.reportValidity())return;d.run(async()=>{await api.saveLease({...c,status:'cancelled',changeReason:why.value.trim()});d.session.check();await show(id);d.status.textContent=translateStatic('ألغيت مسودة التجديد مع حفظ أصلها وسبب الإلغاء.');});};d.body.append(cancelForm);}
  if(d.session.bound.role!=='general_manager')mountContractChangeRequest(d,d.body,c.id);
  mountSavedContractViewer(d,d.body,api.contractMarkup(c,1));
  printControls(d,api,urls,id,[[1,'draft',translateStatic('مسودة للمراجعة فقط / Review draft')],[1,'official',translateStatic('تجهيز نسخة معتمدة للطباعة / Prepare approved copy')],[2,'official',translateStatic('تجهيز نسختين معتمدتين مع الملاحق / Prepare two approved sets')]]);
  if(d.session.bound.role==='general_manager'&&c.rentalTermsVersion===1)d.body.append(button(translateStatic('تعديل معتمد مع حفظ السجل السابق'),async()=>form(c)));
  d.body.append(button(translateStatic('جدول الاستحقاقات والتحصيل'),async()=>{const lease=await d.session.request(d.session.client.from('aqari_leases').select('id').eq('workspace_id',d.session.bound.workspace).eq('external_ref',String(c.id)).single());const schedule=await rpc('aqari_rent_due_schedule',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.id});if(!Array.isArray(schedule?.periods))throw Error('تعذر تأكيد جدول الاستحقاق.');const box=node('section'),table=node('table'),head=node('tr');for(const label of [translateStatic('الفترة'),translateStatic('تاريخ الاستحقاق'),translateStatic('صافي المستحق'),translateStatic('المحصل'),translateStatic('الرصيد الدائن المخصص'),translateStatic('رصيد الفترة')])head.append(node('th',label));table.append(head);for(const row of schedule.periods){if(row.lease_id!==lease.id)throw Error('جدول استحقاق لا يخص العقد.');const tr=node('tr');for(const value of [row.period,row.due_on||translateStatic('لا استحقاق'),...['due_amount','paid_amount','credit_amount','balance'].map(key=>api.amount(row[key]).toFixed(3))])tr.append(node('td',String(value??translateStatic('غير مدون'))));table.append(tr);}const scroll=node('div');scroll.style.overflowX='auto';scroll.style.maxWidth='100%';scroll.append(table);box.append(node('h3',translateStatic('جدول الاستحقاقات المحفوظ للعقد')),node('p',translateStatic('رصيد الفترة المستقبلية ليس متأخرًا قبل تاريخ استحقاقها. لا يشمل الجدول تحويل التأمين أو العربون تلقائيًا.')),scroll);d.body.append(box);}));
  const transitions={draft:'ready',ready:'approved',approved:'signing',signing:'signed'};const next=transitions[c.status];if(next&&d.session.bound.role==='general_manager')d.body.append(button(translateStatic('نقل إلى: ')+translateStatic(states[next]),async()=>{if(['approved','signed'].includes(next)&&d.session.bound.role!=='general_manager')throw Error('اعتماد المدير العام مطلوب.');if(next==='signed'&&c.source==='v267-cloud')return openContractExecutionDialog(d,id,()=>openRentalContracts({propertyId:selectedPropertyId,id}));await api.saveLease({...c,status:next,changeReason:'اعتماد انتقال حالة العقد إلى '+states[next]});await show(id);}));
  const documents=node('section');d.body.append(button(translateStatic('عرض المرفقات المحفوظة'),async()=>{await showDocuments(id,documents);d.status.textContent=translateStatic('تمت قراءة المرفقات المحفوظة.');}),documents);
  const upload=node('form'),file=input('file'),confirm=input('checkbox'),save=node('button',translateStatic('رفع النسخة الموقعة وربطها بالعقد'));file.accept='application/pdf,image/jpeg,image/png';file.required=confirm.required=true;upload.append(field(translateStatic('النسخة الموقعة — PDF أو صورة — حتى 25 ميجابايت'),file),field(translateStatic('راجعت النسخة وهي العقد الموقّع الفعلي لهذا المستأجر والوحدة'),confirm),save);if(d.session.bound.role==='general_manager')d.body.append(upload);let pending=null;
  file.onchange=()=>{pending=null;confirm.checked=false;};
  upload.onsubmit=event=>{event.preventDefault();const chosen=file.files?.[0];d.run(async()=>{
   await validateDocument(chosen,26214400);d.session.check();if(!confirm.checked)throw Error('أكد مطابقة النسخة الموقعة.');
   if(!pending){
    const r=await rpc('aqari_reserve_document',{p_workspace_id:d.session.bound.workspace,p_document_type:'signed_contract',p_entity_type:'lease',p_entity_ref:String(id),p_title:'عقد موقّع '+c.contract_no,p_original_filename:chosen.name,p_mime_type:chosen.type,p_metadata:{release:'V267',tenantId:c.tenantId,propertyId:selectedPropertyId,unitId:binding.unitId,property:c.property,unit:c.unit}}),doc=Array.isArray(r)?r[0]:r;
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
 const initialRead=initial.renewalFrom!==undefined?async()=>{await load();boundContract(initial.renewalFrom);await form(null,await loadLeaseRenewal(d,String(initial.renewalFrom)));}:initial.id!==undefined?()=>show(initial.id):initial.propertyId?async()=>{await propertyHome(initial.propertyId);if(initial.create)await form(null);}:home;
 d.body.append(button(translateStatic('إعادة المحاولة'),initialRead),backButton());
 d.run(initialRead);
}





export function openContractApprovals(){return openRentalContracts({mode:'approval'});}
export function openContractPreview(){return openRentalContracts({mode:'preview'});}
