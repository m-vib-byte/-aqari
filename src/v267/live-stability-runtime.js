const RELEASE='V267';
const ROOT='aqLiveStability';
let refreshQueued=false,observer=null,dataKey='',dataFlight=0,dataSession=null,liveValues=null;
let ui=value=>value,liveReport=null;

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
 return `<article class="aq-live-metric ${tone}" data-live-card="${key}"><span>${ui(label)}</span><strong data-live-value="${key}">—</strong></article>`;
}
function panel(title,body,cls,route=''){
 return `<article class="aq-live-panel ${cls}"><header><h2>${ui(title)}</h2>${route?`<button type="button" data-exact-route="${route}">${ui('عرض الكل')}</button>`:''}</header>${body}</article>`;
}
function dashboardMarkup(){
 return `<section id="${ROOT}" class="aq-live-stability" aria-label="${ui('لوحة الإدارة')}">
 <section class="aq-live-kpis">${makeMetric('تحصيل الشهر','month','success')}${makeMetric('المستحق','due')}${makeMetric('العقارات','properties')}${makeMetric('الوحدات المرتبطة','units')}${makeMetric('العقود النشطة','contracts')}${makeMetric('الصيانة المفتوحة','maintenance')}</section>
 <div class="aq-live-update"><span id="aqLiveDataStatus" role="status" aria-live="polite">${ui('جارٍ قراءة المؤشرات…')}</span><button type="button" id="aqLiveRefresh">${ui('تحديث')}</button></div>
 ${panel('العقارات','<div id="aqLiveProperties" class="aq-live-property-grid"></div>','aq-live-properties','properties')}
 ${panel('التحصيلات · هذا الشهر',`<div class="aq-live-table-scroll"><table><thead><tr>${['العقار / الوحدة','رقم العقد','المستحق','المحصل','المتبقي'].map(x=>`<th>${ui(x)}</th>`).join('')}</tr></thead><tbody id="aqLiveCollectionRows"></tbody></table></div><p class="aq-live-note">${ui('حسب شهر الاستحقاق؛ تحصيل الشهر أعلاه حسب تاريخ الدفع.')}</p><h3 class="aq-live-activity-title">${ui('أحدث العمليات')}</h3><div id="aqLiveRecentPayments"></div>`,'aq-live-collection-panel','collectionProPage')}
 ${panel('مساعد AQARI الذكي',`<div class="aq-live-assistant-body"><span class="aq-live-ai-mark">AI</span><h3>${ui('كيف أساعدك اليوم؟')}</h3><p>${ui('اسأل عن بياناتك أو متابعة التحصيل والعقود.')}</p><button type="button" data-exact-special="assistant">${ui('فتح المساعد')}</button><small>${ui('قراءة وإرشاد فقط؛ لا ينفذ عمليات مالية.')}</small></div>`,'aq-live-assistant')}
 ${panel('إجراءات سريعة',`<div class="aq-live-quick-grid"><button data-exact-route="tenants">♙<span>${ui('إضافة مستأجر')}</span></button><button data-exact-route="properties">⌂<span>${ui('إضافة عقار')}</span></button><button data-exact-service="rental_contracts">▤<span>${ui('إنشاء عقد')}</span></button><button data-exact-route="maintenanceProPage">⚒<span>${ui('طلب صيانة')}</span></button><button data-exact-route="collectionProPage">▣<span>${ui('فتح التحصيل')}</span></button><button data-exact-route="documentsHub">⇧<span>${ui('رفع مستند')}</span></button></div>`,'aq-live-quick-panel')}
 ${panel('التنبيهات والمتابعة','<div id="aqLiveFollowups" class="aq-live-followups"></div>','aq-live-alert-panel')}
 ${panel('تقارير الملاك',`<div class="aq-live-report-body"><div class="aq-live-paper" aria-hidden="true">▤</div><p>${ui('راجع كشوف العقار والتحصيل والمستندات المحفوظة.')}</p><button type="button" data-exact-route="reports">${ui('فتح التقارير')}</button></div>`,'aq-live-report')}
 <section class="aq-live-secondary">${makeMetric('تحصيل اليوم','today','success')}${makeMetric('المتبقي','remaining')}${makeMetric('المستأجرون','tenants')}${makeMetric('تنتهي خلال 30 يومًا','expiring')}${makeMetric('الإشغال المسجل','occupancy')}${makeMetric('المصروفات المعتمدة','expenses')}${makeMetric('صافي السجلات','net')}</section>
 <p class="aq-live-disclosure">${ui('المؤشرات تخص السجلات المرتبطة فقط. اكتمال المحفظة والدفاتر يحتاج مراجعة قبل الاعتماد.')}</p>
 </section>`;
}
function ensureDashboard(){
 const home=document.getElementById('aqOwnerExactHome');
 if(!home||document.getElementById(ROOT))return;
 const hero=home.querySelector('.aq-exact-hero');
 if(hero)hero.insertAdjacentHTML('afterend',dashboardMarkup());else home.insertAdjacentHTML('afterbegin',dashboardMarkup());
}
function setValue(key,value){
 const node=document.querySelector(`[data-live-value="${key}"]`);if(!node)return;
 const text=clean(value)||'—';if(node.textContent!==text)node.textContent=text;node.closest('[data-live-card]')?.classList.toggle('is-missing',text==='—');
}
function refreshMetrics(){
 if(liveValues)for(const [key,value] of Object.entries(liveValues))setValue(key,formatMetric(key,value));
}
function formatMetric(key,value){
 if(value===null||value===undefined)return '—';
 const locale=({ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'})[document.documentElement.lang]||'ar-KW';
 if(['today','month','due','remaining','expenses','net'].includes(key))return new Intl.NumberFormat(locale,{style:'currency',currency:'KWD',minimumFractionDigits:3}).format(value);
 return new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value)+(key==='occupancy'?'%':'');
}
function clearLiveData(){dataFlight++;dataSession?.close();dataSession=null;dataKey='';liveValues=null;liveReport=null;document.querySelectorAll('[data-live-value]').forEach(node=>{node.textContent='—';});}
async function loadLiveData(force=false){
 const bound=scope();if(!bound||!document.getElementById(ROOT))return;
 const key=JSON.stringify(bound);if(!force&&dataKey===key)return;
 clearLiveData();dataKey=key;const token=dataFlight;
 const status=document.getElementById('aqLiveDataStatus');if(status)status.textContent=ui('جارٍ قراءة المؤشرات…');
 const button=document.getElementById('aqLiveRefresh');if(button){button.disabled=true;button.onclick=()=>loadLiveData(true);}
 try{
  const [{createSession},{readManagementCounters,kuwaitDay},{readLiveDashboard}]=await Promise.all([import('./api/session.js'),import('./components/management-counters.js'),import('./components/live-dashboard-data.js')]);
  if(token!==dataFlight||JSON.stringify(scope())!==key)return;
  const session=createSession();dataSession=session;await session.connect();
  const report=await readLiveDashboard(session,kuwaitDay(),readManagementCounters);
  session.check();if(token!==dataFlight||JSON.stringify(scope())!==key)return;
  liveReport=report;liveValues=report.values;renderCollectionRows();renderPayments();renderFollowups();for(const [name,value] of Object.entries(liveValues))setValue(name,formatMetric(name,value));
  if(status)status.textContent=(report.partial?ui('بعض المؤشرات غير متاحة.'):ui('تم التحديث من السجلات.'))+' '+report.day;
 }catch{if(token===dataFlight&&status)status.textContent=ui('تعذر قراءة المؤشرات. أعد المحاولة.');}
 finally{if(token===dataFlight){dataSession?.close();dataSession=null;if(button)button.disabled=false;}}
}
function empty(host,message){const p=document.createElement('p');p.className='aq-live-empty';p.textContent=ui(message);host.replaceChildren(p);}
function renderCollectionRows(){
 const host=document.getElementById('aqLiveCollectionRows');if(!host)return;host.replaceChildren();
 const rows=liveReport?.collections?.lines;
 if(!Array.isArray(rows)||!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent=ui(Array.isArray(rows)?'لا توجد استحقاقات مسجلة لهذه الفترة.':'البيانات غير متاحة.');tr.append(td);host.append(tr);return;}
 for(const row of rows.slice(0,5)){
  const tr=document.createElement('tr');
  for(const value of [String(row.property_name??'')+' / '+String(row.unit_no??''),row.contract_no,formatMetric('due',row.due_amount),formatMetric('month',row.allocated_paid),formatMetric('remaining',row.remaining)]){
   const td=document.createElement('td');td.textContent=String(value??'—');td.dataset.aqRecord='';tr.append(td);
  }
  host.append(tr);
 }
}
function renderPayments(){
 const host=document.getElementById('aqLiveRecentPayments');if(!host)return;host.replaceChildren();
 const rows=liveReport?.payments;if(!Array.isArray(rows)||!rows.length){empty(host,Array.isArray(rows)?'لا توجد دفعات محفوظة.':'البيانات غير متاحة.');return;}
 for(const row of rows){const line=document.createElement('p'),date=document.createElement('span'),amount=document.createElement('b');line.className='aq-live-payment';date.textContent=String(row.paid_at??'').slice(0,10);amount.textContent=formatMetric('month',row.amount);line.append(date,amount);host.append(line);}
}
function renderFollowups(){
 const host=document.getElementById('aqLiveFollowups');if(!host)return;host.replaceChildren();
 for(const [label,key,route] of [['تنتهي خلال 30 يومًا','expiring','contracts'],['الصيانة المفتوحة','maintenance','maintenanceProPage'],['المتبقي','remaining','collectionProPage']]){
  const button=document.createElement('button');button.type='button';
  if(route==='contracts')button.dataset.unifiedSection='contracts';else button.dataset.exactRoute=route;
  const labelNode=document.createElement('span'),value=document.createElement('b');labelNode.textContent=ui(label);value.textContent=formatMetric(key,liveValues?.[key]);button.append(labelNode,value);host.append(button);
 }
 const button=document.createElement('button');button.type='button';button.dataset.exactSpecial='tasks';button.textContent=ui('فتح مركز التنبيهات');host.append(button);
}
function refreshPropertyCards(){
 const host=document.getElementById('aqLiveProperties');if(!host)return;
 const rows=sourceNodes('.v199-property-row').slice(0,2);
 const signature=JSON.stringify(rows.map(row=>row.textContent));if(host.dataset.signature===signature)return;host.dataset.signature=signature;
 host.replaceChildren();
 if(!rows.length){empty(host,'لا توجد عقارات ظاهرة ضمن صلاحياتك.');return;}
 for(const row of rows){
  const card=document.createElement('button');card.type='button';card.className='aq-live-property';card.dataset.exactRoute='properties';
  const art=document.createElement('div');art.className='aq-live-building-art';art.setAttribute('aria-hidden','true');art.innerHTML='<svg viewBox="0 0 160 90"><path d="M30 84V25L84 9v75M84 9l47 19v56"/><path d="M39 31l34-10M39 42l34-8M39 54l34-6M39 66l34-4M95 29l25 9M95 42l25 7M95 55l25 4M95 68l25 2M20 84h120"/></svg>';
  const name=document.createElement('strong');name.textContent=row.querySelector('strong')?.textContent||ui('العقار');name.dataset.aqRecord='';
  const action=document.createElement('small');action.textContent=ui('فتح ملف العقار');card.append(art,name,action);host.append(card);
 }
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
 try{suppressDuplicateShells();ensureDashboard();normalizePages();refreshMetrics();refreshPropertyCards();renderFollowups();loadLiveData();}
 finally{observeSources();}
}
function observeSources(){observer?.observe(document.body,{subtree:true,childList:true,characterData:true});}
function isSourceMutation(record){
 const target=record.target?.nodeType===3?record.target.parentElement:record.target;
 return !target?.closest?.('#aqOwnerExactHome,#aqOwnerExactShell,#aqUnifiedExperience,#aqUnifiedMobileNav,#aqOwnerReferenceRail,#aqOwnerReferenceCommand');
}
function schedule(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;refresh();});}
async function boot(){
 const locale=await import('./components/locale.js');ui=source=>locale.t(source);
 if(!document.getElementById('aqari-live-stability-css')){const link=document.createElement('link');link.id='aqari-live-stability-css';link.rel='stylesheet';link.href='/src/v267/styles/live-stability.css?release='+RELEASE;document.head.appendChild(link);}
 refresh();
 observer?.disconnect?.();observer=new MutationObserver(records=>{if(records.some(isSourceMutation))schedule();});
 observeSources();
 window.addEventListener('aqari:auth-boundary',event=>{clearLiveData();if(event?.detail?.state==='ready')setTimeout(schedule,0);});
 window.addEventListener('aqari:owner-final-route',()=>setTimeout(schedule,0));
 window.AQARI_LIVE_STABILITY=Object.freeze({version:'V267-work1-stability-1',refresh:schedule});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

