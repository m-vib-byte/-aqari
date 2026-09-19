const RELEASE='V267';
const OWNER_CLASS='aq-owner-reference';
let mounted=false,refreshTimer=0,observer=null;

const routes=[
 {key:'home',label:'الرئيسية',icon:'⌂',route:'home'},
 {key:'properties',label:'العقارات والوحدات',icon:'▥',route:'properties'},
 {key:'tenants',label:'المستأجرون',icon:'◉',route:'tenants'},
 {key:'contracts',label:'العقود',icon:'▤',service:'rental_contracts'},
 {key:'collections',label:'التحصيل',icon:'▣',route:'collectionProPage'},
 {key:'expenses',label:'المصروفات',icon:'◫',id:'aq267-financial-register'},
 {key:'maintenance',label:'الصيانة',icon:'⌁',route:'maintenanceProPage'},
 {key:'employees',label:'الموظفون والرواتب',icon:'▦',service:'employees_payroll'},
 {key:'services',label:'الفواتير والخدمات',icon:'≡',service:'maintenance_utilities'},
 {key:'reports',label:'التقارير والإحصائيات',icon:'▥',route:'reports'},
 {key:'documents',label:'المستندات والأرشيف',icon:'▧',route:'documentsHub'},
 {key:'tasks',label:'التنبيهات والمهام',icon:'◌',module:'./pages/owner-task-center.js',exportName:'openOwnerTaskCenter'},
 {key:'settings',label:'الإعدادات',icon:'⚙',route:'settingsCenterPage'}
];

const packageActions=[
 {key:'assistant',label:'المساعد الذكي',keywords:'بحث افتح ساعدني انتقل',local:'assistant'},
 {key:'tasks',label:'التنبيهات والمهام',keywords:'تنبيه مهمة متابعة استحقاق',module:'./pages/owner-task-center.js',exportName:'openOwnerTaskCenter'},
 {key:'approvals',label:'مركز الموافقات',keywords:'اعتماد موافقة مراجعة',module:'./pages/approval-center.js',exportName:'openApprovalCenter'},
 {key:'report',label:'تقرير المالك التلقائي',keywords:'تقرير مالك مؤشرات شهري',module:'./pages/owner-report.js',exportName:'openOwnerReport'},
 {key:'timeline',label:'الملف الزمني للمستأجر',keywords:'مستأجر تاريخ دفعات صيانة عقد',module:'./pages/tenant-timeline.js',exportName:'openTenantTimeline'},
 {key:'reconciliation',label:'المطابقة المالية',keywords:'بنك تحويل مطابقة دفع',module:'./pages/bank-reconciliation.js',exportName:'openBankReconciliation'},
 {key:'archive',label:'الأرشفة والبحث',keywords:'بحث أرشيف مستند وثيقة',local:'archive'},
 {key:'vacating',label:'الإخلاء والتسوية النهائية',keywords:'إخلاء تسوية براءة ذمة',module:'./pages/vacating-settlement.js',exportName:'openVacatingSettlement'}
];

