import {bindLocale,setLocale,getLocale,direction,t,LANGUAGES} from './components/locale.js';
import {createLiveTextTranslator} from './components/live-locale-text.js';
import {mountAppLoginLocale} from './app-login-locale.js';
import {formatMaintenanceMetric} from './components/legacy-maintenance-locale.js';

const RELEASE='V267';
const EXTRA_EN=Object.freeze({
 'الرئيسية':'Home','العقارات':'Properties','الوحدات':'Units','المستأجرون':'Tenants','العقود':'Contracts','التحصيل':'Collections','المصروفات':'Expenses','الصيانة':'Maintenance','الموظفون والرواتب':'Employees & payroll','الفواتير والخدمات':'Bills & utilities','التقارير والإحصائيات':'Reports & analytics','المستندات':'Documents','التنبيهات':'Alerts','الإعدادات':'Settings','الوصولات':'Receipts','المصروفات والفواتير':'Expenses & invoices','الملاك والشركاء':'Owners & partners','مركز المدير العام':'General manager center','بوابة المستأجر':'Tenant portal',
 'المساعدة والدعم':'Help & support','اسأل المساعد':'Ask assistant','مرحباً مجدداً':'Welcome back','العقار… قيمة تدوم':'Real estate… lasting value','إدارة احترافية\nلعقارك في مكان واحد':'Professional property management\nin one place','سهولة الاستخدام':'Easy to use','دعم مستمر':'Ongoing support','أمان البيانات':'Data security','إجمالي الدخل':'Total income','إجمالي التحصيل':'Total collections','العقود الفعّالة':'Active contracts','المتأخرات':'Arrears','الصيانة المفتوحة':'Open maintenance','التنبيهات والمهام':'Alerts & tasks','عرض الكل':'View all','عقود وانتهاءات تحتاج متابعة':'Contracts and expiries needing attention','تحصيلات ومهام اليوم':"Today's collections and tasks",'طلبات الصيانة المفتوحة':'Open maintenance requests','التحصيل الشهري':'Monthly collections','فتح التحصيل':'Open collections','نسبة التحصيل الحالية':'Current collection rate','المحفظة':'Portfolio','تفاصيل العقارات':'Property details','الأرقام المعروضة أعلاه تأتي من السجلات المصرح بها فقط.':'Figures shown above come only from authorized records.','عقاراتي':'My properties','إنشاء عقد':'Create contract','إضافة مستأجر':'Add tenant','إضافة عقار':'Add property','طلب صيانة':'Maintenance request','إصدار وصل':'Issue receipt','إجراء سريع':'Quick action','المدير العام':'General manager','حساب مصرح':'Authorized account','ابحث عن عقار، مستأجر، عقد، رقم شقة…':'Search property, tenant, contract, unit number…','صفحة مستقلة ضمن صلاحيات الحساب الحالية.':'A dedicated page within your current account permissions.','العودة للرئيسية':'Back to dashboard','لغة الواجهة':'Interface language','كل العقارات':'All properties','فتح المالية':'Open finance','قراءة فقط':'Read only','مساعد AQARI الذكي':'AQARI AI assistant','تقرير المالك التلقائي':'Automatic owner report','إدارة التقارير':'Manage reports','إجراءات سريعة':'Quick actions','اليوم وهذا الشهر':'Today and this month','المستحق هذا الشهر':'Due this month','المحصل':'Collected','المتبقي / المتأخر':'Remaining / overdue','المتابعة':'Follow-up','العقود والصيانة والتنبيهات':'Contracts, maintenance & alerts','آخر العمليات':'Latest activity','الأداء المالي':'Financial performance','المصروفات وصافي التشغيل':'Expenses & net operating result','صافي التشغيل':'Net operating result','جميع الأقسام':'All sections','إدارة وتشغيل':'Manage and operate'
});
const SHELL_ROOTS='#aqOwnerExactShell,#aqOwnerExactHome,#v199MoreMenu,.aq-exact-section-head,.aq-unified-dashboard,.aq-unified-page-head,#aqUnifiedMore';
const STATIC_TAGS=new Set(['BUTTON','LABEL','OPTION','LEGEND','SUMMARY','TH','H1','H2','H3','H4','H5','H6']);
const SHELL_TAGS=new Set([...STATIC_TAGS,'SMALL','STRONG','B','P','SPAN','TH','TD']);
const PROPERTY_UI_ROOTS='.v202-workspace-head,.v202-actions,.v202-tabs,.v202-overview-grid,.v202-property-kpis,.aq267-property-summary,.aq-unit-directory,.v202-contract-card,.v202-ledger,.v202-empty,.v202-document-note,.v202-panel-footer,.v267-partners';
const PROPERTY_UI_TAGS=new Set([...STATIC_TAGS,'SMALL','STRONG','B','P','SPAN','DT','DD','EM']);
let observer=null,queued=false,boundKey='';
const translateLiveText=createLiveTextTranslator(translate);
const translateMaintenanceResponse=createLiveTextTranslator(source=>formatMaintenanceMetric(source,'response',getLocale()));
const translateMaintenanceCost=createLiveTextTranslator(source=>formatMaintenanceMetric(source,'cost',getLocale()));
const attributeOwners=new WeakMap();

