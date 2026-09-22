const RELEASE='V267';
const ROUTE_KEYS={home:'home',properties:'properties',tenants:'tenants',collections:'collectionProPage',maintenance:'maintenanceProPage',reports:'reports',documents:'documentsHub',settings:'settingsCenterPage'};
const SECTION_BY_ROUTE={properties:'properties',tenants:'tenants',collectionProPage:'collections',maintenanceProPage:'maintenance',reports:'reports',documentsHub:'documents'};
const PAGE_BY_ROUTE={home:'home',properties:'list',tenants:'list',collectionProPage:'collectionProPage',maintenanceProPage:'maintenanceProPage',reports:'reports',documentsHub:'documentsHub',settingsCenterPage:'settingsCenterPage'};
let accessCache=null,accessKey='',flight=0;

function scope(){
 try{
  const c=window.AQARI_SUPABASE?.context,m=c?.membership,d=window.AQARI_DATA_GATE?.scope,s=window.AQARI_EARLY_STORAGE_GATE?.scope;
  if(!document.documentElement.classList.contains('aqari-auth-unlocked')||m?.is_active!==true||m.user_id!==c?.user?.id||m.workspace_id!==c?.workspace?.id||d?.userId!==c?.user?.id||d?.workspaceId!==c?.workspace?.id||s?.userId!==c?.user?.id||s?.workspaceId!==c?.workspace?.id)return null;
  return {user:c.user.id,workspace:c.workspace.id,role:m.role,key:c.user.id+'|'+c.workspace.id+'|'+m.role};
 }catch{return null;}
}
function ensureCss(){
 if(document.getElementById('aqari-owner-final-beige-css'))return;
 const link=document.createElement('link');link.id='aqari-owner-final-beige-css';link.rel='stylesheet';link.href='/src/v267/styles/owner-final-beige.css?release='+RELEASE;document.head.append(link);
}
function visible(el){if(!el||el.hidden)return false;const style=window.getComputedStyle?.(el);return !style||(style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0');}
function page(route){return document.getElementById(PAGE_BY_ROUTE[route]||route);}
function sectionTitle(route){return ({home:'الرئيسية',properties:'العقارات',tenants:'المستأجرون',collectionProPage:'التحصيل',maintenanceProPage:'الصيانة',reports:'التقارير والإحصائيات',documentsHub:'المستندات والأرشيف',settingsCenterPage:'الإعدادات'})[route]||'القسم';}
function waitPaint(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
function status(message,bad=false){window.AQARI_OWNER_EXACT?.status?.(message,bad);const node=document.getElementById('aqExactStatus');if(node){node.textContent=message||'';node.classList.toggle('bad',bad);}}

async function access(){
 const s=scope();if(!s)throw Error('ACCESS_DENIED');
 if(accessCache&&accessKey===s.key)return accessCache;
 const client=await window.AQARI_SUPABASE?.getClient?.();if(!client)throw Error('ACCESS_DENIED');
 const result=await client.rpc('aqari_workspace_access',{p_workspace_id:s.workspace});
 const data=result?.data??result;if(result?.error)throw result.error;
 if(data?.user_id!==s.user||data?.workspace_id!==s.workspace||data?.role!==s.role)throw Error('ACCESS_DENIED');
 accessCache=data;accessKey=s.key;return data;
}
function routeAllowed(route,a){const section=SECTION_BY_ROUTE[route];return !section||a?.permissions?.[section]?.read===true;}
function routeContextReady(route){
 const target=page(route);if(!visible(target))return false;
 if(['home','properties','tenants','collectionProPage','maintenanceProPage'].includes(route)&&window.AQARI_V205){return document.body.getAttribute('data-v205-route')===route;}
 return true;
}
function directPageCommit(route){
 const target=page(route);if(!target)return false;
 const siblings=[...document.querySelectorAll('main.w > .p')];
 if(siblings.includes(target)){for(const item of siblings)item.classList.toggle('on',item===target);}
 target.hidden=false;target.removeAttribute('aria-hidden');
 document.body.dataset.aqariFinalRoute=route;
 if(route==='properties'||route==='tenants')target.dataset.aqariListMode=route;
 return true;
}
function decorate(route){
 const target=page(route);if(!target||route==='home')return;
 let head=target.querySelector(':scope > .aq-exact-section-head');
 if(!head){head=document.createElement('header');head.className='aq-exact-section-head';target.prepend(head);}
 head.innerHTML=`<div><span>AQARI ${RELEASE}</span><h1>${sectionTitle(route)}</h1><p>صفحة ${sectionTitle(route)} الفعلية ضمن صلاحيات الحساب الحالية.</p></div><button type="button" data-owner-final-route="home">العودة للرئيسية</button>`;
}
function syncActive(route){
 document.querySelectorAll('[data-exact-key]').forEach(button=>{const mapped=ROUTE_KEYS[button.dataset.exactKey];button.classList.toggle('active',mapped===route);});
 document.querySelectorAll('[data-v199-go]').forEach(button=>{button.classList.toggle('is-active',button.dataset.v199Go===route);if(button.dataset.v199Go===route)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
async function callRouters(route,current=()=>true){
 let called=false;
 if(!current())return false;
 try{if(typeof window.go==='function'){window.go(route);called=true;}}catch{}
 await waitPaint();
 if(!current())return false;
 if(!routeContextReady(route)){
  try{if(typeof window.AQARI_V199_BASE_GO==='function'){window.AQARI_V199_BASE_GO(route);called=true;}}catch{}
  await waitPaint();
  if(!current())return false;
 }
 if(['home','properties','tenants','collectionProPage','maintenanceProPage'].includes(route)&&window.AQARI_V205&&document.body.getAttribute('data-v205-route')!==route){
  try{window.AQARI_V205.navigate?.(route);called=true;}catch{}
  await waitPaint();
 }
 return called;
}
export async function navigateOwnerFinal(route,parentCurrent=()=>true){
 const token=++flight;const s=scope();if(!s)return false;status('');
 const current=()=>token===flight&&scope()?.key===s.key&&parentCurrent();
 try{
  const a=await access();if(!current())return false;
  if(!routeAllowed(route,a)){status('هذا القسم غير متاح لصلاحيات حسابك الحالية.',true);return false;}
  await callRouters(route,current);if(!current())return false;
  if(!visible(page(route))){status('تعذر فتح صفحة '+sectionTitle(route)+'. لم يتم تنفيذ تمرير وهمي للأعلى.',true);return false;}
  directPageCommit(route);decorate(route);syncActive(route);
  const target=page(route);target?.scrollIntoView?.({block:'start',behavior:'auto'});
  window.dispatchEvent(new CustomEvent('aqari:owner-final-route',{detail:{route}}));
  return true;
 }catch(error){if(current())status(error?.message==='ACCESS_DENIED'?'انتهت صلاحية الجلسة أو تغيرت. أعد تسجيل الدخول.':'تعذر فتح القسم بأمان.',true);return false;}
}
function routeFromElement(el){
 const direct=el.closest?.('[data-owner-final-route]')?.dataset.ownerFinalRoute;if(direct)return direct;
 const exact=el.closest?.('[data-exact-route]')?.dataset.exactRoute;if(exact)return exact;
 const key=el.closest?.('[data-exact-key]')?.dataset.exactKey;if(key&&ROUTE_KEYS[key])return ROUTE_KEYS[key];
 const v205=el.closest?.('[data-v205-section]')?.getAttribute('data-v199-go');if(v205)return v205;
 return el.closest?.('[data-v199-go]')?.dataset.v199Go||'';
}
function captureNavigation(event){
 const route=routeFromElement(event.target);if(!route||!Object.prototype.hasOwnProperty.call(PAGE_BY_ROUTE,route))return;
 if(!scope())return;
 event.preventDefault();event.stopImmediatePropagation();navigateOwnerFinal(route);
}
function resetScope(){accessCache=null;accessKey='';flight++;}
function boot(){
 ensureCss();document.body.classList.add('aq-owner-final-beige');
 document.addEventListener('click',captureNavigation,true);
 window.addEventListener('aqari:auth-boundary',event=>{resetScope();if(event?.detail?.state==='ready')setTimeout(()=>navigateOwnerFinal(document.body.dataset.aqariFinalRoute||'home'),0);});
 window.addEventListener('aqari:v267-controls-changed',resetScope);
 window.AQARI_OWNER_FINAL=Object.freeze({version:'V267-owner-final-beige-1',navigate:navigateOwnerFinal,refreshAccess:resetScope});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
