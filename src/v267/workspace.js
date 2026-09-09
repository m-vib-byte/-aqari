import {uiText,refreshText} from './components/ui-text.js';
import {t,getLocale,bindLocale,setLocale,direction} from './components/locale.js';
import {installFinancialIntegrity} from './pages/financial-integrity.js';
import {createSession,currentScope,safeError} from './api/session.js';
import {node,field} from './components/dialog.js';
import {LANGUAGES,ROUTES,label} from './components/catalog.js';
let installed=false,access=null,loading=null,session,notice;
function updateFeatureTools(){
 const staff=document.getElementById('aq267-staff-access'),finance=document.getElementById('aq267-financial-register'),deposits=document.getElementById('aq267-deposit-ledger'),vacating=document.getElementById('aq267-vacating-settlement'),vacatingReview=document.getElementById('aq267-vacating-review');
 if(staff)staff.hidden=access?.features?.staff_access!==true||access?.role!=='general_manager';
 if(finance)finance.hidden=access?.features?.financial_register!==true||access?.permissions?.finance?.read!==true;
 if(deposits)deposits.hidden=access?.features?.deposit_register!==true||access?.permissions?.collections?.read!==true;
 if(vacating)vacating.hidden=access?.features?.vacating_settlement!==true||access?.permissions?.contracts?.read!==true||access?.permissions?.collections?.read!==true;
 if(vacatingReview)vacatingReview.hidden=access?.features?.vacating_review!==true||access?.role!=='general_manager';
}
const ui=uiText;
function updateLabels(){
 const locale=getLocale();
 for(const region of document.querySelectorAll('.aq267-tools')){region.lang=locale;region.dir=direction();}
 for(const el of document.querySelectorAll('.aq267-tools [data-aq267-text]'))refreshText(el);
 const choice=document.getElementById('aq267-interface-language');if(choice)choice.value=locale;
 if(!access)return;
 // Rename navigation only: dashboard action cards also carry routing attributes
 // and their final span may be a financial number, not a label.
 for(const el of document.querySelectorAll('.v199-nav-button[data-v199-go],.v199-bottom-button[data-v199-go],#v199MoreMenu .v199-menu-action[data-v199-go],[data-v205-section][data-v199-go],[data-aq267-label],.v199-bottom-button[data-v199-action="more"]')){
  const key=el.dataset.aq267Label||ROUTES[el.dataset.v199Go||el.dataset.v205Route]||(el.dataset.v199Action==='more'?'more':null);if(!key)continue;
  const text=label(key,locale,access.labels),span=el.querySelector(':scope > span:last-child');
  if(span&&!span.querySelector('svg'))span.textContent=text;
  else if(el.dataset.aq267Label)el.textContent=text;
  else{const texts=[...el.childNodes].filter(n=>n.nodeType===3);if(texts.length)texts.at(-1).textContent=' '+text;}
  el.setAttribute('aria-label',text);el.lang=locale;
 }
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{session?.close();session=createSession();await session.connect();const data=await session.request(session.client.rpc('aqari_workspace_access',{p_workspace_id:session.bound.workspace}));
 if(data.user_id!==session.bound.user||data.workspace_id!==session.bound.workspace||data.role!==session.bound.role)throw Error('تغيرت صلاحية الحساب. حدّث الصفحة.');
 access=data;bindLocale(session.bound);updateLabels();updateFeatureTools();if(notice)notice.textContent='';return data;})().catch(e=>{access=null;updateFeatureTools();if(notice)notice.textContent=t(safeError(e));return null;}).finally(()=>{loading=null;});return loading;
}
export function install(){
 if(installed)return;bindLocale(currentScope());installed=true;installFinancialIntegrity();
 if(!document.getElementById('aq267-workspace-css')){const css=node('link');css.id='aq267-workspace-css';css.rel='stylesheet';css.href='/src/v267/styles/workspace.css?release=V267';document.head.append(css);}
 const menu=document.getElementById('v199MoreMenu');if(!menu){installed=false;return;}
 const tools=node('section'),control=node('button',label('control_center')),scan=node('button',label('scan_document')),language=node('select');tools.className='aq267-tools';tools.id='aq267-workspace-tools';notice=node('p');notice.setAttribute('role','status');
 for(const [value,text]of Object.entries(LANGUAGES)){const option=node('option',text);option.value=value;language.append(option);}
 control.dataset.aq267Label='control_center';scan.dataset.aq267Label='scan_document';
 control.hidden=currentScope().role!=='general_manager';
 control.onclick=()=>import('./pages/control-center.js').then(m=>m.openControlCenter()).catch(e=>notice.textContent=t(safeError(e)));
 scan.onclick=()=>import('./pages/document-scanner.js').then(m=>m.openDocumentScanner()).catch(e=>notice.textContent=t(safeError(e)));
 language.id='aq267-interface-language';language.value=getLocale();language.onchange=()=>{try{bindLocale(currentScope());setLocale(language.value);updateLabels();}catch(e){notice.textContent=t(safeError(e));}};
 const statements=ui('button','كشوف العقارات — برج شيخة');statements.hidden=currentScope().role!=='general_manager';statements.onclick=()=>import('./pages/property-statements.js').then(m=>m.openPropertyStatements()).catch(e=>notice.textContent=t(safeError(e)));
 const utilities=ui('button','الإعدادات والخدمات — عدادات العقارات');utilities.onclick=()=>import('./pages/utility-meters.js').then(m=>m.openUtilityMeters()).catch(e=>notice.textContent=t(safeError(e)));
 const quality=ui('button','مركز جودة البيانات');quality.hidden=currentScope().role!=='general_manager';quality.onclick=()=>import('./pages/data-quality.js').then(m=>m.openDataQuality()).catch(e=>notice.textContent=t(safeError(e)));
 const review=ui('button','اعتماد عقود المصدر');review.hidden=currentScope().role!=='general_manager';review.onclick=()=>import('./pages/lease-review.js').then(m=>m.openLeaseReview()).catch(e=>notice.textContent=t(safeError(e)));
 const partners=ui('button','صلاحيات الشركاء حسب العقار');partners.hidden=currentScope().role!=='general_manager';partners.onclick=()=>import('./pages/partner-access.js').then(m=>m.openPartnerAccess()).catch(e=>notice.textContent=t(safeError(e)));
 const employees=node('button','الموظفون والرواتب / Employees and payroll');employees.onclick=()=>import('./pages/employees.js').then(m=>m.openEmployees()).catch(e=>notice.textContent=t(safeError(e)));
 const rentalContracts=node('button','إبرام عقود الإيجار / Rental contracts');rentalContracts.onclick=()=>import('./pages/rental-contracts.js').then(m=>m.openRentalContracts()).catch(e=>notice.textContent=t(safeError(e)));
 const propertyNotices=node('button','إعلانات العقارات وإرشادات المستأجرين');propertyNotices.hidden=currentScope().role!=='general_manager';propertyNotices.onclick=()=>import('./pages/property-notices.js').then(m=>m.openPropertyNotices()).catch(e=>notice.textContent=t(safeError(e)));
 const staffAccess=node('button','صلاحيات الموظفين حسب العقار');staffAccess.id='aq267-staff-access';staffAccess.hidden=true;staffAccess.onclick=()=>import('./pages/staff-access.js').then(m=>m.openStaffAccess()).catch(e=>notice.textContent=t(safeError(e)));
 const financialRegister=node('button','سجل المصروفات وإقفال الفترة المالية');financialRegister.id='aq267-financial-register';financialRegister.hidden=true;financialRegister.onclick=()=>import('./pages/financial-register.js').then(m=>m.openFinancialRegister()).catch(e=>notice.textContent=t(safeError(e)));
 const deposits=ui('button','دفتر التأمين — القبض والرد');deposits.id='aq267-deposit-ledger';deposits.hidden=true;deposits.onclick=()=>import('./pages/deposit-ledger.js').then(m=>m.openDepositLedger()).catch(e=>notice.textContent=t(safeError(e)));
 const vacating=ui('button','تسوية الإخلاء وبراءة الذمة');vacating.id='aq267-vacating-settlement';vacating.hidden=true;vacating.onclick=()=>import('./pages/vacating-settlement.js').then(m=>m.openVacatingSettlement()).catch(e=>notice.textContent=t(safeError(e)));
 const vacatingReview=node('button','مراجعات الإخلاء المؤرشفة');vacatingReview.id='aq267-vacating-review';vacatingReview.hidden=true;vacatingReview.onclick=()=>import('./pages/vacating-review.js').then(m=>m.openVacatingReview()).catch(e=>notice.textContent=t(safeError(e)));
 tools.append(staffAccess,financialRegister,deposits,vacating,vacatingReview);
 const languageField=field(t('لغة الواجهة'),language);languageField.querySelector('label').dataset.aq267Text='لغة الواجهة';tools.append(rentalContracts,employees,propertyNotices,control,scan,statements,utilities,quality,review,partners,languageField,notice);menu.append(tools);updateLabels();
 for(const id of ['serviceManagementPage','settingsCenterPage']){const page=document.getElementById(id);if(page){const card=node('section'),button=ui('button','عدادات الكهرباء والماء');card.className='aq267-tools';button.onclick=utilities.onclick;card.append(ui('h3','خدمات العقارات'),button);page.prepend(card);}}
 // No polling or page observers. Refresh only on explicit navigation/menu actions.
 document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-v199-action="more"]')){refresh();return;}
  const target=event.target.closest?.('[data-v199-go],[data-v205-route]');if(!target)return;
  const key=ROUTES[target.dataset.v199Go||target.dataset.v205Route];if(!key)return;
  try{currentScope();}catch{access=null;return;}
  if(!access){event.preventDefault();event.stopImmediatePropagation();refresh().then(data=>{if(data)window.alert(t('تم التحقق من الصلاحيات. اختر القسم المطلوب.'));});return;}
  if(access.sections[key]===false||access.permissions[key]?.read!==true){event.preventDefault();event.stopImmediatePropagation();window.alert(t('هذا القسم متوقف أو غير متاح لصلاحية حسابك.'));return;}
  if(key==='contracts'){event.preventDefault();event.stopImmediatePropagation();rentalContracts.onclick();return;}
  if(key==='employees'){event.preventDefault();event.stopImmediatePropagation();employees.onclick();return;}
  queueMicrotask(updateLabels);
 },true);
 window.addEventListener('aqari:v267-controls-changed',refresh);
 window.addEventListener('aqari:auth-boundary',()=>{try{const c=currentScope();bindLocale(c);if(access&&(c.user!==access.user_id||c.workspace!==access.workspace_id||c.role!==access.role)){access=null;session?.close();}}catch{access=null;session?.close();bindLocale(null);}updateFeatureTools();updateLabels();});
 refresh();
}
