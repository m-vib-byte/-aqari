const RELEASE='V267';
const ROOT_ID='aqUnifiedExperience';
const VIRTUAL_PREFIX='aqUnifiedPage-';
let accessCache=null,accessKey='',navigationFlight=0,observer=null;

const ICONS={
 home:'<path d="M3 11 12 3l9 8v10H5V11M9 21v-7h6v7"/>',
 collection:'<path d="M4 7h16v13H4zM4 7V5h14M15 13h4"/>',
 building:'<path d="M4 21h16M6 21V5h12v16M9 8h2m2 0h2M9 12h2m2 0h2M9 16h6"/>',
 units:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 file:'<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5"/>',
 receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h5"/>',
 tool:'<path d="M14.5 6.5a4 4 0 0 0-5-5L7 4l3 3 2.5-2.5a4 4 0 0 0 2 5L5 19a2 2 0 1 0 3 3l9.5-9.5a4 4 0 0 0 5-2l-3 2-3-3 2-3a4 4 0 0 0-4 0z"/>',
 archive:'<path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6"/>',
 briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
 chart:'<path d="M4 20V4M4 20h16M8 17v-5M12 17V8M16 17v-9M20 17V5"/>',
 bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 6-3 9h18c0-3-3-2-3-9M10 21h4"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1L19 18l2-3.5-2.1-1.5c.1-.3.1-.7.1-1z"/>',
 shield:'<path d="M12 3 4 6v6c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6zM9 12l2 2 4-5"/>',
 spark:'<path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.file}</svg>`;

const SECTIONS=[
 {key:'home',label:'الرئيسية',icon:'home',native:'home'},
 {key:'collections',label:'التحصيل',icon:'collection',native:'collectionProPage',permission:'collections'},
 {key:'properties',label:'العقارات',icon:'building',native:'properties',permission:'properties'},
 {key:'units',label:'الوحدات',icon:'units',actions:[['جاهزية الوحدات',{service:'unit_readiness'}],['ملف العقار والوحدات',{native:'properties'}],['إضافة/إدارة الوحدات',{native:'properties'}]]},
 {key:'tenants',label:'المستأجرون',icon:'user',native:'tenants',permission:'tenants'},
 {key:'contracts',label:'العقود',icon:'file',actions:[['إدارة العقود',{service:'rental_contracts'}],['مسح وربط عقد',{service:'contract_scan'}],['مراجعة العقود',{service:'lease_review'}],['العقود القريبة من الانتهاء',{service:'lease_expiry_report'}]]},
 {key:'receipts',label:'الوصولات',icon:'receipt',actions:[['فتح التحصيل وإصدار الوصل',{native:'collectionProPage'}],['المستندات الرسمية',{service:'official_documents'}],['الأرشيف المالي',{service:'financial_archive'}]]},
 {key:'maintenance',label:'الصيانة',icon:'tool',native:'maintenanceProPage',permission:'maintenance'},
 {key:'documents',label:'المستندات',icon:'archive',native:'documentsHub',permission:'documents'},
 {key:'expenses',label:'المصروفات والفواتير',icon:'receipt',actions:[['سجل المصروفات',{service:'financial_register'}],['الفواتير والخدمات',{service:'maintenance_utilities'}],['المطابقة المالية',{module:'./pages/bank-reconciliation.js',exportName:'openBankReconciliation'}],['الأرشيف المالي',{service:'financial_archive'}]]},
 {key:'staff',label:'الموظفون والرواتب',icon:'briefcase',actions:[['الموظفون والرواتب',{service:'employees_payroll'}],['صلاحيات الموظفين',{service:'staff_access'}],['التعاميم',{service:'staff_circulars'}]]},
 {key:'reports',label:'التقارير',icon:'chart',native:'reports',permission:'reports'},
 {key:'owners',label:'الملاك والشركاء',icon:'user',actions:[['الملاك والشركاء',{service:'partner_access'}],['التوزيعات والحصص',{service:'partner_distributions'}],['كشف العقار',{service:'property_statements'}],['تقرير المالك',{module:'./pages/owner-report.js',exportName:'openOwnerReport'}]]},
 {key:'manager',label:'مركز المدير العام',icon:'shield',manager:true,actions:[['المسميات والأقسام',{module:'./pages/control-center.js',exportName:'openControlCenter'}],['صلاحيات الموظفين',{service:'staff_access'}],['إعدادات المساعد والضيف وتقارير الملاك',{module:'./pages/owner-experience-settings.js',exportName:'openOwnerExperienceSettings'}],['مركز الموافقات',{module:'./pages/approval-center.js',exportName:'openApprovalCenter'}],['مركز الأمان',{service:'security_center'}]]},
 {key:'settings',label:'الإعدادات',icon:'settings',native:'settingsCenterPage'},
 {key:'tenantPortal',label:'بوابة المستأجر',icon:'user',external:'/tenant.html?release=V267'}
];
const NATIVE_PAGE={home:'home',properties:'list',tenants:'list',collectionProPage:'collectionProPage',maintenanceProPage:'maintenanceProPage',reports:'reports',documentsHub:'documentsHub',settingsCenterPage:'settingsCenterPage'};
const NATIVE_PERMISSION={properties:'properties',tenants:'tenants',collectionProPage:'collections',maintenanceProPage:'maintenance',reports:'reports',documentsHub:'documents'};
const MOBILE_KEYS=['home','collections','properties','maintenance','more'];

function scope(){try{const c=window.AQARI_SUPABASE?.context,m=c?.membership,d=window.AQARI_DATA_GATE?.scope,s=window.AQARI_EARLY_STORAGE_GATE?.scope;if(!document.documentElement.classList.contains('aqari-auth-unlocked')||m?.is_active!==true||m.user_id!==c?.user?.id||m.workspace_id!==c?.workspace?.id||d?.userId!==c?.user?.id||d?.workspaceId!==c?.workspace?.id||s?.userId!==c?.user?.id||s?.workspaceId!==c?.workspace?.id)return null;return {user:c.user.id,workspace:c.workspace.id,role:m.role,name:c.profile?.display_name||c.user?.email||'المستخدم',key:`${c.user.id}|${c.workspace.id}|${m.role}`};}catch{return null;}}
function visible(el){if(!el||el.hidden||el.getAttribute('aria-hidden')==='true')return false;const style=window.getComputedStyle?.(el);return !style||(style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0');}
function nativePage(route){return document.getElementById(NATIVE_PAGE[route]||route);}
const waitPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function cssEscape(value){return globalThis.CSS?.escape?CSS.escape(String(value)):String(value).replace(/[\\"']/g,'\\$&');}
function userName(){return String(scope()?.name||'المستخدم').split('•')[0].trim();}
function moneyOrCount(selector,fallback='—'){const el=document.querySelector(selector);const text=el?.textContent?.replace(/\s+/g,' ').trim();return text||fallback;}
function metricByLabel(pattern,fallback='—'){const nodes=[...document.querySelectorAll('.v199-kpi,.aq267-counter-card,.aq-exact-kpis article,[data-kpi]')];const hit=nodes.find(x=>pattern.test(x.textContent||''));if(!hit)return fallback;const val=hit.querySelector('.v199-kpi-value,dd,strong,[data-value]')?.textContent?.replace(/\s+/g,' ').trim();return val||fallback;}

async function access(){const s=scope();if(!s)throw Error('ACCESS_DENIED');if(accessCache&&accessKey===s.key)return accessCache;const client=await window.AQARI_SUPABASE?.getClient?.();if(!client)throw Error('ACCESS_DENIED');const result=await client.rpc('aqari_workspace_access',{p_workspace_id:s.workspace});const data=result?.data??result;if(result?.error)throw result.error;if(data?.user_id!==s.user||data?.workspace_id!==s.workspace||data?.role!==s.role)throw Error('ACCESS_DENIED');accessCache=data;accessKey=s.key;return data;}
function canRead(section,a){return !section||a?.permissions?.[section]?.read===true;}
function serviceButton(key){return [...document.querySelectorAll(`[data-aq267-label="${cssEscape(key)}"]`)].find(visible)||null;}
async function runAction(action){if(action.native)return openNative(action.native);if(action.service){const button=serviceButton(action.service);if(!button)throw Error('هذه الوظيفة غير متاحة لصلاحيات الحساب الحالية.');button.click();return true;}if(action.module){const mod=await import(action.module+'?release='+RELEASE);if(typeof mod?.[action.exportName]!=='function')throw Error('الخدمة غير جاهزة.');mod[action.exportName]();return true;}if(action.external){window.open(action.external,'_blank','noopener');return true;}return false;}

async function callNativeRouters(route){let called=false;try{if(typeof window.AQARI_OWNER_FINAL?.navigate==='function'){const ok=await window.AQARI_OWNER_FINAL.navigate(route);called=ok!==false;}}catch{}await waitPaint();if(!visible(nativePage(route))){try{if(typeof window.AQARI_V199_BASE_GO==='function'){window.AQARI_V199_BASE_GO(route);called=true;}else if(typeof window.go==='function'){window.go(route);called=true;}}catch{}await waitPaint();}if(['home','properties','tenants','collectionProPage','maintenanceProPage'].includes(route)&&window.AQARI_V205&&document.body.getAttribute('data-v205-route')!==route){try{window.AQARI_V205.navigate?.(route);called=true;}catch{}await waitPaint();}return called;}
async function openNative(route){const token=++navigationFlight;const a=await access();const permission=NATIVE_PERMISSION[route];if(!canRead(permission,a))throw Error('هذا القسم غير متاح لصلاحيات حسابك الحالية.');await callNativeRouters(route);if(token!==navigationFlight)return false;const page=nativePage(route);if(!visible(page))throw Error('تعذر فتح صفحة القسم الفعلية.');hideVirtualPages();decorateNativePage(route,page);document.body.dataset.aqUnifiedSection=SECTIONS.find(x=>x.native===route)?.key||route;syncNav();page.scrollIntoView?.({block:'start',behavior:'auto'});return true;}
function hideNativePages(){for(const page of document.querySelectorAll('main.w > .p'))page.classList.remove('on');}
function hideVirtualPages(){document.querySelectorAll('.aq-unified-page').forEach(p=>{p.hidden=true;p.classList.remove('on');});}
function showVirtualPage(section){hideNativePages();hideVirtualPages();const page=ensureVirtualPage(section);page.hidden=false;page.classList.add('on');document.body.dataset.aqUnifiedSection=section.key;syncNav();page.scrollIntoView?.({block:'start',behavior:'auto'});return true;}
async function openSection(key){if(key==='more')return openMore();const section=SECTIONS.find(x=>x.key===key);if(!section)return false;const a=await access();if(section.manager&&scope()?.role!=='general_manager')throw Error('هذا القسم للمدير العام فقط.');if(section.permission&&!canRead(section.permission,a))throw Error('هذا القسم غير متاح لصلاحيات حسابك الحالية.');if(section.native)return openNative(section.native);if(section.external)return runAction({external:section.external});return showVirtualPage(section);}

function pageHeader(title,subtitle){return `<header class="aq-unified-page-head"><div><span>AQARI ${RELEASE}</span><h1>${title}</h1><p>${subtitle}</p></div><button type="button" data-unified-section="home">العودة للرئيسية</button></header>`;}
function decorateNativePage(route,page){
 if(route==='home')return;
 page.classList.add('aq-unified-native-page');
 const head=page.querySelector(':scope > .aq-unified-page-head');
 if(head?.dataset.aqariNativeRoute===route)return;
 const section=SECTIONS.find(x=>x.native===route),container=document.createElement('div');
 container.innerHTML=pageHeader(section?.label||'القسم','إدارة وتشغيل '+(section?.label||'القسم')+' من صفحة واضحة وموحدة.');
 const next=container.firstElementChild;next.dataset.aqariNativeRoute=route;
 if(head)head.replaceWith(next);else page.prepend(next);
}
function actionCard(label,action,index){const key=`action-${index}`;return `<button type="button" class="aq-unified-action-card" data-unified-action="${key}"><span>${icon(index%3===0?'file':index%3===1?'chart':'tool')}</span><strong>${label}</strong><small>فتح الوظيفة الأصلية دون إنشاء نسخة مكررة من البيانات.</small></button>`;}
function ensureVirtualPage(section){let page=document.getElementById(VIRTUAL_PREFIX+section.key);if(page)return page;const main=document.querySelector('main.w')||document.querySelector('main');if(!main)throw Error('تعذر إنشاء صفحة القسم.');page=document.createElement('section');page.id=VIRTUAL_PREFIX+section.key;page.className='p aq-unified-page';page.hidden=true;page.innerHTML=pageHeader(section.label,'صفحة تشغيل موحدة تجمع الوظائف الأصلية المرتبطة بهذا القسم.')+`<div class="aq-unified-section-grid">${(section.actions||[]).map((x,i)=>actionCard(x[0],x[1],i)).join('')}</div><section class="aq-unified-preserve"><strong>حماية الوظائف الحالية</strong><p>جميع الأزرار في هذه الصفحة تفتح مسارات AQARI الأصلية مع نفس الصلاحيات والحفظ وسجل التدقيق؛ هذه الصفحة تنظيمية فقط.</p></section>`;main.appendChild(page);page.addEventListener('click',event=>{const home=event.target.closest('[data-unified-section]')?.dataset.unifiedSection;if(home){event.preventDefault();openSection(home);return;}const key=event.target.closest('[data-unified-action]')?.dataset.unifiedAction;if(!key)return;const index=Number(key.split('-')[1]);const action=section.actions?.[index]?.[1];if(action)runAction(action).catch(error=>setStatus(error.message,true));});return page;}

function setStatus(text,bad=false){const node=document.getElementById('aqUnifiedStatus');if(node){node.textContent=text||'';node.classList.toggle('is-bad',Boolean(bad));}}
function metricCard(label,value,iconName,tone=''){return `<article class="aq-unified-metric ${tone}"><span>${icon(iconName)}</span><div><small>${label}</small><strong>${value}</strong></div></article>`;}
function dashboardMarkup(){return `<section id="${ROOT_ID}" class="aq-unified-dashboard" aria-label="لوحة إدارة عقاري">
 <header class="aq-unified-hero"><div class="aq-unified-hero-copy"><span>مرحباً مجدداً</span><h1>${userName()}</h1><p>إدارة عقارك بهدوء ووضوح من مكان واحد.</p><div class="aq-unified-hero-actions"><button data-unified-section="properties">عرض العقارات</button><button data-unified-section="collections">فتح التحصيل</button></div></div><div class="aq-unified-hero-visual"><span>إدارة احترافية</span><strong>التشغيل أولاً، والمعلومة في مكانها.</strong></div></header>
 <section class="aq-unified-metrics" data-unified-metrics></section>
 <section class="aq-unified-board">
  <article class="aq-unified-panel aq-unified-collection"><header><div><small>التحصيل</small><h2>اليوم وهذا الشهر</h2></div><button data-unified-section="collections">عرض التفاصيل</button></header><div class="aq-unified-collection-grid"><div><span>تحصيل اليوم</span><strong data-unified-value="today">—</strong></div><div><span>المستحق هذا الشهر</span><strong data-unified-value="due">—</strong></div><div><span>المحصل</span><strong data-unified-value="collected">—</strong></div><div class="danger"><span>المتبقي / المتأخر</span><strong data-unified-value="overdue">—</strong></div></div></article>
  <article class="aq-unified-panel aq-unified-alerts"><header><div><small>المتابعة</small><h2>العقود والصيانة والتنبيهات</h2></div><button data-unified-section="maintenance">الصيانة</button></header><div class="aq-unified-alert-list" data-unified-alerts><p>تُقرأ التنبيهات من الواجهة التشغيلية الحالية.</p></div></article>
  <article class="aq-unified-panel aq-unified-portfolio"><header><div><small>المحفظة</small><h2>العقارات والوحدات</h2></div><button data-unified-section="properties">كل العقارات</button></header><div class="aq-unified-property-preview" data-unified-properties></div></article>
  <article class="aq-unified-panel aq-unified-operations"><header><div><small>الحركة</small><h2>آخر العمليات</h2></div><button data-unified-section="reports">التقارير</button></header><div class="aq-unified-activity" data-unified-activity><p>تظهر آخر الحركات المتاحة حسب صلاحيات الحساب.</p></div></article>
  <article class="aq-unified-panel aq-unified-ai"><header><div><small>قراءة فقط</small><h2>مساعد AQARI الذكي</h2></div><span class="aq-unified-ai-badge">AI</span></header><p>يساعدك في قراءة المؤشرات والوصول للأقسام المسموحة، بدون تعديل أو حذف أو اعتماد أو حركة مالية.</p><button data-unified-special="assistant">فتح المساعد</button></article>
  <article class="aq-unified-panel aq-unified-owner-report"><header><div><small>WhatsApp + Email</small><h2>تقرير المالك التلقائي</h2></div><span>${icon('receipt')}</span></header><p>اختيار المالك والعقارات والقنوات والتوقيت من مركز المدير العام.</p><button data-unified-special="experience">إدارة التقارير</button></article>
  <article class="aq-unified-panel aq-unified-finance"><header><div><small>الأداء المالي</small><h2>المصروفات وصافي التشغيل</h2></div><button data-unified-section="expenses">فتح المالية</button></header><div class="aq-unified-finance-values"><div><span>المصروفات</span><strong data-unified-value="expenses">—</strong></div><div><span>صافي التشغيل</span><strong data-unified-value="net">—</strong></div></div></article>
  <article class="aq-unified-panel aq-unified-quick"><header><div><small>مختصرة وواضحة</small><h2>إجراءات سريعة</h2></div></header><div class="aq-unified-quick-grid"><button data-unified-section="properties">${icon('building')}<span>العقارات</span></button><button data-unified-section="tenants">${icon('user')}<span>المستأجرون</span></button><button data-unified-section="contracts">${icon('file')}<span>العقود</span></button><button data-unified-section="receipts">${icon('receipt')}<span>الوصولات</span></button><button data-unified-section="maintenance">${icon('tool')}<span>الصيانة</span></button><button data-unified-section="documents">${icon('archive')}<span>المستندات</span></button></div></article>
 </section><p id="aqUnifiedStatus" role="status" aria-live="polite"></p>
 </section>`;}
function mountDashboard(){const home=document.getElementById('aqOwnerExactHome')||document.getElementById('home');if(!home||document.getElementById(ROOT_ID))return;home.insertAdjacentHTML('afterbegin',dashboardMarkup());home.addEventListener('click',event=>{const key=event.target.closest('[data-unified-section]')?.dataset.unifiedSection;if(key){event.preventDefault();openSection(key).catch(error=>setStatus(error.message,true));return;}const special=event.target.closest('[data-unified-special]')?.dataset.unifiedSpecial;if(special==='assistant')document.querySelector('[data-exact-special="assistant"]')?.click();if(special==='experience')import('./pages/owner-experience-settings.js?release='+RELEASE).then(m=>m.openOwnerExperienceSettings());});refreshDashboard();}
function refreshDashboard(){if(document.body.classList.contains('aq-live-stable'))return;const root=document.getElementById(ROOT_ID);if(!root)return;const metrics=root.querySelector('[data-unified-metrics]');if(metrics){const data=[['تحصيل اليوم',metricByLabel(/تحصيل اليوم|اليوم.*تحصيل/),'collection','success'],['تحصيل الشهر',metricByLabel(/إجمالي التحصيل|المحصل|تحصيل الشهر/),'collection','success'],['المستحق',metricByLabel(/المستحق|الإيراد المتوقع/),'receipt',''],['المتأخر',metricByLabel(/المتأخر/),'receipt','danger'],['العقارات',metricByLabel(/العقارات المسجلة|إجمالي العقارات/),'building',''],['الوحدات',metricByLabel(/الوحدات/),'units',''],['العقود',metricByLabel(/العقود الفعالة|العقود النشطة/),'file',''],['الصيانة المفتوحة',metricByLabel(/الصيانة|بلاغ/),'tool','']];metrics.innerHTML=data.map(x=>metricCard(...x)).join('');}
 const set=(key,value)=>{const el=root.querySelector(`[data-unified-value="${key}"]`);if(el)el.textContent=value;};set('today',metricByLabel(/تحصيل اليوم|اليوم.*تحصيل/));set('due',metricByLabel(/المستحق|الإيراد المتوقع/));set('collected',metricByLabel(/إجمالي التحصيل|المحصل|تحصيل الشهر/));set('overdue',metricByLabel(/المتأخر|المتبقي/));set('expenses',metricByLabel(/المصروفات/));set('net',metricByLabel(/الصافي|صافي التشغيل/));
 const alerts=root.querySelector('[data-unified-alerts]');if(alerts){const rows=[...document.querySelectorAll('.v199-alert,.aq267-alert,[data-alert],.v199-notification-row')].filter(visible).slice(0,5);alerts.replaceChildren();if(rows.length)for(const row of rows){const p=document.createElement('button');p.type='button';p.textContent=(row.textContent||'').replace(/\s+/g,' ').trim();p.onclick=()=>openSection('manager');alerts.appendChild(p);}else alerts.innerHTML='<p>لا توجد تنبيهات ظاهرة ضمن صلاحيات الحساب الحالية.</p>';}
 const properties=root.querySelector('[data-unified-properties]');if(properties){const rows=[...document.querySelectorAll('.v199-property-row')].slice(0,3);properties.replaceChildren();if(rows.length)for(const row of rows){const b=document.createElement('button');b.type='button';b.innerHTML=`<span>${icon('building')}</span><div><strong>${row.querySelector('strong')?.textContent||'عقار'}</strong><small>${row.querySelector('.v199-property-units')?.textContent||'فتح ملف العقار'}</small></div>`;b.onclick=()=>openSection('properties');properties.appendChild(b);}else properties.innerHTML='<p>تظهر العقارات من المحفظة المصرح بها.</p>';}
 const activity=root.querySelector('[data-unified-activity]');if(activity){const rows=[...document.querySelectorAll('.v199-activity-row,.aq267-audit-row,[data-audit-row]')].filter(visible).slice(0,5);activity.replaceChildren();if(rows.length)for(const row of rows){const p=document.createElement('p');p.textContent=(row.textContent||'').replace(/\s+/g,' ').trim();activity.appendChild(p);}else activity.innerHTML='<p>آخر العمليات محفوظة في سجلات النظام وتظهر هنا عند توفرها لصلاحيات الحساب.</p>';}}

function desktopNavMarkup(){return SECTIONS.filter(x=>!['tenantPortal','receipts'].includes(x.key)).map(x=>`<button type="button" data-unified-section="${x.key}">${icon(x.icon)}<b>${x.label}</b></button>`).join('');}
function mountDesktopNav(){const rail=document.querySelector('.aq-exact-rail');if(!rail)return;const nav=rail.querySelector('nav');if(nav&&!nav.dataset.unified){nav.dataset.unified='true';nav.innerHTML=desktopNavMarkup();}rail.classList.add('aq-unified-rail');}
function mountMobileNav(){if(document.getElementById('aqUnifiedMobileNav'))return;const nav=document.createElement('nav');nav.id='aqUnifiedMobileNav';nav.className='aq-unified-mobile-nav';nav.setAttribute('aria-label','التنقل الرئيسي للجوال');nav.innerHTML=MOBILE_KEYS.map(key=>{const s=SECTIONS.find(x=>x.key===key);return `<button type="button" data-unified-section="${key}">${icon(s?.icon||'more')}<b>${s?.label||'المزيد'}</b></button>`;}).join('');document.body.appendChild(nav);}
function openMore(){let dialog=document.getElementById('aqUnifiedMore');if(!dialog){dialog=document.createElement('dialog');dialog.id='aqUnifiedMore';dialog.className='aq-unified-more';dialog.innerHTML=`<form method="dialog" class="aq-unified-more-head"><strong>جميع الأقسام</strong><button value="close" aria-label="إغلاق">×</button></form><div class="aq-unified-more-grid">${SECTIONS.filter(x=>x.key!=='home').map(x=>`<button type="button" data-unified-section="${x.key}">${icon(x.icon)}<span>${x.label}</span></button>`).join('')}</div>`;document.body.appendChild(dialog);dialog.addEventListener('click',event=>{const key=event.target.closest('[data-unified-section]')?.dataset.unifiedSection;if(key){dialog.close?.();openSection(key).catch(error=>setStatus(error.message,true));}});}dialog.showModal?.();return true;}
function syncNav(){const key=document.body.dataset.aqUnifiedSection||'home';document.querySelectorAll('[data-unified-section]').forEach(b=>{if(b.closest('#aqUnifiedMore'))return;b.classList.toggle('active',b.dataset.unifiedSection===key);});}
function intercept(event){const button=event.target.closest?.('[data-unified-section]');if(!button||button.closest('#aqUnifiedMore'))return;const key=button.dataset.unifiedSection;if(!key)return;event.preventDefault();event.stopImmediatePropagation();openSection(key).catch(error=>setStatus(error.message,true));}
function reset(){accessCache=null;accessKey='';navigationFlight++;}
function applyGlobalPageClasses(){document.body.classList.add('aq-unified-experience');document.querySelectorAll('main.w > .p').forEach(page=>page.classList.add('aq-unified-page-surface'));}
let dashboardRefreshQueued=false;
function watch(){
 observer?.disconnect?.();
 observer=new MutationObserver(records=>{
  if(document.body.classList.contains('aq-live-stable'))return;
  const externalMutation=records.some(record=>{
   const target=record?.target;
   return !target?.closest?.('#'+ROOT_ID);
  });
  if(!externalMutation||dashboardRefreshQueued)return;
  dashboardRefreshQueued=true;
  requestAnimationFrame(()=>{
   dashboardRefreshQueued=false;
   observer.disconnect();
   try{applyGlobalPageClasses();mountDashboard();refreshDashboard();mountDesktopNav();}
   finally{observer.observe(document.body,{subtree:true,childList:true});}
  });
 });
 observer.observe(document.body,{subtree:true,childList:true});
}
function boot(){if(!scope())return;applyGlobalPageClasses();mountDashboard();mountDesktopNav();mountMobileNav();document.addEventListener('click',intercept,true);window.addEventListener('aqari:auth-boundary',event=>{reset();if(event?.detail?.state==='ready')setTimeout(boot,0);});window.addEventListener('aqari:v267-controls-changed',reset);watch();document.body.dataset.aqUnifiedSection='home';syncNav();window.AQARI_UNIFIED_EXPERIENCE=Object.freeze({version:'V267-unified-layout-1',openSection,refresh:refreshDashboard,sections:SECTIONS.map(x=>x.key)});}
function waitForAuth(){if(scope())return boot();let tries=0;const timer=setInterval(()=>{if(scope()){clearInterval(timer);boot();}else if(++tries>160)clearInterval(timer);},125);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',waitForAuth,{once:true});else waitForAuth();


