import {registeredUnitCount} from './components/live-dashboard-data.js';
import {workspaceIcon} from './components/workspace-icons.js';
const RELEASE='V267';
const ROOT='aqLiveStability';
let refreshQueued=false,observer=null,dataKey='',dataFlight=0,dataSession=null,liveValues=null;
let ui=value=>value,liveReport=null,referenceReport=null;
const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function withDeadline(load,timeout=8000){
 let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(load),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('MODULE_LOAD_TIMEOUT')),timeout);})
  ]);
 }finally{clearTimeout(timer);}
}
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
const METRIC_ACTIONS={properties:['route','properties'],units:['service','unit_readiness'],tenants:['route','tenants'],contracts:['service','rental_contracts'],month:['route','collectionProPage'],today:['route','collectionProPage'],due:['route','collectionProPage'],remaining:['route','collectionProPage'],overdue:['route','collectionProPage'],occupancy:['service','unit_readiness'],maintenance:['route','maintenanceProPage'],employees:['service','employees_payroll'],invoices:['service','maintenance_utilities'],expiring:['service','lease_expiry_report'],expenses:['service','financial_register'],net:['service','kpi_dashboard']};
function makeMetric(label,key,tone=''){
 const icon=({month:'wallet',today:'wallet',due:'file',properties:'building',units:'grid',contracts:'file',maintenance:'tool',remaining:'clock',tenants:'user',expiring:'clock',occupancy:'grid',expenses:'file',net:'chart',employees:'user',invoices:'file',overdue:'bell'})[key];
 const [kind,target]=METRIC_ACTIONS[key];
 return `<button type="button" class="aq-live-metric ${tone}" data-live-card="${key}" data-exact-${kind}="${target}" aria-label="${escapeText(ui(label))}"><i aria-hidden="true">${workspaceIcon(icon)}</i><span>${ui(label)}</span><strong data-live-value="${key}">—</strong></button>`;
}
function panel(title,body,cls,route=''){
 return `<article class="aq-live-panel ${cls}"><header><h2>${ui(title)}</h2>${route?`<button type="button" data-exact-route="${route}">${ui('عرض الكل')}</button>`:''}</header>${body}</article>`;
}
function refAction(label,kind,value,icon=''){
 return `<button type="button" data-exact-${kind}="${value}">${icon?workspaceIcon(icon):''}<span>${ui(label)}</span></button>`;
}
function referencePanel(title,body,key,kind='',value=''){
 return `<article class="aq-live-panel aq-ref-${key}"><header><h2>${ui(title)}</h2>${kind?refAction('عرض الكل',kind,value):''}</header>${body}</article>`;
}
function dashboardMarkup(){
 const loading='<p class="aq-live-empty">'+ui('جارٍ قراءة المؤشرات…')+'</p>';
 const section=(id)=>`<div id="${id}" class="aq-ref-list">${loading}</div>`;
 return `<section id="${ROOT}" class="aq-live-stability" aria-label="${ui('لوحة الإدارة')}">
 <section class="aq-live-kpis">${makeMetric('إجمالي العقارات','properties')}${makeMetric('إجمالي الوحدات','units')}${makeMetric('المستأجرون','tenants')}${makeMetric('العقود النشطة','contracts')}${makeMetric('إجمالي التحصيلات هذا الشهر','month','success')}${makeMetric('المبالغ المتأخرة','overdue','danger')}${makeMetric('نسبة الإشغال','occupancy','success')}${makeMetric('طلبات الصيانة المفتوحة','maintenance')}${makeMetric('الموظفون','employees')}${makeMetric('الفواتير المستحقة','invoices')}</section>
 <div class="aq-live-reference-grid">
 ${referencePanel('العقارات المميزة','<div id="aqLiveProperties" class="aq-live-property-grid"></div>','properties','route','properties')}
 ${referencePanel('التحصيل الشهري','<div id="aqLiveYearChart" class="aq-ref-chart">'+loading+'</div>','chart','route','collectionProPage')}
 ${referencePanel('توزيع الوحدات','<div id="aqLiveOccupancy" class="aq-ref-occupancy">'+loading+'</div>','occupancy')}
 ${referencePanel('العقود التي ستنتهي قريبًا',section('aqLiveExpiry'),'expiry','service','lease_expiry_report')}
 ${referencePanel('آخر التحديثات العقارية',`<div class="aq-ref-owner-report"><div class="aq-ref-report-mark">${workspaceIcon('file')}</div><div><p>${ui('راجع كشوف العقار والتحصيل والمستندات المحفوظة.')}</p>${refAction('تقارير الملاك','route','reports','chart')}${refAction('إعدادات التقارير والإرسال','special','experience')}</div></div>`,'report','route','reports')}
 ${referencePanel('الملاك والشركاء',`<div class="aq-ref-owner-select"><label for="aqLiveOwnerProperty">${ui('العقار')}</label><select id="aqLiveOwnerProperty" disabled><option>${ui('اختر العقار')}</option></select></div>${section('aqLiveOwners')}`,'owners','service','partner_distributions')}
 ${referencePanel('الفواتير والخدمات المستحقة',section('aqLiveUtilities'),'utilities','service','maintenance_utilities')}
 ${referencePanel('الدفع الإلكتروني',`<div class="aq-ref-payments"><strong class="aq-ref-knet" aria-label="KNET">KNET</strong><p>${ui('الدفع الإلكتروني بانتظار الربط الرسمي.')}</p><small>${ui('تحصيل الشهر')}</small><strong data-live-payment-total>—</strong>${refAction('عرض عمليات الدفع','route','collectionProPage')}</div>`,'payments')}
 ${referencePanel('القضايا والإخلاءات',section('aqLiveLegal'),'legal','service','operations_center')}
 ${referencePanel('مواعيد مهمة (الصيانات والتنبيهات)',section('aqLiveFollowups'),'tasks','special','tasks')}
 ${referencePanel('الفواتير والأرشيف والتعاميم',`<div class="aq-ref-short-list">${refAction('الفواتير المستحقة','service','maintenance_utilities','file')}${refAction('الأرشيف المالي','service','financial_archive','upload')}${refAction('تعاميم الموظفين','service','staff_circulars','bell')}</div>`,'documents','route','documentsHub')}
 ${referencePanel('النشاط الأخير في النظام',section('aqLiveRecentPayments'),'activity','route','collectionProPage')}
 ${referencePanel('حالة النظام',`<div class="aq-ref-system"><span class="aq-ref-health-mark">${workspaceIcon('cloud')}</span><div id="aqLiveSystemStatus">${loading}</div>${refAction('عرض حالة النظام','service','integration_center')}</div>`,'health')}
 ${referencePanel('بوابة المستأجر',`<div class="aq-ref-portal">${workspaceIcon('user')}<p>${ui('تمكّن المستأجرين من الوصول لعقودهم ومتابعة طلباتهم.')}</p><a href="/tenant.html">${ui('فتح بوابة المستأجر')}</a></div>`,'portal')}
 </div>
 <section class="aq-live-reference-quick"><h2>${ui('الإجراءات السريعة')}</h2><div>${refAction('إضافة عقار','special','property_create','building')}${refAction('إضافة وحدة','special','unit_create','grid')}${refAction('إضافة مستأجر','special','tenant_create','user')}${refAction('إنشاء عقد','service','rental_contracts','file')}${refAction('إصدار وصل','special','receipts','wallet')}${refAction('طلب صيانة','special','maintenance_create','tool')}${refAction('إرسال إشعار','service','property_notices','bell')}${refAction('إصدار تقرير','route','reports','chart')}</div></section>
 <div class="aq-live-update"><span id="aqLiveDataStatus" role="status" aria-live="polite">${ui('جارٍ قراءة المؤشرات…')}</span><button type="button" id="aqLiveRefresh">${ui('تحديث')}</button></div>
 <details class="aq-live-secondary-details"><summary>${ui('تفاصيل التحصيل والمحفظة')}</summary><section class="aq-live-secondary">${makeMetric('تحصيل اليوم','today','success')}${makeMetric('المستحق','due')}${makeMetric('المتبقي','remaining')}${makeMetric('تنتهي خلال 30 يومًا','expiring')}${makeMetric('المصروفات المعتمدة','expenses')}${makeMetric('صافي السجلات','net')}</section><div class="aq-live-table-scroll"><table><thead><tr>${['العقار / الوحدة','رقم العقد','المستحق','المحصل','المتبقي'].map(x=>`<th>${ui(x)}</th>`).join('')}</tr></thead><tbody id="aqLiveCollectionRows"></tbody></table></div></details>
 <footer class="aq-ref-footer"><span>AQARI © ${new Date().getFullYear()}</span><span>${ui('المؤشرات تخص السجلات المرتبطة فقط. اكتمال المحفظة والدفاتر يحتاج مراجعة قبل الاعتماد.')}</span></footer>
 </section>`;
}
function ensureDashboard(){
 const home=document.getElementById('aqOwnerExactHome');
 if(!home)return false;if(document.getElementById(ROOT))return true;
 const hero=home.querySelector('.aq-exact-hero');
 if(hero)hero.insertAdjacentHTML('afterend',dashboardMarkup());else home.insertAdjacentHTML('afterbegin',dashboardMarkup());
 return Boolean(document.getElementById(ROOT));
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
 if(['today','month','due','remaining','expenses','net','overdue'].includes(key))return new Intl.NumberFormat(locale,{style:'currency',currency:'KWD',minimumFractionDigits:3}).format(value);
 return new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value)+(key==='occupancy'?'%':'');
}
function clearLiveData(){dataFlight++;ownerFlight++;dataSession?.close();dataSession=null;dataKey='';liveValues=null;liveReport=null;referenceReport=null;refreshPropertyCards();document.querySelectorAll('[data-live-value]').forEach(node=>{node.textContent='—';});for(const id of ['aqLiveOwners','aqLiveUtilities','aqLiveExpiry','aqLiveLegal','aqLiveRecentPayments','aqLiveCollectionRows','aqLiveYearChart','aqLiveOccupancy','aqLiveSystemStatus'])document.getElementById(id)?.replaceChildren();const select=document.getElementById('aqLiveOwnerProperty');if(select){select.replaceChildren();select.disabled=true;}const total=document.querySelector('[data-live-payment-total]');if(total)total.textContent='—';}
async function loadLiveData(force=false){
 const bound=scope();if(!bound||!document.getElementById(ROOT))return;
 const key=JSON.stringify(bound);if(!force&&dataKey===key)return;
 clearLiveData();dataKey=key;const token=dataFlight;
 const status=document.getElementById('aqLiveDataStatus');if(status)status.textContent=ui('جارٍ قراءة المؤشرات…');
 const button=document.getElementById('aqLiveRefresh');if(button){button.disabled=true;button.onclick=()=>loadLiveData(true);}
 try{
  const [{createSession},{readManagementCounters,kuwaitDay},{readLiveDashboard,readReferenceDashboard}]=await withDeadline(()=>Promise.all([import('./api/session.js'),import('./components/management-counters.js'),import('./components/live-dashboard-data.js')]));
  if(token!==dataFlight||JSON.stringify(scope())!==key)return;
  const session=createSession();dataSession=session;await session.connect();
  const day=kuwaitDay();
  const [report,reference]=await Promise.all([readLiveDashboard(session,day,readManagementCounters),readReferenceDashboard(session,day)]);
  session.check();if(token!==dataFlight||JSON.stringify(scope())!==key)return;
  liveReport=report;referenceReport=reference;liveValues={...report.values,...reference.metrics};refreshPropertyCards();renderReferencePanels();renderCollectionRows();renderPayments();renderFollowups();for(const [name,value] of Object.entries(liveValues))setValue(name,formatMetric(name,value));
  if(status)status.textContent=(report.partial||reference.partial?ui('بعض المؤشرات غير متاحة.'):ui('تم التحديث من السجلات.'))+' '+report.day;
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
  for(const value of [String(row.property_name??'')+' / '+String(row.unit_no??''),row.contract_no,formatMetric('due',row.due),formatMetric('month',row.allocated_paid),formatMetric('remaining',row.remaining)]){
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
function referenceRows(id,rows){
 const host=document.getElementById(id);if(!host)return;host.replaceChildren();
 if(!rows?.length){empty(host,rows?'لا توجد سجلات لهذه الفترة.':'البيانات غير متاحة.');return;}
 for(const [label,value,kind,target,tone=''] of rows){
  const button=document.createElement('button');button.type='button';button.className='aq-ref-row '+tone;
  button.dataset['exact'+kind[0].toUpperCase()+kind.slice(1)]=target;
  const name=document.createElement('span'),amount=document.createElement('b');name.textContent=label;amount.textContent=String(value??'—');name.dataset.aqRecord='';amount.dataset.aqRecord='';button.append(name,amount);host.append(button);
 }
}
function renderFollowups(){
 referenceRows('aqLiveFollowups',[
  [ui('تنتهي خلال 30 يومًا'),formatMetric('expiring',liveValues?.expiring),'service','lease_expiry_report'],
  [ui('الصيانة المفتوحة'),formatMetric('maintenance',liveValues?.maintenance),'route','maintenanceProPage'],
  [ui('المتبقي'),formatMetric('remaining',liveValues?.remaining),'route','collectionProPage']
 ]);
}
function renderReferencePanels(){
 const report=referenceReport;if(!report)return;
 const chart=document.getElementById('aqLiveYearChart');
 if(chart){
  const amounts=report.months.map(x=>x.amount),max=Math.max(1,...amounts.filter(x=>x!==null));
  chart.innerHTML=`<div class="aq-ref-chart-caption"><b>${report.year}</b><span>${ui('تحصيل الشهر')}: ${escapeText(formatMetric('month',liveValues?.month))}</span></div><div class="aq-ref-bars">${report.months.map((x,index)=>{const label=new Intl.DateTimeFormat(document.documentElement.lang||'ar',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(report.year,index,1)));const value=formatMetric('month',x.amount);return `<div class="aq-ref-bar" title="${escapeText(label+' · '+value)}"><span class="aq-ref-bar-value">${x.amount===null?'—':escapeText(new Intl.NumberFormat(document.documentElement.lang||'ar',{notation:'compact',maximumFractionDigits:1}).format(x.amount))}</span><i style="--bar:${x.amount===null?0:Math.max(0,x.amount/max*100)}%" class="${x.amount===null?'missing':''}"></i><small>${escapeText(label)}</small></div>`;}).join('')}</div>`;
 }
 const occupancy=document.getElementById('aqLiveOccupancy'),units=report.units;
 if(occupancy){
  if(!units){empty(occupancy,'البيانات غير متاحة.');}
  else{const total=Number(units.total),occupied=Number(units.occupied),vacant=Number(units.vacant),rate=total>0?Math.min(100,occupied/total*100):0;
   occupancy.innerHTML=`<div class="aq-ref-donut" style="--occupied:${rate}%" role="img" aria-label="${escapeText(ui('نسبة الإشغال')+' '+formatMetric('occupancy',total?rate:null))}"><span><b>${formatMetric('units',total)}</b><small>${ui('وحدة')}</small></span></div><div class="aq-ref-legend"><p><i class="occupied"></i>${ui('مؤجرة')}<b>${formatMetric('units',occupied)}</b></p><p><i class="vacant"></i>${ui('شاغرة')}<b>${formatMetric('units',vacant)}</b></p><p>${ui('نسبة الإشغال')}<b>${formatMetric('occupancy',total?rate:null)}</b></p></div>`;
  }
 }
 referenceRows('aqLiveExpiry',report.expiring?.slice(0,3).map(x=>[x.contract_no, x.end_date,'service','lease_expiry_report']));
 referenceRows('aqLiveUtilities',report.utilities?.slice(0,4).map(x=>[x.invoice_no,formatMetric('due',Math.max(0,Number(x.amount_due)-Number(x.amount_paid))),'service','maintenance_utilities']));
 referenceRows('aqLiveLegal',report.health?[
  [ui('قضايا مفتوحة'),report.health.open_legal_cases,'service','operations_center','danger'],
  [ui('أوامر شغل مفتوحة'),report.health.open_work_orders,'service','operations_center'],
  [ui('شيكات مفتوحة'),report.health.open_cheques,'service','operations_center']
 ]:null);
 const total=document.querySelector('[data-live-payment-total]');if(total)total.textContent=formatMetric('month',liveValues?.month);
 const system=document.getElementById('aqLiveSystemStatus');if(system){system.replaceChildren();const p=document.createElement('p');p.textContent=ui(report.partial?'بعض المؤشرات غير متاحة.':'تم التحديث من السجلات.');system.append(p);}
 const select=document.getElementById('aqLiveOwnerProperty');if(select){select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=ui('اختر العقار');select.append(first);for(const property of report.properties||[]){const option=document.createElement('option');option.value=property.id;option.textContent=property.name;option.dataset.aqRecord='';select.append(option);}select.disabled=!report.properties?.length;select.onchange=()=>loadOwnerShares(select.value);}
 const owners=document.getElementById('aqLiveOwners');if(owners)empty(owners,'اختر العقار لعرض حصص الملاك.');
}
let ownerFlight=0;
async function loadOwnerShares(propertyId){
 const token=++ownerFlight,bound=scope(),host=document.getElementById('aqLiveOwners');if(!bound||!host)return;
 if(!propertyId){empty(host,'اختر العقار لعرض حصص الملاك.');return;}
 empty(host,'جارٍ قراءة المؤشرات…');let session;
 try{
  const {createSession}=await withDeadline(()=>import('./api/session.js'));session=createSession();await session.connect();
  const report=await session.request(session.client.rpc('aqari_property_ownership',{p_workspace_id:bound.workspace,p_action:'context',p_data:{propertyId}}));session.check();
  if(token!==ownerFlight||JSON.stringify(scope())!==JSON.stringify(bound))return;
  if(report?.workspace_id!==bound.workspace||report?.user_id!==bound.user||report?.property_id!==propertyId)throw Error('scope');
  referenceRows('aqLiveOwners',report.owners?.map(x=>[x.name,Number(x.bps)/100+'%','service','partner_distributions']));
 }catch{if(token===ownerFlight&&scope())empty(host,'البيانات غير متاحة.');}finally{session?.close();}
}

function reconcileLegacyPropertyUnitCounts(){
 if(!Array.isArray(referenceReport?.properties))return;
 for(const row of sourceNodes('.v199-property-row')){
  const name=clean(row.querySelector('strong')?.textContent),units=row.querySelector('.v199-property-units');
  if(!name||!units)continue;
  const count=registeredUnitCount(referenceReport.properties,name);
  if(count===null)continue;
  const next=String(count)+' '+ui('وحدة');
  if(clean(units.textContent)!==clean(next))units.textContent=next;
  if(units.dataset)units.dataset.aqCanonicalUnits='true';
 }
}
function refreshPropertyCards(){
 reconcileLegacyPropertyUnitCounts();
 const host=document.getElementById('aqLiveProperties');if(!host)return;
 const rows=sourceNodes('.v199-property-row').slice(0,3);
 const signature=JSON.stringify([referenceReport?.properties,rows.map(row=>[row.textContent,row.querySelector('img')?.getAttribute('src')])]);if(host.dataset.signature===signature)return;host.dataset.signature=signature;
 host.replaceChildren();
 if(!rows.length){empty(host,'لا توجد عقارات ظاهرة ضمن صلاحياتك.');return;}
 for(const row of rows){
  const card=document.createElement('button');card.type='button';card.className='aq-live-property';
  const art=document.createElement('div');art.className='aq-live-building-art';art.setAttribute('aria-hidden','true');
  const sourceImage=row.querySelector('img');
  if(sourceImage?.getAttribute('src')){const photo=sourceImage.cloneNode(false);photo.removeAttribute('id');photo.alt='';photo.loading='lazy';art.append(photo);}else art.innerHTML=workspaceIcon('building');
  const name=document.createElement('strong');name.textContent=row.querySelector('strong')?.textContent||ui('العقار');name.dataset.aqRecord='';
  card.onclick=async event=>{event.preventDefault();event.stopPropagation();if(!scope()||card.disabled)return;card.disabled=true;try{const opened=await window.AQARI_OWNER_EXACT?.openProperty?.(name.textContent);if(opened!==true){const status=document.getElementById('aqLiveDataStatus');if(status)status.textContent=ui('تعذر فتح الخدمة.');}}catch{const status=document.getElementById('aqLiveDataStatus');if(status)status.textContent=ui('تعذر فتح الخدمة.');}finally{card.disabled=false;}};
  const action=document.createElement('small');action.textContent=ui('فتح ملف العقار');const detail=document.createElement('small');detail.dataset.aqRecord='';detail.textContent=formatMetric('units',registeredUnitCount(referenceReport?.properties,name.textContent))+' '+ui('وحدة');card.append(art,name,detail,action);host.append(card);
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
 try{if(!ensureDashboard())return;suppressDuplicateShells();normalizePages();refreshMetrics();refreshPropertyCards();renderFollowups();loadLiveData();}
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
 window.addEventListener('aqari:auth-boundary',event=>{clearLiveData();document.getElementById(ROOT)?.remove?.();if(event?.detail?.state==='ready')setTimeout(schedule,0);});
 window.addEventListener('aqari:owner-final-route',()=>setTimeout(schedule,0));
 window.AQARI_LIVE_STABILITY=Object.freeze({version:'V267-work1-stability-1',refresh:schedule});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();



