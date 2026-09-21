import {node} from './dialog.js';
import {presentation,searchProperties,priceLabel,summaryMarkup} from '../domain/property-presentation.js';
let installed;
export function installPropertyExperience({readable,writable}){
 if(installed)return installed;
 const style=node('link');style.rel='stylesheet';style.href='/src/v267/styles/property-experience.css?release=V267';document.head.append(style);
 const region=node('section'),title=node('h2','ابحث عن عقارك'),search=node('input'),clear=node('button','مسح'),add=node('button','+ إضافة عقار'),manage=node('button','إدارة خصائص العقارات'),bar=node('div'),results=node('div'),status=node('p'),more=node('button','عرض المزيد');
 region.id='aq267-property-finder';region.className='aq267-property-finder';region.setAttribute('aria-labelledby','aq267-property-search-title');title.id='aq267-property-search-title';search.type='search';search.placeholder='اسم العقار، المنطقة أو المالك';search.setAttribute('aria-label','البحث عن عقار بالاسم أو المنطقة أو المالك');search.setAttribute('aria-controls','aq267-property-results');search.autocomplete='off';clear.type=add.type=manage.type=more.type='button';clear.setAttribute('aria-label','مسح البحث');add.className='aq267-property-add';manage.className='aq267-property-manage';bar.className='aq267-property-search-bar';results.id='aq267-property-results';results.className='aq267-property-results';status.setAttribute('role','status');status.setAttribute('aria-live','polite');more.className='aq267-property-more';bar.append(search,clear,add,manage);region.append(title,bar,status,results,more);
 let limit=6,viewScope='',serverRows=[],hydratedScope='',hydrating=false;
 const rowKey=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('ar');
 function serverRow(record){
  const metadata=record?.metadata;
  if(Array.isArray(metadata)){
   const row=structuredClone(metadata);row[0]=record.name||row[0]||'';return row;
  }
  const source=metadata&&typeof metadata==='object'?metadata:{};
  const unitCount=source.source_unit_count??source.unit_import?.unit_count??source.source_rows??'';
  return [record?.name||'',source.source_owner||'',String(unitCount??''),'',{aqariPropertyPresentation:1,location:source.source_address||'',price:'',purpose:'rent',phone:'',photos:[]}];
 }
 const rows=()=>{
  if(!readable())return [];
  const legacy=window.AQARI_V202?.propertyRecords?.()||[],merged=new Map();
  for(const row of [...legacy,...serverRows])if(Array.isArray(row)&&row[0]&&!merged.has(rowKey(row[0])))merged.set(rowKey(row[0]),row);
  return [...merged.values()];
 };
 async function hydrateServerRows(){
  if(!readable())return;const bridge=window.AQARI_SUPABASE,workspace=bridge?.context?.workspace?.id,user=bridge?.context?.user?.id,scope=workspace&&user?workspace+':'+user:'';
  if(!scope||hydrating||hydratedScope===scope||typeof bridge?.getClient!=='function')return;
  hydrating=true;
  try{
   const client=await bridge.getClient(),response=await client.from('aqari_properties').select('id,name,metadata').eq('workspace_id',workspace).order('name');
   if(response.error)throw response.error;
   const current=window.AQARI_SUPABASE?.context;if(current?.workspace?.id!==workspace||current?.user?.id!==user||!readable())return;
   serverRows=(response.data||[]).map(serverRow);hydratedScope=scope;refresh();
  }catch(error){status.textContent=String(error?.message||'تعذر قراءة قائمة العقارات الخادمة.');}
  finally{hydrating=false;}
 }
 const manager=()=>{const ctx=window.AQARI_SUPABASE?.context,role=ctx?.membership?.role||ctx?.role||ctx?.workspaceRole||'';return role==='general_manager';};
 async function openOnboarding(){
  if(!writable())throw Error('إضافة العقارات غير متاحة لصلاحية حسابك.');
  if(!window.AQARI_RENTAL_RECORDS)await import('/v267-rental-records.js');
  if(!writable())throw Error('تغيرت صلاحية إضافة العقارات. أعد المحاولة.');
  const m=await import('../pages/property-onboarding.js');
  if(!writable())throw Error('تغيرت صلاحية إضافة العقارات. أعد المحاولة.');
  return m.openPropertyOnboarding();
 }
 async function openPropertyControls(propertyId=null){
  if(!readable()||!manager())throw Error('إدارة خصائص العقارات متاحة للمدير العام فقط.');
  const m=await import('../pages/property-controls.js');
  if(!readable()||!manager())throw Error('تغيرت صلاحية إدارة خصائص العقارات. أعد المحاولة.');
  return m.openPropertyControls(propertyId);
 }
 async function openCompleteFileByName(name,options={}){
  if(!readable())return false;const bridge=window.AQARI_SUPABASE,workspace=bridge?.context?.workspace?.id;if(!workspace||typeof bridge?.getClient!=='function')throw Error('الجلسة غير جاهزة.');
  const client=await bridge.getClient();let query=client.from('aqari_properties').select('id,name').eq('workspace_id',workspace);
  const {data,error}=await query.eq('name',String(name||'').trim()).limit(2);if(error)throw error;
  if(!Array.isArray(data)||data.length!==1)throw Error(data?.length?'اسم العقار غير فريد. افتح السجل باستخدام معرفه.':'لم يتم ربط هذا العقار بالسجل الخادمي بعد.');
  const m=await import('../pages/property-hub.js');return m.openPropertyHub(data[0].id,options);
 }
 async function openSenderSettingsByName(name){
  if(!readable()||!manager())throw Error('إعدادات إرسال العقار متاحة للمدير العام فقط.');
  return openCompleteFileByName(name,{section:'sender'});
 }
 async function openAuthoritativeStatement(name){
  if(!readable())throw Error('كشف الإيجار غير متاح لصلاحية حسابك.');
  const m=await import('../pages/property-statements.js');
  if(!readable())throw Error('تغيرت صلاحية قراءة العقار. أعد المحاولة.');
  return m.openPropertyStatements({propertyName:name});
 }
 async function openCompleteFile(row){
  if(!readable()||!rows().some(x=>x[0]===row[0]))return refresh();status.textContent='جاري فتح الملف الكامل…';
  try{await openCompleteFileByName(row[0]);status.textContent='';}
  catch(error){status.textContent=String(error?.message||'تعذر فتح الملف الكامل.');if(!String(error?.message||'').includes('السجل الخادمي'))return;window.AQARI_V202?.openProperty(row[0]);}
 }
 function refresh(){
  const propertyPage=document.getElementById('list'),propertyTitle=document.getElementById('v201PageTitle-list'),onPropertyPage=propertyPage?.classList.contains('on')&&propertyTitle?.textContent?.trim()==='العقارات';
  const home=document.getElementById('v205SimpleHome')||document.getElementById('home'),host=onPropertyPage?propertyPage:home;
  if(onPropertyPage){const head=propertyPage.querySelector('.aq-exact-section-head');if(head&&head.nextElementSibling!==region)head.after(region);}
  else if(host&&host.firstChild!==region)host.prepend(region);
  const allowed=readable();region.hidden=!allowed;add.hidden=!writable();manage.hidden=!allowed||!manager();results.replaceChildren();
  if(!allowed){search.value='';status.textContent='';more.hidden=true;viewScope='';serverRows=[];hydratedScope='';return;}
  void hydrateServerRows();
  const scope=JSON.stringify([window.AQARI_SUPABASE?.context?.user?.id,window.AQARI_SUPABASE?.context?.workspace?.id]);if(viewScope&&scope!==viewScope){search.value='';limit=6;}viewScope=scope;
  const all=rows(),matches=searchProperties(all,search.value);clear.hidden=!search.value;more.hidden=matches.length<=limit;
  status.textContent=all.length?(matches.length?matches.length+' عقار':'لا توجد نتائج. جرّب اسم العقار أو المنطقة.'):'لا توجد عقارات مسجلة في مساحة العمل.';
  matches.slice(0,limit).forEach(row=>{
   const card=node('button'),meta=presentation(row),text=node('span'),name=node('strong',row[0]),location=node('span',meta.location||'الموقع غير مضاف'),price=node('b',priceLabel(row)),complete=node('span','ملف كامل');card.type='button';card.className='aq267-property-card';card.setAttribute('aria-label','فتح الملف الكامل للعقار '+row[0]);complete.className='aq267-property-complete-label';
   if(meta.photos[0]){const image=node('img');image.src=meta.photos[0];image.alt='';image.loading='lazy';image.width=160;image.height=120;card.append(image);}else{const mark=node('span','⌂');mark.className='aq267-property-card-mark';mark.setAttribute('aria-hidden','true');card.append(mark);}
   text.append(name,location,price,complete);card.append(text);card.onclick=()=>openCompleteFile(row);results.append(card);
  });
 }
 search.oninput=()=>{limit=6;refresh();};search.onkeydown=e=>{if(e.key==='Escape'){search.value='';limit=6;refresh();}else if(e.key==='Enter'){e.preventDefault();results.querySelector('button')?.click();}};clear.onclick=()=>{search.value='';limit=6;refresh();search.focus();};more.onclick=()=>{limit+=6;refresh();};
 add.onclick=async()=>{if(!writable())return;add.disabled=true;try{await openOnboarding();}catch(error){status.textContent=String(error?.message||'تعذر فتح إضافة العقار. أعد المحاولة.');}finally{add.disabled=false;}};
 manage.onclick=async()=>{if(!manager())return;manage.disabled=true;try{await openPropertyControls();}catch(error){status.textContent=String(error?.message||'تعذر فتح إدارة خصائص العقارات.');}finally{manage.disabled=false;}};
 const onLegacyQuickCreate=event=>{const trigger=event.target?.closest?.('[data-v201-create="properties"]');if(!trigger)return;event.preventDefault();event.stopImmediatePropagation();if(!writable())return;trigger.disabled=true;openOnboarding().catch(error=>{status.textContent=String(error?.message||'تعذر فتح إضافة العقار. أعد المحاولة.');}).finally(()=>{if(trigger.isConnected)trigger.disabled=false;});};
 const onLegacyPropertyAction=event=>{const trigger=event.target?.closest?.('[data-v201-property-action="profile"],[data-v201-property-action="statement"]');if(!trigger)return;const name=document.getElementById('v201PropertyTitle')?.textContent?.trim();if(!name||!readable())return;event.preventDefault();event.stopImmediatePropagation();trigger.disabled=true;const task=trigger.dataset.v201PropertyAction==='statement'?openAuthoritativeStatement(name):openCompleteFileByName(name);Promise.resolve(task).catch(error=>{status.textContent=String(error?.message||'تعذر فتح بيانات العقار.');}).finally(()=>{if(trigger.isConnected)trigger.disabled=false;});};
 document.addEventListener('click',onLegacyQuickCreate,true);document.addEventListener('click',onLegacyPropertyAction,true);
 const onBoundary=()=>{viewScope='';search.value='';limit=6;refresh();};window.addEventListener('aqari:auth-boundary',onBoundary);window.addEventListener('aqari:property-saved',event=>{const name=event.detail?.name;search.value=typeof name==='string'&&rows().some(row=>row[0]===name)?name:'';limit=6;refresh();if(search.value)status.textContent='تم حفظ العقار — '+name;});
 const render=window.render;if(typeof render==='function')window.render=function(...args){const result=render.apply(this,args);refresh();return result;};
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-v199-go="home"],[data-v205-route="home"]'))queueMicrotask(refresh);});
 window.AQARI_PROPERTY_EXPERIENCE=Object.freeze({summaryMarkup,canWrite:writable,canManageSender:()=>readable()&&manager(),openSenderSettingsByName,openCompleteFileByName,openOnboarding,openAuthoritativeStatement,openPropertyControls});installed={refresh};refresh();return installed;
}