function liveScope(){
 try{
  const c=window.AQARI_SUPABASE?.context,m=c?.membership;
  if(!document.documentElement.classList.contains('aqari-auth-unlocked')||m?.is_active!==true||m.user_id!==c?.user?.id||m.workspace_id!==c?.workspace?.id)return null;
  return {user:c.user.id,workspace:c.workspace.id};
 }catch{return null;}
}
function scopedStorageKey(scope){return 'aqari:v267:locale:'+JSON.stringify([scope.workspace,scope.user]);}
function translate(source){
 if(!source)return source;
 const standard=t(source);if(standard!==source)return standard;
 const propertyCount=source.match(/^(\d+) (عقد موقّع سارٍ|عقد مرتبط يحتاج تحقق|عملية|بند مسجل|دفعة معتمدة)$/);
 if(propertyCount)return t('{count} '+propertyCount[2]).replace('{count}',propertyCount[1]);
 const propertyOccupied=source.match(/^(\d+) من (\d+)$/);
 if(propertyOccupied)return t('{count} من {total}').replace('{count}',propertyOccupied[1]).replace('{total}',propertyOccupied[2]);
 const digits=value=>value.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
 const locale={ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'}[getLocale()];
 const propertyMoney=source.match(/^([\d٠-٩٬٫,.]+) د\.ك$/);
 if(propertyMoney){const amount=Number(digits(propertyMoney[1]).replace(/[٬,]/g,'').replace('٫','.'));if(Number.isFinite(amount))return new Intl.NumberFormat(locale,{style:'currency',currency:'KWD',minimumFractionDigits:0,maximumFractionDigits:3}).format(amount);}
 const periodParts=source.split(' • '),period=periodParts.length===2?periodParts[1].match(/^(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر) ([\d٠-٩]{4})$/):null;
 if(period){const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];const date=new Date(Date.UTC(Number(digits(period[2])),months.indexOf(period[1]),1));return translate(periodParts[0])+' • '+new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'}).format(date);}
 const unitCount=source.match(/^(\d+) بلا بيانات تفصيلية$/);
 if(unitCount)return t('{count} بلا بيانات تفصيلية').replace('{count}',unitCount[1]);
 const unitResult=source.match(/^عرض (\d+) من (\d+) وحدة$/);
 if(unitResult)return t('عرض {count} من {total} وحدة').replace('{count}',unitResult[1]).replace('{total}',unitResult[2]);
 const shareCount=source.match(/^سجل التوزيعات والتعديلات — آخر ٥٠ من \((\d+)\)$/);
 if(shareCount)return t('سجل التوزيعات والتعديلات — آخر ٥٠ من ({count})').replace('{count}',shareCount[1]);
 for(const prefix of ['عرض كل بيانات الوحدة ','إظهار الرقم المدني للوحدة ','عقد '])if(source.startsWith(prefix))return t(prefix.trim()+' {value}').replace('{value}',source.slice(prefix.length));
 const standalonePeriod=source.match(/^(?:([\d٠-٩]{1,2}) )?(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر) ([\d٠-٩]{4})$/);
 if(standalonePeriod){const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];return new Intl.DateTimeFormat(locale,{...(standalonePeriod[1]?{day:'numeric'}:{}),month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(Number(digits(standalonePeriod[3])),months.indexOf(standalonePeriod[2]),Number(digits(standalonePeriod[1]||'1')))));}
 const propertyLabel='فتح ملف العقار ';
 if(source.startsWith(propertyLabel))return t('فتح ملف العقار')+' '+source.slice(propertyLabel.length);
 const actualSection=source.match(/^صفحة (.+) الفعلية ضمن صلاحيات الحساب الحالية\.$/);
 if(actualSection)return t('صفحة مستقلة ضمن صلاحيات الحساب الحالية.');
 const section=source.match(/^إدارة وتشغيل (.+) من صفحة واضحة وموحدة\.$/);
 if(section)return t('إدارة وتشغيل {section} من صفحة واضحة وموحدة.').replace('{section}',t(section[1]));
 return getLocale()==='en'?(EXTRA_EN[source]||source):source;
}
function applyDirection(){
 const locale=getLocale(),dir=direction(locale);document.documentElement.lang=locale;document.documentElement.dir=dir;
 if(document.body){document.body.lang=locale;document.body.dir=dir;document.body.dataset.aqariLocale=locale;}
}
function uiTextNode(node){
 const parent=node.parentElement;if(!parent||parent.closest('[data-aq-record],[translate="no"],#v199MenuAccount'))return false;
 if(parent.matches('body[data-v205-route="tenants"] #rows>tr>td:nth-child(4)'))return true;
 if(parent.matches('[data-aq267-text],.aq267-dialog-title,[role="status"],#aqari-exp-investment-apartment-shortcut,a.skipLinkV103'))return true;
 if(parent.closest('#maintenanceProPage')&&parent.matches('.c.m,#mpResponseV62,#mpCostV62,#mpSlaV62>p,#mpTechV62>p,#mpPreventiveV62>p,#mpPartsV62>p'))return true;
 if(parent.closest(SHELL_ROOTS))return SHELL_TAGS.has(parent.tagName);
 if(parent.closest(PROPERTY_UI_ROOTS))return PROPERTY_UI_TAGS.has(parent.tagName)||parent.matches('.aq267-photo-empty,.aq-unit-result-count');
 if(parent.matches('.aq267-property-finance>summary'))return true;
 if(parent.closest('main.w>.p,#modal[role="dialog"],.aq267-dialog,.aq-owner-modal,.aq-owner-center-dialog,.aq-exact-assistant'))return STATIC_TAGS.has(parent.tagName);
 return false;
}
function translateTextNode(node){
 if(!uiTextNode(node))return;
 const raw=node.nodeValue||'';if(!raw.trim())return;
 const render=node.parentElement.id==='mpResponseV62'?translateMaintenanceResponse:node.parentElement.id==='mpCostV62'?translateMaintenanceCost:translateLiveText;
 const localized=render(node,raw);if(localized!==raw)node.nodeValue=localized;
}
function translateElement(el){
 if(!(el instanceof Element))return;
 if(el.closest('[data-aq-record],[translate="no"]'))return;
 let owners=attributeOwners.get(el);if(!owners){owners={};attributeOwners.set(el,owners);}
 for(const attr of ['placeholder','aria-label','title','data-label']){
  const value=el.getAttribute(attr);if(!value)continue;
  const owner=owners[attr]||(owners[attr]={});
  const localized=translateLiveText(owner,value);if(localized!==value)el.setAttribute(attr,localized);
 }
}
function translateTree(root=document.body){
 if(!root)return;applyDirection();
 for(const dialog of document.querySelectorAll('dialog.aq267-dialog,dialog.aq-owner-center-dialog,dialog.aq-exact-assistant')){dialog.lang=getLocale();dialog.dir=direction();}
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))translateTextNode(node);
 const attrs=root.querySelectorAll?.('input[placeholder],textarea[placeholder],[aria-label],[title],[data-label]')||[];for(const el of attrs)translateElement(el);
}
function mountLanguageControl(){
 const top=document.querySelector('.aq-exact-top');if(!top)return;
 let control=document.getElementById('aqPlatformLanguage');if(control){control.value=getLocale();return;}
 const old=top.querySelector('.aq-exact-language'),wrap=document.createElement('label');wrap.className='aq-platform-language';wrap.setAttribute('aria-label',translate('لغة الواجهة'));
 const caption=document.createElement('span');caption.textContent=translate('لغة الواجهة');control=document.createElement('select');control.id='aqPlatformLanguage';control.name='aqari_language';
 for(const code of Object.keys(LANGUAGES)){const option=document.createElement('option');option.value=code;option.textContent=LANGUAGES[code];control.append(option);}
 control.value=getLocale();control.addEventListener('change',()=>{if(!Object.hasOwn(LANGUAGES,control.value))return;setLocale(control.value);try{localStorage.setItem('aqari_login_language',control.value);}catch{}window.location.reload();});
 wrap.append(caption,control);if(old)old.replaceWith(wrap);else top.append(wrap);
}
function bind(){
 const scope=liveScope();if(!scope)return false;const nextKey=scope.user+'|'+scope.workspace;
 if(boundKey!==nextKey){let stored=null;try{stored=localStorage.getItem(scopedStorageKey(scope));}catch{}bindLocale(scope);if(!stored)try{const login=localStorage.getItem('aqari_login_language');if(Object.hasOwn(LANGUAGES,login))setLocale(login);}catch{}boundKey=nextKey;}
 applyDirection();mountLanguageControl();translateTree();return true;
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(bind())translateTree();});}
function start(){
 mountAppLoginLocale();
 if(!document.getElementById('aqari-platform-locale-css')){const link=document.createElement('link');link.id='aqari-platform-locale-css';link.rel='stylesheet';link.href='/src/v267/styles/platform-locale.css?release='+RELEASE;document.head.append(link);}
 bind();observer?.disconnect?.();observer=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.type==='attributes'||r.type==='characterData'))schedule();});observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','aria-hidden','placeholder','aria-label','title','data-label']});
 window.addEventListener('aqari:auth-boundary',event=>{if(event?.detail?.state==='ready'){boundKey='';setTimeout(schedule,0);}});
 window.AQARI_PLATFORM_LOCALE=Object.freeze({version:'V267-platform-locale-2',get:getLocale,set(value){setLocale(value);window.location.reload();}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
