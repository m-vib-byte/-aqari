import './platform-locale-runtime.js?release=V267';

const RELEASE='V267';
const DIRECT=new Map([
 ['units',{service:'unit_readiness'}],
 ['contracts',{service:'rental_contracts'}],
 ['receipts',{section:'collections'}],
 ['expenses',{service:'financial_register'}],
 ['staff',{service:'employees_payroll'}],
 ['owners',{service:'partner_access'}],
 ['manager',{module:'./pages/control-center.js',exportName:'openControlCenter',manager:true}]
]);
function scope(){try{const c=window.AQARI_SUPABASE?.context,m=c?.membership,d=window.AQARI_DATA_GATE?.scope,s=window.AQARI_EARLY_STORAGE_GATE?.scope;if(!document.documentElement.classList.contains('aqari-auth-unlocked')||m?.is_active!==true||m.user_id!==c?.user?.id||m.workspace_id!==c?.workspace?.id||d?.userId!==c?.user?.id||d?.workspaceId!==c?.workspace?.id||s?.userId!==c?.user?.id||s?.workspaceId!==c?.workspace?.id)return null;return {user:c.user.id,workspace:c.workspace.id,role:m.role};}catch{return null;}}
function visible(el){if(!el||el.hidden||el.disabled||el.getAttribute('aria-hidden')==='true')return false;const style=window.getComputedStyle?.(el);return !style||(style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0');}
function escapeValue(value){return globalThis.CSS?.escape?CSS.escape(String(value)):String(value).replace(/[\\"']/g,'\\$&');}
function serviceButton(key){return [...document.querySelectorAll(`[data-aq267-label="${escapeValue(key)}"]`)].find(visible)||null;}
function setStatus(message,bad=false){const el=document.getElementById('aqUnifiedStatus');if(!el)return;el.textContent=message||'';el.classList.toggle('is-bad',Boolean(bad));}
async function openDirect(key){const session=scope(),def=DIRECT.get(key);if(!session||!def)throw Error('تعذر فتح القسم بصلاحية الحساب الحالية.');if(def.manager&&session.role!=='general_manager')throw Error('هذا القسم للمدير العام فقط.');setStatus('');if(def.section){const api=window.AQARI_UNIFIED_EXPERIENCE;if(typeof api?.openSection!=='function')throw Error('التنقل التشغيلي غير جاهز بعد.');return api.openSection(def.section);}if(def.service){const target=serviceButton(def.service);if(!target)throw Error('الوظيفة الفعلية غير متاحة لصلاحيات الحساب الحالية.');target.click();document.body.dataset.aqUnifiedSection=key;return true;}if(def.module){const mod=await import(def.module+'?release='+encodeURIComponent(RELEASE));if(typeof mod?.[def.exportName]!=='function')throw Error('الوظيفة الفعلية غير جاهزة.');mod[def.exportName]();document.body.dataset.aqUnifiedSection=key;return true;}return false;}
function interceptDirect(event){const trigger=event.target?.closest?.('[data-unified-section]');if(!trigger)return;const key=trigger.dataset.unifiedSection;if(!DIRECT.has(key))return;event.preventDefault();event.stopImmediatePropagation();trigger.closest?.('#aqUnifiedMore[open]')?.close();openDirect(key).catch(error=>setStatus(error?.message||'تعذر فتح الوظيفة الفعلية.',true));}
window.addEventListener('click',interceptDirect,true);
window.AQARI_PREMIUM_NAVIGATION=Object.freeze({version:'V267-premium-navigation-2',openDirect,keys:[...DIRECT.keys()]});


