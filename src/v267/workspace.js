import {guardPageImport} from './components/navigation-import.js';
import {uiText,refreshText} from './components/ui-text.js';
import {t,getLocale,bindLocale,setLocale,direction} from './components/locale.js';
import {installFinancialIntegrity} from './pages/financial-integrity.js';
import {createSession,currentScope,safeError} from './api/session.js';
import {node,field} from './components/dialog.js';
import {LANGUAGES,ROUTES,label} from './components/catalog.js';
import {installContractRoutes} from './components/contract-routing.js';
import {organizeServices} from './components/service-directory.js';
import {installPropertyExperience} from './components/property-experience.js';
let installed=false,access=null,loading=null,session,notice,serviceDirectory,propertyExperience;
function directoryScope(){
 try{const s=currentScope();return access&&s.user===access.user_id&&s.workspace===access.workspace_id&&s.role===access.role?JSON.stringify([s.workspace,s.user,s.role]):null;}catch{return null;}
}
function directoryAllowed(item){
 if(!directoryScope()||item.manager&&access.role!=='general_manager')return false;
 return !item.section||(access.sections?.[item.section]!==false&&access.permissions?.[item.section]?.read===true);
}
function updateFeatureTools(){
 const financialCompletions=[['aq267-opening-balances','opening_balance_reconciliation'],['aq267-partner-distributions','partner_distribution_register'],['aq267-commercial-collections','commercial_collections']];
 for(const [id,feature] of financialCompletions){const button=document.getElementById(id);if(button)button.hidden=access?.features?.[feature]!==true||access?.role!=='general_manager'||access?.permissions?.finance?.read!==true||access?.permissions?.documents?.read!==true||(feature==='partner_distribution_register'&&access?.permissions?.partners?.read!==true);}
 const finalGaps=document.getElementById('aq267-final-gap-center'),officialDocuments=document.getElementById('aq267-official-document-center'),integrations=document.getElementById('aq267-integration-center'),financialArchive=document.getElementById('aq267-financial-archive'),guide=document.getElementById('aq267-user-guide'),compliance=document.getElementById('aq267-compliance-center'),kpis=document.getElementById('aq267-kpi-dashboard'),maintenancePlans=document.getElementById('aq267-maintenance-plans'),maintenanceReport=document.getElementById('aq267-maintenance-report'),security=document.getElementById('aq267-security-center'),operations=document.getElementById('aq267-operations-center'),staff=document.getElementById('aq267-staff-access'),finance=document.getElementById('aq267-financial-register'),deposits=document.getElementById('aq267-deposit-ledger'),vacating=document.getElementById('aq267-vacating-settlement'),vacatingReview=document.getElementById('aq267-vacating-review');
 if(finalGaps)finalGaps.hidden=access?.features?.final_gap_register!==true||access?.role!=='general_manager';
 if(officialDocuments)officialDocuments.hidden=access?.features?.official_documents!==true||access?.role!=='general_manager';
 if(integrations)integrations.hidden=access?.features?.external_integrations!==true||access?.role!=='general_manager';
 if(financialArchive)financialArchive.hidden=access?.features?.financial_archive!==true||access?.permissions?.finance?.read!==true;
 if(guide)guide.hidden=false;
 if(compliance)compliance.hidden=access?.features?.compliance_register!==true||access?.role!=='general_manager';
 if(kpis)kpis.hidden=access?.features?.kpi_dashboard!==true||access?.role!=='general_manager';
 if(maintenancePlans)maintenancePlans.hidden=access?.features?.maintenance_plans!==true||access?.permissions?.maintenance?.read!==true;
 if(maintenanceReport)maintenanceReport.hidden=access?.features?.maintenance_report!==true||access?.permissions?.maintenance?.read!==true||access?.permissions?.reports?.read!==true;
 if(security)security.hidden=access?.role!=='general_manager'&&access?.role!=='accountant';
 if(operations)operations.hidden=access?.features?.operations_register!==true||access?.role!=='general_manager';
 if(staff)staff.hidden=access?.features?.staff_access!==true||access?.role!=='general_manager';
 if(finance)finance.hidden=access?.features?.financial_register!==true||access?.permissions?.finance?.read!==true;
 if(deposits)deposits.hidden=access?.features?.deposit_register!==true||access?.permissions?.collections?.read!==true;
 if(vacatingReview)vacatingReview.hidden=access?.features?.vacating_review!==true||access?.role!=='general_manager';
 const expiryReport=document.getElementById('aq267-lease-expiry-report');
 if(expiryReport)expiryReport.hidden=access?.features?.lease_expiry_report!==true||access?.permissions?.reports?.read!==true||access?.permissions?.contracts?.read!==true;
 const circulars=document.getElementById('aq267-staff-circulars');
 if(circulars)circulars.hidden=access?.features?.staff_circulars!==true;
 const readiness=document.getElementById('aq267-unit-readiness');
 if(readiness)readiness.hidden=access?.features?.unit_readiness!==true||access?.permissions?.properties?.read!==true;
 const exit=document.getElementById('aq267-exit-review');
 if(exit)exit.hidden=access?.features?.exit_review!==true||access?.role!=='general_manager';
 if(vacating)vacating.hidden=access?.features?.vacating_settlement!==true||access?.permissions?.contracts?.read!==true||access?.permissions?.collections?.read!==true;
 const directPages=[
  ['aq267-approval-center',null,true],
  ['aq267-bank-reconciliation','finance',false],
  ['aq267-contract-foundation','contracts',true],
  ['aq267-contract-templates','contracts',true],
  ['aq267-rental-document-cycle','contracts',true],
  ['aq267-contract-preview','contracts',true],
  ['aq267-contract-approvals','contracts',true],
  ['aq267-contract-archive','contracts',true],
  ['aq267-contract-change-requests','contracts',false],
  ['aq267-owner-experience-settings',null,true],
  ['aq267-owner-report','reports',true],
  ['aq267-owner-task-center',null,true],
  ['aq267-property-admin-settings','properties',true],
  ['aq267-property-controls','properties',true],
  ['aq267-property-cost-allocation','finance',true],
  ['aq267-property-onboarding','properties',true],
  ['aq267-tenant-timeline','tenants',false]
 ];
 for(const [id,section,manager] of directPages){const button=document.getElementById(id);if(button)button.hidden=!directoryAllowed({section,manager});}
 serviceDirectory?.refresh(directoryScope());
 propertyExperience?.refresh();
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
 serviceDirectory?.refresh(directoryScope());
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
 if(!document.getElementById('aq267-service-directory-css')){const css=node('link');css.id='aq267-service-directory-css';css.rel='stylesheet';css.href='/src/v267/styles/service-directory.css?release=V267';document.head.append(css);}
 const menu=document.getElementById('v199MoreMenu');if(!menu){installed=false;return;}
 propertyExperience=installPropertyExperience({readable:()=>directoryAllowed({section:'properties'}),writable:()=>directoryAllowed({section:'properties'})&&access?.permissions?.properties?.write===true&&['general_manager','property_manager'].includes(access?.role)});
 window.AQARI_DOCUMENTS={allowed:()=>directoryAllowed({section:'documents'})};
 const tools=node('section'),control=node('button',label('control_center')),scan=node('button',label('scan_document')),language=node('select');tools.className='aq267-tools';tools.id='aq267-workspace-tools';notice=node('p');notice.setAttribute('role','status');
 const directPage=(id,title,path,method,section=null,manager=false)=>{const button=ui('button',title);button.id=id;button.hidden=true;button.onclick=async()=>{try{if(!directoryScope())await refresh();if(!directoryAllowed({section,manager}))throw Error('هذه الخدمة غير متاحة لصلاحية حسابك.');const bound=directoryScope(),m=await guardPageImport(()=>import(path));if(bound!==directoryScope()||!directoryAllowed({section,manager}))throw Error('تغيّرت الجلسة أو الصلاحية. أعد المحاولة.');if(typeof m[method]!=='function')throw Error('تعذر فتح الصفحة.');return m[method]();}catch(e){notice.textContent=t(safeError(e));return false;}};return button;};
 const approvalCenter=directPage('aq267-approval-center','مركز الموافقات','./pages/approval-center.js','openApprovalCenter',null,true);
 const bankReconciliation=directPage('aq267-bank-reconciliation','مطابقة التحويلات البنكية','./pages/bank-reconciliation.js','openBankReconciliation','finance');
 const contractFoundation=directPage('aq267-contract-foundation','عقد جديد — التأسيس الكامل','./pages/contract-foundation.js','openContractFoundation','contracts',true);
 const contractPreview=directPage('aq267-contract-preview','◉ معاينة العقود والملاحق','./pages/rental-contracts.js','openContractPreview','contracts',true);
 const contractApprovals=directPage('aq267-contract-approvals','✓ اعتماد العقود الجديدة','./pages/rental-contracts.js','openContractApprovals','contracts',true);
 const rentalDocumentCycle=directPage('aq267-rental-document-cycle','دورة مستندات الإيجار','./pages/rental-contracts.js','openRentalContracts','contracts',true);
 const contractTemplates=directPage('aq267-contract-templates','نماذج العقود — المدير العام','./pages/contract-templates.js','openContractTemplates','contracts',true);
 const contractArchive=directPage('aq267-contract-archive','أرشيف العقود السابقة','./pages/contract-archive.js','openContractArchive','contracts',true);
 const contractRequests=directPage('aq267-contract-change-requests','طلبات تعديل العقود','./pages/contract-change-requests.js','openContractChangeRequests','contracts');
 const ownerExperienceSettings=directPage('aq267-owner-experience-settings','إعدادات تجربة المالك','./pages/owner-experience-settings.js','openOwnerExperienceSettings',null,true);
 const ownerReport=directPage('aq267-owner-report','تقرير المالك','./pages/owner-report.js','openOwnerReport','reports',true);
 const ownerTaskCenter=directPage('aq267-owner-task-center','التنبيهات والمهام','./pages/owner-task-center.js','openOwnerTaskCenter',null,true);
 const propertyAdminSettings=directPage('aq267-property-admin-settings','إعدادات إدارة العقارات','./pages/property-admin-settings.js','openPropertyAdminSettings','properties',true);
 const propertyControls=directPage('aq267-property-controls','ضوابط وخدمات العقار','./pages/property-controls.js','openPropertyControls','properties',true);
 const propertyCostAllocation=directPage('aq267-property-cost-allocation','توزيع تكاليف العقار','./pages/property-cost-allocation.js','openPropertyCostAllocation','finance',true);
 const propertyOnboarding=directPage('aq267-property-onboarding','إضافة عقار وتجهيزه','./pages/property-onboarding.js','openPropertyOnboarding','properties',true);
 const tenantTimeline=directPage('aq267-tenant-timeline','السجل الزمني للمستأجر','./pages/tenant-timeline.js','openTenantTimeline','tenants');
 for(const [value,text]of Object.entries(LANGUAGES)){const option=node('option',text);option.value=value;language.append(option);}
 control.dataset.aq267Label='control_center';scan.dataset.aq267Label='scan_document';
 control.hidden=currentScope().role!=='general_manager';
 control.onclick=()=>guardPageImport(()=>import('./pages/control-center.js')).then(m=>m.openControlCenter()).catch(e=>notice.textContent=t(safeError(e)));
 scan.onclick=()=>guardPageImport(()=>import('./pages/document-scanner.js')).then(m=>m.openDocumentScanner()).catch(e=>notice.textContent=t(safeError(e)));
 const contractScan=ui('button','مسح عقد الإيجار');contractScan.onclick=()=>guardPageImport(()=>import('./pages/document-scanner.js')).then(m=>m.openDocumentScanner({type:'lease',category:'lease_contract'})).catch(e=>notice.textContent=t(safeError(e)));
 language.id='aq267-interface-language';language.value=getLocale();language.onchange=()=>{try{bindLocale(currentScope());setLocale(language.value);updateLabels();}catch(e){notice.textContent=t(safeError(e));}};
 const statements=ui('button','كشوف العقارات — برج شيخة');statements.hidden=currentScope().role!=='general_manager';statements.onclick=()=>guardPageImport(()=>import('./pages/property-statements.js')).then(m=>m.openPropertyStatements()).catch(e=>notice.textContent=t(safeError(e)));
 const utilities=ui('button','الإعدادات والخدمات — عدادات العقارات');utilities.onclick=()=>guardPageImport(()=>import('./pages/utility-meters.js')).then(m=>m.openUtilityMeters()).catch(e=>notice.textContent=t(safeError(e)));
 const quality=ui('button','مركز جودة البيانات');quality.hidden=currentScope().role!=='general_manager';quality.onclick=()=>guardPageImport(()=>import('./pages/data-quality.js')).then(m=>m.openDataQuality()).catch(e=>notice.textContent=t(safeError(e)));
 const review=ui('button','اعتماد عقود المصدر');review.hidden=currentScope().role!=='general_manager';review.onclick=()=>guardPageImport(()=>import('./pages/lease-review.js')).then(m=>m.openLeaseReview()).catch(e=>notice.textContent=t(safeError(e)));
 const partners=ui('button','صلاحيات الشركاء حسب العقار');partners.hidden=currentScope().role!=='general_manager';partners.onclick=()=>guardPageImport(()=>import('./pages/partner-access.js')).then(m=>m.openPartnerAccess()).catch(e=>notice.textContent=t(safeError(e)));
 const employees=ui('button','الموظفون والرواتب');employees.onclick=()=>guardPageImport(()=>import('./pages/employees.js')).then(m=>m.openEmployees()).catch(e=>notice.textContent=t(safeError(e)));
 const openContracts=async(initial={})=>{try{currentScope();if(!directoryScope())await refresh();if(!directoryAllowed({section:'contracts'}))throw Error('العقود غير متاحة لصلاحية حسابك.');const bound=directoryScope(),m=await guardPageImport(()=>import('./pages/rental-contracts.js'));if(bound!==directoryScope()||!directoryAllowed({section:'contracts'}))throw Error('تغيّرت الجلسة أو صلاحية العقود. أعد المحاولة.');return m.openRentalContracts(initial);}catch(e){notice.textContent=t(safeError(e));return false;}};
 const rentalContracts=ui('button','عقود الإيجار');rentalContracts.onclick=()=>openContracts();installContractRoutes(window,openContracts,()=>contractTemplates.onclick());
 const propertyNotices=node('button','إعلانات العقارات وإرشادات المستأجرين');propertyNotices.hidden=currentScope().role!=='general_manager';propertyNotices.onclick=()=>guardPageImport(()=>import('./pages/property-notices.js')).then(m=>m.openPropertyNotices()).catch(e=>notice.textContent=t(safeError(e)));
 const staffCirculars=ui('button','تعاميم الموظفين وإثبات الاطلاع');staffCirculars.id='aq267-staff-circulars';staffCirculars.hidden=true;staffCirculars.onclick=()=>guardPageImport(()=>import('./pages/staff-circulars.js')).then(m=>m.openStaffCirculars()).catch(e=>notice.textContent=t(safeError(e)));
 const staffAccess=node('button','صلاحيات الموظفين حسب العقار');staffAccess.id='aq267-staff-access';staffAccess.hidden=true;staffAccess.onclick=()=>guardPageImport(()=>import('./pages/staff-access.js')).then(m=>m.openStaffAccess()).catch(e=>notice.textContent=t(safeError(e)));
 const financialRegister=node('button','سجل المصروفات وإقفال الفترة المالية');financialRegister.id='aq267-financial-register';financialRegister.hidden=true;financialRegister.onclick=()=>guardPageImport(()=>import('./pages/financial-register.js')).then(m=>m.openFinancialRegister()).catch(e=>notice.textContent=t(safeError(e)));
 const openingBalances=ui('button','مطابقة الأرصدة الافتتاحية');openingBalances.id='aq267-opening-balances';openingBalances.hidden=true;openingBalances.onclick=()=>guardPageImport(()=>import('./pages/opening-balances.js')).then(m=>m.openOpeningBalances()).catch(e=>notice.textContent=t(safeError(e)));
 const partnerDistributions=ui('button','اعتماد وتوزيع مستحقات الشركاء');partnerDistributions.id='aq267-partner-distributions';partnerDistributions.hidden=true;partnerDistributions.onclick=()=>guardPageImport(()=>import('./pages/partner-distributions.js')).then(m=>m.openPartnerDistributions()).catch(e=>notice.textContent=t(safeError(e)));
 const commercialCollections=ui('button','التحصيل التجاري والمستحقات');commercialCollections.id='aq267-commercial-collections';commercialCollections.hidden=true;commercialCollections.onclick=()=>guardPageImport(()=>import('./pages/commercial-sales.js')).then(m=>m.openCommercialSales()).catch(e=>notice.textContent=t(safeError(e)));
 const deposits=ui('button','دفتر التأمين — القبض والرد');deposits.id='aq267-deposit-ledger';deposits.hidden=true;deposits.onclick=()=>guardPageImport(()=>import('./pages/deposit-ledger.js')).then(m=>m.openDepositLedger()).catch(e=>notice.textContent=t(safeError(e)));
 const vacating=ui('button','تسوية الإخلاء وبراءة الذمة');vacating.id='aq267-vacating-settlement';vacating.hidden=true;vacating.onclick=()=>guardPageImport(()=>import('./pages/vacating-settlement.js')).then(m=>m.openVacatingSettlement()).catch(e=>notice.textContent=t(safeError(e)));
 const exitReview=ui('button','طلب إخلاء ومراجعة التسوية');exitReview.id='aq267-exit-review';exitReview.hidden=true;exitReview.onclick=()=>guardPageImport(()=>import('./pages/exit-review.js')).then(m=>m.openExitReview()).catch(e=>notice.textContent=t(safeError(e)));
 const guideButton=ui('button','دليل استخدام AQARI V267');guideButton.id='aq267-user-guide';guideButton.hidden=false;guideButton.onclick=()=>guardPageImport(()=>import('./pages/user-guide.js')).then(m=>m.openUserGuide()).catch(e=>notice.textContent=t(safeError(e)));
 const complianceButton=ui('button','العقود التجارية والخدمات وفحص الوحدات');complianceButton.id='aq267-compliance-center';complianceButton.hidden=true;complianceButton.onclick=()=>guardPageImport(()=>import('./pages/compliance-center.js')).then(m=>m.openComplianceCenter()).catch(e=>notice.textContent=t(safeError(e)));
 const kpiButton=ui('button','لوحة مؤشرات الأداء الفعلية');kpiButton.id='aq267-kpi-dashboard';kpiButton.hidden=true;kpiButton.onclick=()=>guardPageImport(()=>import('./pages/kpi-dashboard.js')).then(m=>m.openKpiDashboard()).catch(e=>notice.textContent=t(safeError(e)));
 const maintenancePlansButton=ui('button','الصيانة الدورية وتنبيهات 30/60/90');maintenancePlansButton.id='aq267-maintenance-plans';maintenancePlansButton.hidden=true;maintenancePlansButton.onclick=()=>guardPageImport(()=>import('./pages/maintenance-plans.js')).then(m=>m.openMaintenancePlans()).catch(e=>notice.textContent=t(safeError(e)));
 const maintenanceReportButton=ui('button','تقرير الصيانة — الحالة والتكلفة والزمن');maintenanceReportButton.id='aq267-maintenance-report';maintenanceReportButton.hidden=true;maintenanceReportButton.onclick=()=>guardPageImport(()=>import('./pages/maintenance-report.js')).then(m=>m.openMaintenanceReport()).catch(e=>notice.textContent=t(safeError(e)));
 const securityCenter=ui('button','الأمان والتوثيق الثنائي');securityCenter.id='aq267-security-center';securityCenter.hidden=true;securityCenter.onclick=()=>guardPageImport(()=>import('./pages/security-center.js')).then(m=>m.openSecurityCenter()).catch(e=>notice.textContent=t(safeError(e)));
 const operationsCenter=ui('button','مركز العمليات — الشيكات والموردون والقضايا والعهدة');operationsCenter.id='aq267-operations-center';operationsCenter.hidden=true;operationsCenter.onclick=()=>guardPageImport(()=>import('./pages/operations-center.js')).then(m=>m.openOperationsCenter()).catch(e=>notice.textContent=t(safeError(e)));
 const finalGapButton=ui('button','الذمم والحسابات والتواصل والتقييم');finalGapButton.id='aq267-final-gap-center';finalGapButton.hidden=true;finalGapButton.onclick=()=>guardPageImport(()=>import('./pages/final-gap-center.js')).then(m=>m.openFinalGapCenter()).catch(e=>notice.textContent=t(safeError(e)));
 const officialDocumentsButton=ui('button','النماذج الرسمية وPDF والأرشيف');officialDocumentsButton.id='aq267-official-document-center';officialDocumentsButton.hidden=true;officialDocumentsButton.onclick=()=>guardPageImport(()=>import('./pages/official-document-center.js')).then(m=>m.openOfficialDocumentCenter()).catch(e=>notice.textContent=t(safeError(e)));
 const integrationsButton=ui('button','التكاملات الخارجية وWebhooks');integrationsButton.id='aq267-integration-center';integrationsButton.hidden=true;integrationsButton.onclick=()=>guardPageImport(()=>import('./pages/integration-center.js')).then(m=>m.openIntegrationCenter()).catch(e=>notice.textContent=t(safeError(e)));
 const financialArchiveButton=ui('button','الأرشيف المالي التاريخي');financialArchiveButton.id='aq267-financial-archive';financialArchiveButton.hidden=true;financialArchiveButton.onclick=()=>guardPageImport(()=>import('./pages/financial-archive.js')).then(m=>m.openFinancialArchive()).catch(e=>notice.textContent=t(safeError(e)));
 const expiryReportButton=ui('button','العقود المنتهية والقريبة من الانتهاء');expiryReportButton.id='aq267-lease-expiry-report';expiryReportButton.hidden=true;expiryReportButton.onclick=()=>guardPageImport(()=>import('./pages/lease-expiry-report.js')).then(m=>m.openLeaseExpiryReport()).catch(e=>notice.textContent=t(safeError(e)));
 const readinessButton=ui('button','جاهزية الوحدات قبل التأجير');readinessButton.id='aq267-unit-readiness';readinessButton.hidden=true;readinessButton.onclick=()=>guardPageImport(()=>import('./pages/unit-readiness.js')).then(m=>m.openUnitReadiness()).catch(e=>notice.textContent=t(safeError(e)));
 const originals=ui('button','المستندات الأصلية — الأطراف والعقار والعقد والإخلاء');originals.onclick=()=>guardPageImport(()=>import('./pages/original-documents.js')).then(m=>m.openOriginalDocuments()).catch(e=>notice.textContent=t(safeError(e)));
 const vacatingReview=node('button','مراجعات الإخلاء المؤرشفة');vacatingReview.id='aq267-vacating-review';vacatingReview.hidden=true;vacatingReview.onclick=()=>guardPageImport(()=>import('./pages/vacating-review.js')).then(m=>m.openVacatingReview()).catch(e=>notice.textContent=t(safeError(e)));
 tools.append(staffCirculars,readinessButton,staffAccess,financialRegister,openingBalances,partnerDistributions,commercialCollections,financialArchiveButton,deposits,bankReconciliation,propertyCostAllocation,finalGapButton,officialDocumentsButton,integrationsButton,guideButton,complianceButton,kpiButton,maintenancePlansButton,maintenanceReportButton,securityCenter,operationsCenter,approvalCenter,contractFoundation,propertyOnboarding,propertyAdminSettings,propertyControls,tenantTimeline,ownerTaskCenter,ownerReport,ownerExperienceSettings,originals,exitReview,vacating,vacatingReview);
 const languageField=field(t('لغة الواجهة'),language);languageField.querySelector('label').dataset.aq267Text='لغة الواجهة';tools.append(rentalContracts,employees,propertyNotices,control,scan,contractScan,statements,utilities,quality,review,partners,languageField,notice);menu.append(tools);
 const entry=(source,section,manager=false,keywords='')=>({source,section,manager,keywords});
 const route=(name,section)=>({...entry(document.querySelector('#aqariV199Topbar [data-v199-go="'+name+'"]'),section),menu:false});
 serviceDirectory=organizeServices({tools,allowed:directoryAllowed,groups:[
  {key:'finance',items:[route('collectionProPage','collections'),entry(deposits,'collections',false,'تأمين تامين قبض رد'),entry(bankReconciliation,'finance',false,'بنك تحويل مطابقة تسوية bank reconciliation transfer'),entry(propertyCostAllocation,'finance',true,'تكلفة تكاليف توزيع العقار cost allocation'),entry(financialRegister,'finance'),entry(commercialCollections,'finance',true,'تجاري تحصيل مبيعات مستحقات قبض commercial collections sales'),entry(openingBalances,'finance',true,'افتتاح افتتاحي مطابقة مستند قطع opening balance reconciliation'),entry(partnerDistributions,'partners',true,'شريك شركاء حصص توزيع مستحقات partner shares distribution'),entry(financialArchiveButton,'finance'),entry(finalGapButton,null,true)]},
  {key:'contracts',items:[entry(contractPreview,'contracts',true,'معاينة العقد الملاحق preview'),entry(contractApprovals,'contracts',true,'اعتماد عقد جديد موافقة approval'),entry(contractArchive,'contracts',true,'أرشفة أرشيف عقد سابق archive'),entry(contractRequests,'contracts',false,'طلب تعديل عقد approval request'),entry(rentalDocumentCycle,'contracts',true,'مستندات إيجار عقد استلام وصل إخلاء براءة ذمة document cycle'),entry(contractTemplates,'contracts',true,'نموذج نماذج قوالب contract templates'),entry(contractFoundation,'contracts',true,'عقد جديد تأسيس كامل create contract foundation'),entry(approvalCenter,null,true,'موافقة موافقات اعتماد approval center'),entry(rentalContracts,'contracts',false,'قالب قوالب شقة بيت محل تجاري استثماري مدة نهاية contract template apartment house shop commercial investment'),entry(contractScan,'documents',false,'مسح عقد تصوير عقد رفع عقد'),entry(expiryReportButton,'reports'),entry(officialDocumentsButton,'documents',true),entry(originals,'documents'),entry(scan,'documents'),entry(exitReview,null,true),entry(vacating,'contracts'),entry(vacatingReview,null,true)]},
  {key:'properties',items:[route('properties','properties'),route('tenants','tenants'),entry(propertyOnboarding,'properties',true,'إضافة عقار تجهيز onboarding'),entry(propertyAdminSettings,'properties',true,'إعدادات إدارة العقار admin settings'),entry(propertyControls,'properties',true,'ضوابط خدمات العقار controls'),entry(tenantTimeline,'tenants',false,'تاريخ مستأجر سجل زمني timeline'),entry(readinessButton,'properties'),entry(statements,null,true),entry(quality,null,true),entry(review,null,true)]},
  {key:'maintenance',items:[route('maintenanceProPage','maintenance'),entry(utilities),entry(maintenancePlansButton,'maintenance'),entry(maintenanceReportButton,'reports',false,'تقرير الصيانة حالة تكلفة زمن استجابة إغلاق'),entry(complianceButton,null,true),entry(operationsCenter,null,true)]},
  {key:'staff',items:[entry(employees,'employees',false,'راتب رواتب موظف'),entry(staffAccess,null,true),entry(partners,null,true),entry(propertyNotices,null,true),entry(staffCirculars)]},
  {key:'account',items:[entry(ownerTaskCenter,null,true,'مهام تنبيهات owner tasks'),entry(ownerReport,'reports',true,'تقرير المالك owner report'),entry(ownerExperienceSettings,null,true,'إعدادات تجربة المالك owner settings'),entry(kpiButton,null,true),entry(control,null,true),entry(securityCenter),entry(integrationsButton,null,true),entry(guideButton)]}
 ].map(group=>({...group,items:group.items.filter(item=>item.source)}))});
 tools.append(languageField,notice);updateLabels();
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
 window.addEventListener('aqari:auth-boundary',event=>{try{const c=currentScope();bindLocale(c);if(access&&(c.user!==access.user_id||c.workspace!==access.workspace_id||c.role!==access.role)){access=null;session?.close();}}catch{access=null;session?.close();bindLocale(null);}updateFeatureTools();updateLabels();
  // Let a cancelled access read settle before requesting the ready account.
  if(event?.detail?.state==='ready'&&!directoryScope()){
   Promise.resolve(loading).then(()=>{
    try{currentScope();}catch{return;}
    if(!directoryScope())return refresh();
   });
  }
 });
 refresh();
}
