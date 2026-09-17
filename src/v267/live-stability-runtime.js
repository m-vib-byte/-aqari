const RELEASE='V267';
const ROOT='aqLiveStability';
let refreshQueued=false,observer=null,dataKey='',dataFlight=0,dataSession=null,liveValues=null;

function scope(){
 try{
  const c=window.AQARI_SUPABASE?.context,m=c?.membership,d=window.AQARI_DATA_GATE?.scope,s=window.AQARI_EARLY_STORAGE_GATE?.scope;
  if(!document.documentElement.classList.contains('aqari-auth-unlocked')||m?.is_active!==true||m.user_id!==c?.user?.id||m.workspace_id!==c?.workspace?.id||d?.userId!==c?.user?.id||d?.workspaceId!==c?.workspace?.id||s?.userId!==c?.user?.id||s?.workspaceId!==c?.workspace?.id)return null;
  return {user:c.user.id,workspace:c.workspace.id,role:m.role};
 }catch{return null;}
}
function sourceNodes(selector){
 return [...document.querySelectorAll(selector)].filter(node=>!node.closest('#aqOwnerExactHome')&&!node.closest('#aqUnifiedExperience')&&!node.closest('#'+ROOT));
}
function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function sourceValue(pattern,fallback='—'){
 const candidates=sourceNodes('.v199-kpi,.aq267-counter-card,[data-kpi],.v210-kpis>*');
 const hit=candidates.find(node=>{const label=node.querySelector('.v199-kpi-label,dt,[data-kpi-label],span');return pattern.test(clean(label?.textContent));});
 if(!hit)return fallback;
 const value=hit.querySelector('.v199-kpi-value,dd,strong,[data-value]');
 return clean(value?.textContent)||fallback;
}
function makeMetric(label,key,tone=''){
 return `<article class="aq-live-metric ${tone}" data-live-card="${key}"><span>${label}</span><strong data-live-value="${key}">—</strong></article>`;
}
function dashboardMarkup(){
 return `<section id="${ROOT}" class="aq-live-stability" aria-label="ملخص التشغيل الفعلي">
  <p id="aqLiveDataStatus" role="status" aria-live="polite">جارٍ قراءة المؤشرات…</p><button type="button" id="aqLiveRefresh">تحديث المؤشرات</button><article class="aq-live-group aq-live-collections"><header><div><small>التحصيل</small><h2>اليوم وهذا الشهر</h2></div><button type="button" data-owner-final-route="collectionProPage">فتح التحصيل</button></header><div class="aq-live-metric-grid">
   ${makeMetric('تحصيل اليوم','today','success')}${makeMetric('تحصيل الشهر','month','success')}${makeMetric('المستحق','due')}${makeMetric('المتبقي','remaining')}${makeMetric('المتأخر','overdue','danger')}
  </div></article>
  <article class="aq-live-group aq-live-portfolio"><header><div><small>المحفظة</small><h2>العقارات والإشغال</h2></div><button type="button" data-owner-final-route="properties">العقارات</button></header><div class="aq-live-metric-grid">
   ${makeMetric('العقارات','properties')}${makeMetric('الوحدات','units')}${makeMetric('الإشغال','occupancy','success')}${makeMetric('المستأجرون','tenants')}
  </div></article>
  <article class="aq-live-group aq-live-followup"><header><div><small>المتابعة</small><h2>العقود والصيانة</h2></div><button type="button" data-owner-final-route="maintenanceProPage">الصيانة</button></header><div class="aq-live-metric-grid">
   ${makeMetric('العقود النشطة','contracts')}${makeMetric('قريبة الانتهاء','expiring')}${makeMetric('الصيانة المفتوحة','maintenance')}${makeMetric('التنبيهات','alerts','danger')}
  </div></article>
  <article class="aq-live-group aq-live-finance"><header><div><small>الأداء المالي</small><h2>المصروفات وصافي التشغيل</h2></div><button type="button" data-unified-section="expenses">فتح المالية</button></header><div class="aq-live-metric-grid">
   ${makeMetric('المصروفات','expenses')}${makeMetric('صافي التشغيل','net','success')}
  </div></article>
  <article class="aq-live-group aq-live-activity"><header><div><small>السجل</small><h2>أحدث العمليات</h2></div><button type="button" data-owner-final-route="reports">التقارير</button></header><div class="aq-live-activity-list" data-live-activity></div></article>
 </section>`;
}
function ensureDashboard(){
 const home=document.getElementById('aqOwnerExactHome');
 if(!home||document.getElementById(ROOT))return;
 const anchor=home.querySelector('.aq-exact-kpis')||home.querySelector('.aq-exact-hero');
 if(anchor)anchor.insertAdjacentHTML('afterend',dashboardMarkup());else home.insertAdjacentHTML('afterbegin',dashboardMarkup());
}
function setValue(key,value){
 const node=document.querySelector(`[data-live-value="${key}"]`);if(!node)return;
 const text=clean(value)||'—';if(node.textContent!==text)node.textContent=text;node.closest('[data-live-card]')?.classList.toggle('is-missing',text==='—');
}
function refreshMetrics(){
 const map={
  today:sourceValue(/تحصيل اليوم|اليوم.*تحصيل/i),
  month:sourceValue(/إجمالي التحصيل|تحصيل الشهر|المحصل.*الشهر/i),
  due:sourceValue(/المستحق|الإيراد المتوقع/i),
  remaining:sourceValue(/المتبقي/i),
  overdue:sourceValue(/المتأخر/i),
  properties:sourceValue(/العقارات المسجلة|إجمالي العقارات|عقار مسجل/i),
  units:sourceValue(/الوحدات/i),
  occupancy:sourceValue(/نسبة الإشغال|الإشغال/i),
  tenants:sourceValue(/المستأجرون|المستأجرين/i),
  contracts:sourceValue(/العقود الفعالة|العقود الفعّالة|العقود النشطة/i),
  expiring:sourceValue(/قريبة.*الانتهاء|تنتهي.*30|انتهاء.*30/i),
  maintenance:sourceValue(/الصيانة المفتوحة|بلاغات الصيانة|الصيانة/i),
  alerts:sourceValue(/التنبيهات|المهام/i),
  expenses:sourceValue(/المصروفات/i),
  net:sourceValue(/صافي التشغيل|الصافي/i)
 };
 for(const [key,value] of Object.entries(map))setValue(key,value);
 if(liveValues)for(const [key,value] of Object.entries(liveValues))setValue(key,formatMetric(key,value));
}
function formatMetric(key,value){
 if(value===null||value===undefined)return '—';
 const locale=document.documentElement.lang==='en'?'en-KW':'ar-KW';
 if(['today','month','due','remaining','expenses','net'].includes(key))return new Intl.NumberFormat(locale,{style:'currency',currency:'KWD',minimumFractionDigits:3}).format(value);
 return new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value)+(key==='occupancy'?'٪':'');
}
function clearLiveData(){dataFlight++;dataSession?.close();dataSession=null;dataKey='';liveValues=null;document.querySelectorAll('[data-live-value]').forEach(node=>{node.textContent='—';});}
async function loadLiveData(force=false){
 const bound=scope();if(!bound||!document.getElementById(ROOT))return;
 const key=JSON.stringify(bound);if(!force&&dataKey===key)return;
 clearLiveData();dataKey=key;const token=dataFlight;
 const status=document.getElementById('aqLiveDataStatus');if(status)status.textContent='جارٍ قراءة المؤشرات من السجلات المحفوظة…';
 const button=document.getElementById('aqLiveRefresh');if(button){button.disabled=true;button.onclick=()=>loadLiveData(true);}
 try{
  const [{createSession},{readManagementCounters,kuwaitDay},{readLiveDashboard}]=await Promise.all([import('./api/session.js'),import('./components/management-counters.js'),import('./components/live-dashboard-data.js')]);
  if(token!==dataFlight||JSON.stringify(scope())!==key)return;
  const session=createSession();dataSession=session;await session.connect();
  const report=await readLiveDashboard(session,kuwaitDay(),readManagementCounters);
  session.check();if(token!==dataFlight||JSON.stringify(scope())!==key)return;
  liveValues=report.values;for(const [name,value] of Object.entries(liveValues))setValue(name,formatMetric(name,value));
  if(status)status.textContent=(report.partial?'بعض المؤشرات غير متاحة؛ راجع الصلاحيات أو أعد التحديث. ':'تم تحديث المؤشرات من السجلات. ')+report.day;
 }catch{if(token===dataFlight&&status)status.textContent='تعذر قراءة المؤشرات. أعد التحديث؛ القيم غير المتاحة لا تُعد صفرًا.';}
 finally{if(token===dataFlight){dataSession?.close();dataSession=null;if(button)button.disabled=false;}}
}
function refreshActivity(){
 const host=document.querySelector('[data-live-activity]');if(!host)return;
 const rows=sourceNodes('.v199-activity-row,.aq267-audit-row,[data-audit-row]').map(row=>clean(row.textContent)).filter(Boolean).slice(0,6);
 host.replaceChildren();
 if(!rows.length){const p=document.createElement('p');p.className='aq-live-empty';p.textContent='لا توجد عمليات ظاهرة ضمن صلاحيات الحساب الحالية.';host.append(p);return;}
 for(const text of rows){const p=document.createElement('p');p.textContent=text;host.append(p);}
}
function refreshAlerts(){
 const host=document.querySelector('#aqOwnerExactHome .aq-exact-alerts');if(!host)return;
 const header=host.querySelector(':scope > header');
 const alerts=sourceNodes('.v199-alert,.aq267-alert,[data-alert],.v199-notification-row,.v199-priority-item').map(row=>clean(row.textContent)).filter(Boolean).slice(0,5);
 for(const node of [...host.children])if(node!==header)node.remove();
 if(!alerts.length){const p=document.createElement('p');p.className='aq-live-empty';p.textContent='لا توجد تنبيهات ظاهرة ضمن صلاحيات الحساب الحالية.';host.append(p);return;}
 for(const text of alerts){const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',()=>document.querySelector('[data-exact-special="tasks"]')?.click());host.append(button);}
}
function suppressDuplicateShells(){
 for(const selector of ['#aqUnifiedExperience','#aqUnifiedMobileNav','#aqOwnerReferenceRail','#aqOwnerReferenceCommand']){
  const node=document.querySelector(selector);if(!node)continue;node.hidden=true;node.setAttribute('aria-hidden','true');node.dataset.aqStabilitySuppressed='true';
 }
 document.body.classList.add('aq-live-stable');
}
function normalizePages(){
 const main=document.querySelector('main.w');if(!main)return;
 const active=[...main.querySelectorAll(':scope > .p.on')];
 for(const page of active){page.classList.add('aq-live-active-page');if(page.id!=='home')page.classList.add('aq-live-internal-page');}
 const home=document.getElementById('home');if(home?.classList.contains('on'))document.getElementById('aqOwnerExactHome')?.removeAttribute('hidden');
}
function refresh(){
 if(!scope())return;
 observer?.disconnect();
 try{suppressDuplicateShells();ensureDashboard();normalizePages();refreshMetrics();refreshActivity();refreshAlerts();loadLiveData();}
 finally{observeSources();}
}
function observeSources(){observer?.observe(document.body,{subtree:true,childList:true,characterData:true});}
function isSourceMutation(record){
 const target=record.target?.nodeType===3?record.target.parentElement:record.target;
 return !target?.closest?.('#aqOwnerExactHome,#aqOwnerExactShell,#aqUnifiedExperience,#aqUnifiedMobileNav,#aqOwnerReferenceRail,#aqOwnerReferenceCommand');
}
function schedule(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;refresh();});}
function boot(){
 if(!document.getElementById('aqari-live-stability-css')){const link=document.createElement('link');link.id='aqari-live-stability-css';link.rel='stylesheet';link.href='/src/v267/styles/live-stability.css?release='+RELEASE;document.head.appendChild(link);}
 refresh();
 observer?.disconnect?.();observer=new MutationObserver(records=>{if(records.some(isSourceMutation))schedule();});
 observeSources();
 window.addEventListener('aqari:auth-boundary',event=>{clearLiveData();if(event?.detail?.state==='ready')setTimeout(schedule,0);});
 window.addEventListener('aqari:owner-final-route',()=>setTimeout(schedule,0));
 window.AQARI_LIVE_STABILITY=Object.freeze({version:'V267-work1-stability-1',refresh:schedule});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

