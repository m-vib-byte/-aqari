import {runAssistantTask} from './components/assistant-request.js';
import {startBotProtection} from './bot-protection.js';
import {installSearchEvents} from './components/search-events.js';
import {createUnitSearch,openSearchUnit} from './api/unit-search.js';
import {installExactNavigationEvents} from './components/exact-navigation-events.js';
async function runNavigationAction({scope:scopeCheck,action,report}){
 if(!scopeCheck()){report('تعذر فتح الخدمة.',true);return false;}
 report('');
 try{
  const result=await action();
  if(result===false){report('تعذر فتح الخدمة.',true);return false;}
  return true;
 }catch{report('تعذر فتح الخدمة.',true);return false;}
}
import {installTouchNavigation} from './components/touch-navigation.js';
import {openQuickTenantEntry} from './components/quick-tenant-entry.js';
import {uiError,isUiError} from './components/ui-error.js';
import {t,message,direction,getLocale} from './components/locale.js';
const RELEASE='V267';
const ROOT_ID='aqOwnerExactShell';
const PRIMARY=new Set(['home','properties','tenants','collectionProPage','maintenanceProPage']);
const ROUTES=[
 {key:'home',label:'الرئيسية',route:'home',icon:'home'},
 {key:'services',label:'جميع الخدمات',special:'services',icon:'grid'},
 {key:'properties',label:'العقارات',route:'properties',icon:'building'},
 {key:'units',label:'الوحدات',service:'unit_readiness',fallback:'properties',icon:'building'},
 {key:'tenants',label:'المستأجرون',route:'tenants',icon:'user'},
 {key:'contracts',label:'العقود',service:'rental_contracts',icon:'file'},
 {key:'collections',label:'المدفوعات',route:'collectionProPage',icon:'wallet'},
 {key:'expenses',label:'المصروفات والتحصيل',service:'financial_register',icon:'receipt'},
 {key:'owners',label:'الملاك والشركاء',service:'partner_distributions',icon:'user'},
 {key:'maintenance',label:'الصيانة والطلبات الفنية',route:'maintenanceProPage',icon:'tool'},
 {key:'boards',label:'التقارير ولوحات',service:'kpi_dashboard',icon:'list'},
 {key:'documents',label:'الفواتير والأرشيف',route:'documentsHub',icon:'archive'},
 {key:'legal',label:'القضايا والإخلاءات',service:'operations_center',icon:'user'},
 {key:'employees',label:'الموظفون والرواتب',service:'employees_payroll',icon:'briefcase'},
 {key:'reports',label:'التقارير والإحصائيات',route:'reports',icon:'chart'},
 {key:'activity',label:'سجل النشاط والتدقيق',service:'control_center',icon:'list'},
 {key:'compliance',label:'الامتثال القانوني والالتزام',service:'compliance_center',icon:'file'},
 {key:'tenant',label:'بوابة المستأجر',href:'/tenant.html',icon:'user'},
 {key:'settings',label:'الإعدادات',route:'settingsCenterPage',icon:'settings'}
];
const icons={
 home:'<path d="M3 11 12 3l9 8v10H5V11M9 21v-7h6v7"/>',building:'<path d="M4 21h16M6 21V5h12v16M9 8h2m2 0h2M9 12h2m2 0h2M9 16h6"/>',grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',file:'<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5"/>',wallet:'<path d="M3 7h18v13H3zM3 7V5a2 2 0 0 1 2-2h12M16 13h3"/>',receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h5"/>',tool:'<path d="M14.5 6.5a4 4 0 0 0-5-5L7 4l3 3 2.5-2.5a4 4 0 0 0 2 5L5 19a2 2 0 1 0 3 3l9.5-9.5a4 4 0 0 0 5-2l-3 2-3-3 2-3a4 4 0 0 0-4 0z"/>',briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',list:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',chart:'<path d="M4 20V4M4 20h16M8 17v-5M12 17V8M16 17v-9M20 17V5"/>',archive:'<path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6"/>',bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 6-3 9h18c0-3-3-2-3-9M10 21h4"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1L19 18l2-3.5-2.1-1.5c.1-.3.1-.7.1-1z"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',spark:'<path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',plus:'<path d="M12 5v14M5 12h14"/>'};
const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.file}</svg>`;
const scope=()=>{try{const c=window.AQARI_SUPABASE?.context,m=c?.membership,d=window.AQARI_DATA_GATE?.scope,s=window.AQARI_EARLY_STORAGE_GATE?.scope;if(!document.documentElement.classList.contains('aqari-auth-unlocked')||m?.is_active!==true||m.user_id!==c?.user?.id||m.workspace_id!==c?.workspace?.id||d?.userId!==c?.user?.id||d?.workspaceId!==c?.workspace?.id||s?.userId!==c?.user?.id||s?.workspaceId!==c?.workspace?.id)return null;return {user:c.user.id,workspace:c.workspace.id,role:m.role,name:c.profile?.display_name||c.user?.email||t('المستخدم')};}catch{return null;}};
const visible=el=>{if(!el||el.hidden)return false;const style=window.getComputedStyle?.(el);return !style||(style.display!=='none'&&style.visibility!=='hidden');};
const routePage=route=>document.getElementById(route==='properties'||route==='tenants'?'list':route);
const sectionLabel=route=>ROUTES.find(x=>x.route===route)?.label||({'reports':'التقارير والإحصائيات','documentsHub':'المستندات والأرشيف','settingsCenterPage':'الإعدادات'})[route]||'القسم';
let routeFlight=0;
const waitPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function setStatus(text,bad=false){
 const getById=typeof document?.getElementById==='function'?document.getElementById.bind(document):()=>null;
 const el=getById('aqExactStatus');if(el){el.textContent=t(text||'');el.classList?.toggle?.('bad',bad);}
 let notice=getById('aqNavigationNotice');
 if(!notice&&text&&typeof document?.createElement==='function'&&typeof document?.body?.append==='function'){
  notice=document.createElement('div');notice.id='aqNavigationNotice';notice.setAttribute?.('role','status');notice.setAttribute?.('aria-live','polite');
  if(notice.style)notice.style.cssText='position:fixed;top:72px;left:16px;right:16px;max-width:520px;margin:auto;z-index:1100;padding:14px;border:1px solid #b49354;border-radius:12px;background:#fffaf0;color:#453728;box-shadow:0 6px 24px #0002;font:16px/1.6 system-ui';
  document.body.append(notice);
 }
 if(notice){notice.textContent=t(text||'');notice.hidden=!text;notice.setAttribute?.('role',bad?'alert':'status');}
}
function exactRouteReady(route){const page=routePage(route);if(!visible(page))return false;if(PRIMARY.has(route)&&window.AQARI_V205)return document.body.getAttribute('data-v205-route')===route;return true;}
function decoratePage(route){const page=routePage(route);if(!page||route==='home')return;let head=page.querySelector(':scope > .aq-exact-section-head');if(!head){head=document.createElement('header');head.className='aq-exact-section-head';page.prepend(head);}head.innerHTML=`<div><span>AQARI ${RELEASE}</span><h1>${escapeText(t(sectionLabel(route)))}</h1><p>${t('صفحة مستقلة ضمن صلاحيات الحساب الحالية.')}</p></div><button type="button" data-exact-route="home">${t('العودة للرئيسية')}</button>`;head.querySelector('button').onclick=()=>navigateRoute('home');}
async function navigateRoute(route){
 if(!scope())return false;const token=++routeFlight;const bound=JSON.stringify(scope());const current=()=>token===routeFlight&&bound===JSON.stringify(scope());setStatus('');
 window.dispatchEvent(new CustomEvent('aqari:navigation-start'));
 const v205=window.AQARI_V205;try{if(PRIMARY.has(route)&&typeof v205?.navigate==='function')v205.navigate(route);else if(typeof window.go==='function')window.go(route);}catch{}
 await waitPaint();if(!current())return false;
 if(!exactRouteReady(route)){try{if(typeof window.AQARI_V199_BASE_GO==='function')window.AQARI_V199_BASE_GO(route);else if(typeof window.go==='function')window.go(route);}catch{}await waitPaint();if(!current())return false;}
 if(PRIMARY.has(route)&&v205&&document.body.getAttribute('data-v205-route')!==route){try{v205.navigate(route);}catch{}await waitPaint();if(!current())return false;}
 if(!exactRouteReady(route)){setStatus(message('تعذر فتح صفحة {section}. أعد المحاولة.',{section:t(sectionLabel(route))}),true);return false;}
 document.body.dataset.aqExactRoute=route;decoratePage(route);syncActive();const page=routePage(route);page?.scrollIntoView?.({block:'start',behavior:'auto'});window.dispatchEvent(new CustomEvent('aqari:owner-final-route',{detail:{route}}));return true;
}
function serviceButton(def){if(def.id){const e=document.getElementById(def.id);if(visible(e))return e;}if(def.service){const candidates=[...document.querySelectorAll(`[data-aq267-label="${CSS?.escape?.(def.service)||def.service}"]`)];const e=candidates.find(visible)||((def.service==='rental_contracts'||def.service==='employees_payroll')?candidates.find(button=>!button.disabled&&!button.hidden):null);if(e)return e;}return null;}
async function waitForRuntimeMount(check,timeout=1800){
 const deadline=Date.now()+timeout;
 while(scope()&&Date.now()<deadline){
  try{const value=check();if(value)return value;}catch{}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 try{return check()||null;}catch{return null;}
}
async function waitForServiceButton(def,timeout=1800){
 const immediate=serviceButton(def);if(immediate)return immediate;
 return new Promise(resolve=>{
  let done=false,timer=0,observer=null;
  const finish=value=>{if(done)return;done=true;if(timer)clearTimeout(timer);observer?.disconnect?.();resolve(value||null);};
  const check=()=>{if(!scope())return finish(null);const found=serviceButton(def);if(found)finish(found);};
  try{observer=new MutationObserver(check);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style','data-aq267-label']});}catch{}
  timer=setTimeout(()=>finish(serviceButton(def)),timeout);check();
 });
}
async function openPropertyAction(name=null){
 if(!scope())return false;
 const api=window.AQARI_PROPERTY_EXPERIENCE||await waitForRuntimeMount(()=>window.AQARI_PROPERTY_EXPERIENCE);
 try{
  if(name===null){if(!api?.canWrite?.()||typeof api.openOnboarding!=='function')throw Error('PROPERTY_ACTION_UNAVAILABLE');return (await api.openOnboarding())!==false;}
  if(typeof name!=='string'||!name.trim()||typeof api?.openCompleteFileByName!=='function')throw Error('PROPERTY_ACTION_UNAVAILABLE');
  return (await api.openCompleteFileByName(name.trim()))!==false;
 }catch{setStatus(t('تعذر فتح الخدمة.'),true);return false;}
}

async function openMaintenanceAction(){
 if(!scope())return false;const m=await import('./pages/maintenance-request-create.js');await m.openMaintenanceRequest();return true;
}
async function openUnitAction(){
 if(!scope())return false;
 const module=await import('./pages/unit-entry.js');
 if(!scope())return false;
 return module.openUnitEntry();
}
async function openTenantAction(){
 try{return await openQuickTenantEntry({scope,navigate:navigateRoute,ready:exactRouteReady,page:routePage,visible});}
 catch{setStatus(t('تعذر فتح الخدمة.'),true);return false;}
}
async function openServicesDirectory(){
 if(!scope())return false;
 const dispatch=()=>{const event=new CustomEvent('aqari:open-services',{cancelable:true});document.dispatchEvent(event);return event.defaultPrevented;};
 if(dispatch())return true;
 await waitForRuntimeMount(()=>document.getElementById('aq267-workspace-tools'));
 if(!scope())return false;
 const opened=dispatch();if(!opened)setStatus('هذه الخدمة غير متاحة لصلاحية الحساب الحالية.',true);return opened;
}
async function openDefinition(def){if(!scope())return false;if(def.special==='services')return openServicesDirectory();if(def.special==='tasks')return import('./pages/owner-task-center.js?release='+RELEASE).then(m=>m.openOwnerTaskCenter());if(def.special==='assistant')return openAssistant();if(def.special==='receipts')return openRecordSearch();if(def.special==='property_create')return openPropertyAction();if(def.special==='tenant_create')return openTenantAction();if(def.special==='maintenance_create')return openMaintenanceAction();if(def.special==='experience')return import('./pages/owner-experience-settings.js?release='+RELEASE).then(m=>m.openOwnerExperienceSettings());if(def.href){window.location.assign(def.href);return true;}if(def.route)return navigateRoute(def.route);const button=serviceButton(def)||await waitForServiceButton(def);if(button){button.click();return true;}if(def.fallback)return navigateRoute(def.fallback);setStatus('هذه الخدمة غير متاحة لصلاحية الحساب الحالية.',true);return false;}
function syncActive(){const route=document.body.dataset.aqExactRoute||document.body.getAttribute('data-v205-route')||'home';document.querySelectorAll('[data-exact-key]').forEach(button=>{const def=ROUTES.find(x=>x.key===button.dataset.exactKey);button.classList.toggle('active',Boolean(def?.route&&def.route===route));});}
const escapeText=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function userName(){return String(scope()?.name||t('المستخدم')).split('•')[0].trim();}
function metric(selector,fallback='—'){const text=document.querySelector(selector)?.textContent?.trim();return text||fallback;}
function extractCount(pattern){const all=[...document.querySelectorAll('.v199-kpi,.aq267-counter-card')];const card=all.find(x=>pattern.test(x.textContent||''));const value=card?.querySelector('.v199-kpi-value,dd,strong')?.textContent?.trim();return value||'—';}
function refreshMetrics(){const map={income:metric('.v199-kpi-grid .v199-kpi:nth-child(1) .v199-kpi-value'),collected:metric('.v199-kpi-grid .v199-kpi:nth-child(2) .v199-kpi-value'),overdue:metric('.v199-kpi-grid .v199-kpi:nth-child(3) .v199-kpi-value'),maintenance:metric('.v199-kpi-grid .v199-kpi:nth-child(4) .v199-kpi-value'),properties:extractCount(/العقارات المسجلة|عقار مسجل/),contracts:extractCount(/العقود الفعالة|العقود الفعّالة/)};for(const [key,value] of Object.entries(map)){const el=document.querySelector(`[data-exact-metric="${key}"]`);if(el)el.textContent=value;}const rate=(document.querySelector('.v199-kpi-grid .v199-kpi:nth-child(2) .v199-kpi-trend')?.textContent||'').match(/\d+(?:\.\d+)?/);const progress=document.getElementById('aqExactCollectionProgress');if(progress&&rate)progress.style.setProperty('--rate',Math.max(0,Math.min(100,Number(rate[0])))+'%');const rateText=document.getElementById('aqExactCollectionRate');if(rateText)rateText.textContent=rate?rate[0]+'%':'—';refreshPropertyCards();}
function refreshPropertyCards(){const host=document.getElementById('aqExactProperties');if(!host)return;const rows=[...document.querySelectorAll('.v199-property-row')].slice(0,4);host.replaceChildren();if(!rows.length){const empty=document.createElement('p');empty.className='aq-exact-empty';empty.textContent=t('تظهر العقارات هنا من بيانات المحفظة المصرح بها.');host.append(empty);return;}for(const row of rows){const card=document.createElement('button');card.type='button';card.className='aq-exact-property-card';card.innerHTML=`<div class="aq-exact-property-art">${svg('building')}</div><strong data-aq-record>${escapeText(row.querySelector('strong')?.textContent||t('عقار'))}</strong><small data-aq-record>${escapeText(row.querySelector('.v199-property-units')?.textContent||'')}</small><span data-aq-record>${escapeText(row.querySelector('.v199-property-income')?.textContent||'')}</span>`;card.onclick=()=>navigateRoute('properties');host.append(card);}}
function railMarkup(){return `<aside id="aqOwnerExactRail" class="aq-exact-rail"><div class="aq-exact-logo"><span>${svg('building')}</span><strong>عقاري</strong><small>AQARI</small><p>${t('إدارة أملاك .. استثمار أفضل')}</p></div><nav data-aq-reference-navigation="true">${ROUTES.map(x=>`<button type="button" data-exact-key="${x.key}" aria-label="${escapeText(t(x.label))}">${svg(x.icon)}<b>${escapeText(t(x.label))}</b><span class="aq-ref-chevron" aria-hidden="true">‹</span></button>`).join('')}</nav><div class="aq-exact-support"><span>${svg('spark')}</span><strong>${t('المساعدة والدعم')}</strong><button type="button" data-exact-special="assistant">${t('اسأل المساعد')}</button></div><small class="aq-exact-version">AQARI ${RELEASE}</small></aside>`;}
function topMarkup(){const date=new Intl.DateTimeFormat(getLocale()==='ar'?'ar-KW':getLocale(),{dateStyle:'full',timeZone:'Asia/Kuwait'}).format(new Date());return `<header id="aqOwnerExactTop" class="aq-exact-top"><button type="button" class="aq-exact-profile" data-v199-action="more" aria-haspopup="menu" aria-controls="v199MoreMenu" aria-expanded="false"><span class="aq-exact-avatar" data-aq-record>${escapeText(Array.from(userName())[0]||'')}</span><span><strong data-aq-record>${escapeText(userName())}</strong><small>${t(scope()?.role==='general_manager'?'المدير العام':'حساب مصرح')}</small></span></button><div class="aq-exact-top-icons"><button type="button" data-exact-special="tasks" aria-label="${escapeText(t('التنبيهات'))}">${svg('bell')}</button><button type="button" data-exact-special="assistant" aria-label="${escapeText(t('مساعد AQARI الذكي'))}">${svg('list')}</button></div><time class="aq-ref-date">${svg('list')}<span>${escapeText(date)}</span></time><span class="aq-ref-top-space"></span><button type="button" class="aq-ref-theme" data-exact-special="experience" aria-label="${escapeText(t('إعدادات المظهر'))}">☼</button><button type="button" class="aq-exact-language" data-exact-route="settingsCenterPage">${getLocale().toUpperCase()}</button></header>`;}

function heroSearchMarkup(){return `<form id="aqExactHeroSearch" class="aq-exact-hero-search"><label for="aqExactHeroQuestion"><span class="aq-exact-search-badge" aria-hidden="true">AI</span>${t('البحث الذكي')}</label><div class="aq-exact-hero-search-field"><input id="aqExactHeroQuestion" type="search" maxlength="1200" required placeholder="${escapeText(t('ابحث عن عقار، مستأجر، عقد، رقم شقة…'))}"><button type="submit" aria-label="${escapeText(t('بحث'))}">${svg('search')}</button></div><div class="aq-exact-hero-shortcuts"><button type="button" data-exact-route="properties">${svg('building')}<span>${t('العقارات')}</span></button><button type="button" data-exact-service="rental_contracts">${svg('file')}<span>${t('العقود')}</span></button><button type="button" data-exact-route="collectionProPage">${svg('wallet')}<span>${t('التحصيل')}</span></button><button type="button" data-exact-route="maintenanceProPage">${svg('tool')}<span>${t('الصيانة')}</span></button><button type="button" data-exact-route="reports">${svg('chart')}<span>${t('التقارير')}</span></button></div></form>`;}
async function searchFromHero(event){
 event.preventDefault();
 const input=document.getElementById('aqExactHeroQuestion'),question=input?.value.trim();
 if(!question||!scope())return;
 const normalize=value=>String(value).normalize('NFKC').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ');
 const command=normalize(question).replace(/^(?:افتح|فتح|open)\s+/,'');
 const def=ROUTES.find(item=>[item.label,t(item.label)].some(label=>normalize(label)===command));
 const opened=def?await openDefinition(def):await openRecordSearch(question);
 if(opened&&input.value.trim()===question)input.value='';
}
async function openRecordSearch(question=''){
 if(!scope())return false;
 // Open after the originating click has passed the legacy outside-click closer.
 await new Promise(resolve=>setTimeout(resolve,0));
 if(!scope())return false;
 const api=typeof window.AQARI_V209?.open==='function'?window.AQARI_V209:await waitForRuntimeMount(()=>typeof window.AQARI_V209?.open==='function'?window.AQARI_V209:null);
 if(typeof api?.open==='function'&&await api.open(question)!==false)return true;
 setStatus('تعذر فتح الخدمة.',true);return false;
}
function heroMarkup(){return `<section class="aq-exact-hero"><div class="aq-exact-hero-copy"><span>${t('مرحباً مجدداً')}</span><h1 data-aq-record>${escapeText(userName())}</h1><p>${t('إدارة ذكية .. عوائد أكثر .. لمستقبل أفضل')}</p></div>${heroSearchMarkup()}<img class="aq-exact-hero-photo" src="/src/v267/assets/dashboard-hero.png" alt="" width="2163" height="727" fetchpriority="high"><div class="aq-exact-hero-promise"><strong>${t('العقار، أكثر من إدارة')}<br>${t('إن استثمارك في مستقبل أفضل')}</strong><p>${t('ممتلكاتك .. قيمة تدوم')}</p><div><button type="button" data-exact-route="properties">${svg('building')}<small>${t('العقارات')}</small></button><button type="button" data-exact-service="rental_contracts">${svg('file')}<small>${t('إنشاء عقد')}</small></button><button type="button" data-exact-special="tenant_create">${svg('user')}<small>${t('إضافة مستأجر')}</small></button><button type="button" data-exact-route="reports">${svg('chart')}<small>${t('التقارير')}</small></button></div></div></section>`;}
function homeMarkup(){return `<section id="aqOwnerExactHome" class="aq-exact-home">${heroMarkup()}<section class="aq-exact-kpis"><article><span>${svg('wallet')}</span><small>${t('إجمالي الدخل')}</small><strong data-exact-metric="income">—</strong></article><article><span>${svg('chart')}</span><small>${t('إجمالي التحصيل')}</small><strong data-exact-metric="collected">—</strong></article><article><span>${svg('building')}</span><small>${t('العقارات')}</small><strong data-exact-metric="properties">—</strong></article><article><span>${svg('file')}</span><small>${t('العقود الفعّالة')}</small><strong data-exact-metric="contracts">—</strong></article><article><span>${svg('receipt')}</span><small>${t('المتأخرات')}</small><strong data-exact-metric="overdue">—</strong></article><article><span>${svg('tool')}</span><small>${t('الصيانة المفتوحة')}</small><strong data-exact-metric="maintenance">—</strong></article></section><section class="aq-exact-dashboard"><article class="aq-exact-panel aq-exact-alerts"><header><h2>${t('التنبيهات والمهام')}</h2><button data-exact-special="tasks">${t('عرض الكل')}</button></header><button data-exact-special="tasks">${t('عقود وانتهاءات تحتاج متابعة')}</button><button data-exact-special="tasks">${t('تحصيلات ومهام اليوم')}</button><button data-exact-special="tasks">${t('طلبات الصيانة المفتوحة')}</button></article><article class="aq-exact-panel aq-exact-collection"><header><h2>${t('التحصيل الشهري')}</h2><button data-exact-route="collectionProPage">${t('فتح التحصيل')}</button></header><div id="aqExactCollectionProgress" class="aq-exact-progress"><div><strong id="aqExactCollectionRate">—</strong><small>${t('نسبة التحصيل الحالية')}</small></div></div></article><article class="aq-exact-panel aq-exact-units"><header><h2>${t('المحفظة')}</h2><button data-exact-route="properties">${t('تفاصيل العقارات')}</button></header><div class="aq-exact-donut"><span>${svg('building')}</span></div><p>${t('الأرقام المعروضة أعلاه تأتي من السجلات المصرح بها فقط.')}</p></article></section><section class="aq-exact-panel aq-exact-properties"><header><h2>${t('عقاراتي')}</h2><button data-exact-route="properties">${t('عرض الكل')}</button></header><div id="aqExactProperties" class="aq-exact-property-grid"></div></section><section class="aq-exact-quick"><button data-exact-service="rental_contracts">${svg('file')}<span>${t('إنشاء عقد')}</span></button><button data-exact-special="tenant_create">${svg('user')}<span>${t('إضافة مستأجر')}</span></button><button data-exact-special="property_create">${svg('building')}<span>${t('إضافة عقار')}</span></button><button data-exact-special="maintenance_create">${svg('tool')}<span>${t('طلب صيانة')}</span></button><button data-exact-special="receipts">${svg('wallet')}<span>${t('إصدار وصل')}</span></button><button data-exact-special="assistant" class="primary">${svg('spark')}<span>${t('إجراء سريع')}</span></button></section><p id="aqExactStatus" class="aq-exact-status" role="status" aria-live="polite"></p></section>`;}
function bottomMarkup(){
 const items=[['home','الرئيسية'],['collections','التحصيل'],['properties','العقارات'],['maintenance','الصيانة'],['services','المزيد']];
 return `<nav id="aqOwnerExactBottom" class="aq-exact-bottom">${items.map(([key,label])=>{const x=ROUTES.find(r=>r.key===key);return `<button type="button" data-exact-key="${key}" aria-label="${escapeText(t(label))}">${svg(x.icon)}<small>${escapeText(t(label))}</small></button>`;}).join('')}</nav>`;
}
function mountShell(){
 if(!scope())return;
 if(!document.getElementById(ROOT_ID)){
  document.body.insertAdjacentHTML('beforeend',`<div id="${ROOT_ID}">${railMarkup()}${topMarkup()}${bottomMarkup()}</div>`);
 }
 const home=document.getElementById('home');
 if(home&&!document.getElementById('aqOwnerExactHome')){
  home.insertAdjacentHTML('afterbegin',homeMarkup());
 }
 if(document.getElementById('aqOwnerExactHome')&&!document.body.classList.contains('aq-owner-exact-ready'))document.body.classList.add('aq-owner-exact-ready');
}
function dispatchExactClick(event){const key=event.target.closest('[data-exact-key]')?.dataset.exactKey;if(key){const def=ROUTES.find(x=>x.key===key);if(def)return openDefinition(def);return false;}const route=event.target.closest('[data-exact-route]')?.dataset.exactRoute;if(route){return navigateRoute(route);}const special=event.target.closest('[data-exact-special]')?.dataset.exactSpecial;if(special){if(special==='assistant')return openAssistant();else if(special==='receipts')return openRecordSearch();else if(special==='property_create')return openPropertyAction();else if(special==='unit_create')return openUnitAction();else if(special==='tenant_create')return openTenantAction();else if(special==='maintenance_create')return openMaintenanceAction();else if(special==='tasks')return import('./pages/owner-task-center.js?release='+RELEASE).then(m=>m.openOwnerTaskCenter());else if(special==='experience')return import('./pages/owner-experience-settings.js?release='+RELEASE).then(m=>m.openOwnerExperienceSettings());return;}const service=event.target.closest('[data-exact-service]')?.dataset.exactService;if(service)return openDefinition({service});}
function handleExactClick(event){
 const trigger=event.target?.closest?.('[data-exact-key],[data-exact-route],[data-exact-special],[data-exact-service]');if(!trigger)return;
 routeFlight++;window.dispatchEvent(new CustomEvent('aqari:navigation-start'));
 return runNavigationAction({scope,action:()=>dispatchExactClick(event),report:setStatus});
}

async function openAssistant(question=''){checkAssistantBoundary();const s=scope();if(!s)return false;let dialog=document.getElementById('aqExactAssistant');if(!dialog){dialog=document.createElement('dialog');dialog.id='aqExactAssistant';dialog.className='aq-exact-assistant';dialog.innerHTML=`<form method="dialog" class="aq-exact-modal-head"><div>${svg('spark')}<span><strong>${t('المساعد الذكي التوليدي')}</strong><small>${t('مرتبط بصلاحيات حسابك، والعمليات الحساسة تبقى داخل صفحاتها الأصلية.')}</small></span></div><button value="close">×</button></form><div class="aq-exact-chat"><div id="aqExactChatLog" class="aq-exact-chat-log"><p>${t('اكتب سؤالك أو اطلب شرح قسم. المساعد للقراءة والإرشاد ولا ينفذ حفظاً أو اعتماداً نيابةً عنك.')}</p></div><form id="aqExactChatForm"><input id="aqExactChatInput" maxlength="1200" placeholder="${escapeText(t('مثال: ما الذي يحتاج متابعتي في التحصيل؟'))}"><button>${t('إرسال')}</button></form></div>`;dialog.dataset.scope=assistantIdentity(s);dialog.addEventListener('close',cancelAssistant);dialog.addEventListener('cancel',cancelAssistant);document.body.append(dialog);dialog.querySelector('form#aqExactChatForm').onsubmit=sendAssistant;}dialog.lang=getLocale();dialog.dir=direction();dialog.showModal?.();if(typeof question==='string'&&question.trim()){dialog.querySelector('#aqExactChatInput').value=question.trim().slice(0,1200);dialog.querySelector('#aqExactChatForm').requestSubmit();}setTimeout(()=>dialog.querySelector('#aqExactChatInput')?.focus(),0);return true;}
let assistantRequest=null;
const assistantIdentity=s=>s?JSON.stringify([s.user,s.workspace,s.role]):'';
function cancelAssistant(){assistantRequest?.controller.abort();}
function checkAssistantBoundary(){
 const dialog=document.getElementById('aqExactAssistant');
 if(dialog&&dialog.dataset.scope!==assistantIdentity(scope())){cancelAssistant();dialog.close();dialog.remove();}
}
async function sendAssistant(event){
 event.preventDefault();
 const input=document.getElementById('aqExactChatInput'),log=document.getElementById('aqExactChatLog'),dialog=document.getElementById('aqExactAssistant'),question=input?.value.trim(),s=scope();
 if(!question||!s||assistantRequest||!dialog?.open)return;
 const request={controller:new AbortController(),identity:assistantIdentity(s)};
 assistantRequest=request;
 const button=document.getElementById('aqExactChatForm')?.querySelector('button');
 if(button)button.disabled=true;
 const mine=document.createElement('p');mine.className='me';mine.dataset.aqRecord='';mine.textContent=question;log.append(mine);input.value='';
 const pending=document.createElement('p');pending.textContent=t('جارٍ إعداد الرد…');log.append(pending);
 const check=()=>{if(request.controller.signal.aborted||assistantIdentity(scope())!==request.identity||!dialog.open)throw Error('ASSISTANT_CANCELLED');};
 try{
  const data=await runAssistantTask(async signal=>{
   const auth=await window.AQARI_SUPABASE?.getSession?.();check();
   if(!auth?.access_token||auth.user?.id!==s.user)throw uiError(t('انتهت الجلسة.'));
   const summary=[...document.querySelectorAll('#aqLiveStability [data-live-value]')].map(x=>`${x.closest('article')?.querySelector('span')?.textContent||''}: ${x.textContent}`).filter(Boolean);
   const response=await fetch('/api/owner-assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspace_id:s.workspace,expected_role:s.role,question,current_route:document.body.dataset.aqExactRoute||'home',section_context:[],visible_summary:summary}),cache:'no-store',signal});
   check();const data=await response.json();check();
   if(!response.ok)throw uiError(t(['AI_PROVIDER_NOT_CONFIGURED','OPENAI_NOT_CONFIGURED'].includes(data?.error)?'مزود الذكاء التوليدي غير مهيأ على الخادم حتى الآن.':data?.error==='ASSISTANT_DISABLED'?'المساعد متوقف من إعدادات المدير العام.':'تعذر الحصول على رد آمن من المساعد.'));
   if(typeof data?.answer!=='string'||!data.answer.trim())throw Error('ASSISTANT_EMPTY_RESPONSE');
   return data;
  },request.controller);
  check();pending.dataset.aqRecord='';pending.textContent=data.answer;
 }catch(error){
  if(pending.isConnected&&assistantIdentity(scope())===request.identity){pending.textContent=isUiError(error)?error.message:t('تعذر الحصول على رد آمن من المساعد.');pending.classList.add('bad');}
 }finally{
  if(assistantRequest===request){assistantRequest=null;if(button?.isConnected)button.disabled=false;}
 }
}
function interceptLegacy(event){const button=event.target.closest?.('[data-v199-go]');if(!button||button.closest('#'+ROOT_ID)||button.closest('#aqOwnerExactHome'))return;const route=button.dataset.v199Go;if(!route||!['home','properties','tenants','collectionProPage','maintenanceProPage','reports','documentsHub','settingsCenterPage'].includes(route))return;event.preventDefault();event.stopImmediatePropagation();navigateRoute(route);}
function ensureCss(){if(document.getElementById('aqari-owner-feedback-css'))return;const link=document.createElement('link');link.id='aqari-owner-feedback-css';link.rel='stylesheet';link.href='/src/v267/styles/owner-feedback-reference.css?release='+RELEASE;document.head.append(link);}
function refresh(){if(!scope())return;mountShell();if(document.body.classList.contains('aq-live-stable'))return;refreshMetrics();syncActive();}
function isExactSourceMutation(record){const target=record.target?.nodeType===3?record.target.parentElement:record.target;return !target?.closest?.('#aqOwnerExactShell,#aqOwnerExactHome,.aq-exact-section-head');}
function boot(){void startBotProtection().catch(()=>{});installTouchNavigation(window);installSearchEvents(window,{ready:scope,submit:event=>runNavigationAction({scope,action:()=>searchFromHero(event),report:setStatus}),shortcut:()=>runNavigationAction({scope,action:()=>openRecordSearch(),report:setStatus})});installExactNavigationEvents(window,handleExactClick);ensureCss();document.addEventListener('click',interceptLegacy,true);refresh();setTimeout(refresh,450);setTimeout(refresh,1400);const observer=new MutationObserver(records=>{if(!records.some(isExactSourceMutation))return;clearTimeout(window.__aqExactRefresh);window.__aqExactRefresh=setTimeout(refresh,80);});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});window.addEventListener('aqari:auth-boundary',event=>{checkAssistantBoundary();if(event?.detail?.state==='ready')setTimeout(refresh,0);});window.AQARI_OWNER_EXACT=Object.freeze({version:'V267-owner-feedback-1',navigate:navigateRoute,status:setStatus,openProperty:openPropertyAction,createUnitSearch,openSearchUnit,assistant:openAssistant,refresh});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();