function authReady(){
 try{
  const context=window.AQARI_SUPABASE?.context,member=context?.membership;
  return document.documentElement?.classList.contains('aqari-auth-unlocked')&&
   member?.is_active===true&&typeof context?.user?.id==='string'&&typeof context?.workspace?.id==='string';
 }catch{return false;}
}
function visible(el){
 if(!el||el.disabled||el.hidden)return false;
 const style=window.getComputedStyle?.(el);
 return !style||(style.display!=='none'&&style.visibility!=='hidden');
}
function normalize(value){
 return String(value??'').trim().toLowerCase()
  .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'');
}
function selectorValue(value){return globalThis.CSS?.escape?CSS.escape(String(value)):String(value).replace(/[\\"']/g,'\\$&');}
function routeButton(route){
 return [...document.querySelectorAll(`[data-v199-go="${selectorValue(route)}"]`)].find(visible)||null;
}
function serviceButton(def){
 if(def.id){const byId=document.getElementById(def.id);if(visible(byId))return byId;}
 if(def.service){
  const byKey=[...document.querySelectorAll(`[data-aq267-label="${selectorValue(def.service)}"]`)].find(visible);
  if(byKey)return byKey;
 }
 return null;
}
function available(def){
 if(def.local||def.module)return authReady();
 if(def.route)return Boolean(routeButton(def.route));
 return Boolean(serviceButton(def));
}
function statusNode(){
 return document.getElementById('aqOwnerReferenceStatus');
}
function setStatus(message,bad=false){
 const el=statusNode();if(!el)return;
 el.textContent=message||'';el.classList.toggle('is-bad',Boolean(bad));
}
async function runDefinition(def){
 setStatus('');
 try{
  if(def.local==='assistant')return openAssistant();
  if(def.local==='archive')return openArchiveCenter();
  if(def.module){
   const mod=await import(def.module+'?release='+encodeURIComponent(RELEASE));
   if(typeof mod?.[def.exportName]!=='function')throw Error('الخدمة غير جاهزة.');
   return mod[def.exportName]();
  }
  const target=def.route?routeButton(def.route):serviceButton(def);
  if(!target)throw Error('هذه الوظيفة غير متاحة لصلاحية الحساب الحالية.');
  target.click();
  setTimeout(syncActiveRail,0);
  return true;
 }catch(error){
  setStatus(error?.message||'تعذر فتح الخدمة.',true);
  return false;
 }
}
function ensureCss(){
 let link=document.getElementById('aqari-v267-owner-reference-css');
 if(!link){
  link=document.createElement('link');link.id='aqari-v267-owner-reference-css';link.rel='stylesheet';
  link.href='/src/v267/styles/owner-reference.css?release='+encodeURIComponent(RELEASE);
 }
 if(document.head&&document.head.lastElementChild!==link)document.head.appendChild(link);
}
function railMarkup(){
 return `<aside id="aqOwnerReferenceRail" class="aq-owner-rail" aria-label="التنقل الرئيسي الجديد">
  <button type="button" class="aq-owner-logo" data-owner-key="home"><span class="aq-owner-logo-mark">A</span><strong>عقاري</strong><small>AQARI ${RELEASE}</small></button>
  <nav class="aq-owner-rail-nav">${routes.map(item=>`<button type="button" data-owner-key="${item.key}" aria-label="${item.label}"><span aria-hidden="true">${item.icon}</span><b>${item.label}</b></button>`).join('')}</nav>
  <section class="aq-owner-support"><strong>المساعدة والدعم</strong><small>مركز التشغيل الآمن</small><button type="button" data-owner-package="assistant">اسأل المساعد</button></section>
 </aside>`;
}
function mountRail(){
 if(document.getElementById('aqOwnerReferenceRail'))return;
 document.body.insertAdjacentHTML('beforeend',railMarkup());
 const rail=document.getElementById('aqOwnerReferenceRail');
 rail.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const packageKey=button.dataset.ownerPackage;
  if(packageKey){const item=packageActions.find(x=>x.key===packageKey);if(item)runDefinition(item);return;}
  const key=button.dataset.ownerKey,def=routes.find(x=>x.key===key);if(def)runDefinition(def);
 });
}
function commandBarMarkup(){
 return `<section id="aqOwnerReferenceCommand" class="aq-owner-command" aria-label="حزمة إدارة عقاري">
  <div class="aq-owner-command-copy"><span>مساحة المدير</span><strong>إدارة عقارك من مكان واحد</strong><small>تنقل واضح، بحث، موافقات، تقارير وتسويات بدون تكرار للوظائف القائمة.</small></div>
  <button type="button" class="aq-owner-search-launch" data-owner-package="assistant"><span>⌕</span><span>ابحث أو اطلب من المساعد الذكي…</span><kbd>⌘ K</kbd></button>
  <div class="aq-owner-command-actions">
   ${packageActions.filter(x=>['tasks','approvals','report','timeline','reconciliation'].includes(x.key)).map(x=>`<button type="button" data-owner-package="${x.key}">${x.label}</button>`).join('')}
  </div>
  <p id="aqOwnerReferenceStatus" role="status" aria-live="polite"></p>
 </section>`;
}
function mountCommandBar(){
 const home=document.getElementById('home');if(!home||document.getElementById('aqOwnerReferenceCommand'))return;
 home.insertAdjacentHTML('afterbegin',commandBarMarkup());
 const bar=document.getElementById('aqOwnerReferenceCommand');
 bar.addEventListener('click',event=>{
  const key=event.target.closest('[data-owner-package]')?.dataset.ownerPackage;
  const def=packageActions.find(x=>x.key===key);if(def)runDefinition(def);
 });
}
function mountTopSearch(){
 const top=document.getElementById('aqariV199Topbar');if(!top||document.getElementById('aqOwnerTopSearch'))return;
 const button=document.createElement('button');
 button.type='button';button.id='aqOwnerTopSearch';button.className='aq-owner-top-search';
 button.innerHTML='<span aria-hidden="true">⌕</span><span>ابحث عن عقار، مستأجر، عقد، رقم شقة…</span><kbd>⌘ K</kbd>';
 button.addEventListener('click',()=>openAssistant());
 const nav=top.querySelector('.v199-primary-nav');
 if(nav)top.insertBefore(button,nav);else top.appendChild(button);
}
function syncAvailability(){
 for(const button of document.querySelectorAll('#aqOwnerReferenceRail [data-owner-key]')){
  const def=routes.find(x=>x.key===button.dataset.ownerKey);
  if(!def)continue;
  const ok=available(def);button.disabled=!ok;button.setAttribute('aria-disabled',String(!ok));
 }
}
function syncActiveRail(){
 const active=document.querySelector('.v199-nav-button.is-active,.v199-bottom-button.is-active');
 const route=active?.dataset?.v199Go;
 for(const button of document.querySelectorAll('#aqOwnerReferenceRail [data-owner-key]')){
  const def=routes.find(x=>x.key===button.dataset.ownerKey);
  button.classList.toggle('is-active',Boolean(def?.route&&def.route===route));
 }
}
function visibleDashboardSummary(){
 const cards=[...document.querySelectorAll('.v199-kpi,.v210-kpis>*')].filter(visible).slice(0,6);
 return cards.map(card=>card.textContent.replace(/\s+/g,' ').trim()).filter(Boolean);
}
function assistantActions(){
 return [...routes.map(x=>({...x,keywords:x.label})),...packageActions.filter(x=>x.key!=='assistant')].filter(available);
}
function dialogBase(id,title,description){
 let dialog=document.getElementById(id);
 if(dialog){dialog.showModal?.();return {dialog,body:dialog.querySelector('.aq-owner-modal-body')};}
 dialog=document.createElement('dialog');dialog.id=id;dialog.className='aq-owner-modal';
 dialog.innerHTML=`<form method="dialog" class="aq-owner-modal-head"><div><strong>${title}</strong><small>${description}</small></div><button value="close" aria-label="إغلاق">×</button></form><div class="aq-owner-modal-body"></div>`;
 document.body.appendChild(dialog);dialog.showModal?.();return {dialog,body:dialog.querySelector('.aq-owner-modal-body')};
}
function openAssistant(){
 if(!authReady())return false;
 const {dialog,body}=dialogBase('aqOwnerAssistant','المساعد الذكي','مساعد تشغيلي آمن داخل المنصة؛ لا يرسل بياناتك إلى مزود ذكاء خارجي.');
 body.replaceChildren();
 const input=document.createElement('input');input.type='search';input.placeholder='مثال: افتح العقود، تقرير المالك، المطابقة المالية…';input.autocomplete='off';
 const answer=document.createElement('p');answer.className='aq-owner-assistant-answer';
 const list=document.createElement('div');list.className='aq-owner-assistant-results';
 body.append(input,answer,list);
 const render=()=>{
  const q=normalize(input.value),all=assistantActions();
  const summaryRequested=q&&/(ملخص|ارقام|أرقام|اليوم|المحفظه|المحفظة)/.test(q);
  answer.textContent=summaryRequested?(visibleDashboardSummary().join(' • ')||'لا توجد مؤشرات ظاهرة ضمن صلاحية الحساب الحالية.'):'اختر خدمة أو اكتب ما تريد فتحه.';
  const matches=(q?all.filter(item=>normalize(item.label+' '+(item.keywords||'')).includes(q)||q.split(/\s+/).every(part=>normalize(item.label+' '+(item.keywords||'')).includes(part))):all).slice(0,12);
  list.replaceChildren();
  for(const item of matches){
   const button=document.createElement('button');button.type='button';button.textContent=item.label;
   button.onclick=()=>{dialog.close?.();runDefinition(item);};list.appendChild(button);
  }
  if(!matches.length){const empty=document.createElement('p');empty.textContent='لم أجد مسارًا مطابقًا. جرّب اسم القسم أو الخدمة.';list.appendChild(empty);}
 };
 input.addEventListener('input',render);
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();list.querySelector('button')?.click();}});
 render();setTimeout(()=>input.focus(),0);return true;
}
function openArchiveCenter(){
 if(!authReady())return false;
 const {dialog,body}=dialogBase('aqOwnerArchive','الأرشفة والبحث','تجميع لمسارات البحث والأرشيف الموجودة بدون إنشاء نسخة ثانية من البيانات.');
 body.replaceChildren();
 const defs=[
  {label:'البحث الشامل',run:()=>document.querySelector('[data-v199-action="search"]')?.click()},
  {label:'المستندات والعقود',def:{route:'documentsHub'}},
  {label:'الأرشيف المالي',def:{id:'aq267-financial-archive'}},
  {label:'المستندات الرسمية',def:{id:'aq267-official-document-center'}},
  {label:'أرشيف الأصول والمرفقات',def:{service:'original_documents'}}
 ];
 const grid=document.createElement('div');grid.className='aq-owner-assistant-results';
 for(const item of defs){
  const button=document.createElement('button');button.type='button';button.textContent=item.label;
  button.onclick=()=>{dialog.close?.();if(item.run)item.run();else runDefinition(item.def);};grid.appendChild(button);
 }
 body.append(grid);return true;
}
function mountGuestPreview(){
 const card=document.querySelector('#aqariCloudGateV168 .aq-v168-login');if(!card||document.getElementById('aqariGuestPreview'))return;
 const button=document.createElement('button');button.type='button';button.id='aqariGuestPreview';button.className='aq-owner-guest-button';button.textContent='معاينة كضيف — بدون بيانات';
 button.addEventListener('click',()=>{
  const {body}=dialogBase('aqOwnerGuest','معاينة الضيف','استعراض عام للمنصة بدون دخول وبدون قراءة أي بيانات أو مستندات خاصة.');
  body.innerHTML='<div class="aq-owner-guest-grid"><article><strong>العقارات والتحصيل</strong><small>نظرة على مسارات الإدارة دون بيانات فعلية.</small></article><article><strong>الصيانة والمهام</strong><small>تعرف على دورة المتابعة والتنبيهات.</small></article><article><strong>التقارير والموافقات</strong><small>معاينة للمزايا فقط؛ كل البيانات تبقى خلف تسجيل الدخول والصلاحيات.</small></article></div>';
 });
 card.appendChild(button);
}
function refreshMounts(){
 if(document.body.classList.contains('aq-live-stable'))return;
 if(!authReady()){mountGuestPreview();return;}
 ensureCss();document.body.classList.add(OWNER_CLASS);mountRail();mountTopSearch();mountCommandBar();syncAvailability();syncActiveRail();
 if(!observer){
  observer=new MutationObserver(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(document.body.classList.contains('aq-live-stable'))return;mountRail();mountTopSearch();mountCommandBar();syncAvailability();syncActiveRail();},80);});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
 }
 if(!mounted){mounted=true;window.AQARI_OWNER_REFERENCE=Object.freeze({version:'V267-owner-reference-1',openAssistant,openArchiveCenter,refresh:refreshMounts});}
}
function boot(){ensureCss();document.body.classList.add(OWNER_CLASS);mountGuestPreview();refreshMounts();setTimeout(refreshMounts,450);setTimeout(refreshMounts,1300);}
window.addEventListener('aqari:auth-boundary',event=>{if(event?.detail?.state==='ready')setTimeout(refreshMounts,0);});
window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&authReady()){event.preventDefault();openAssistant();}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

