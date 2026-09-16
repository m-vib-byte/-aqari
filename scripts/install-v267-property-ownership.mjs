import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const path=new URL('../src/v267/pages/property-hub.js',import.meta.url);
let source=readFileSync(path,'utf8');
const marker="openPropertyOwnership(propertyId)";
if(!source.includes(marker)){
 const anchorA="async function ownerStatement(){d.close();const m=await import('./property-owner-statement.js');return m.openPropertyOwnerStatement(propertyId);}\n async function render(){";
 const replacementA="async function ownerStatement(){d.close();const m=await import('./property-owner-statement.js');return m.openPropertyOwnerStatement(propertyId);}\n async function ownershipProfile(){d.close();const m=await import('./property-ownership.js');return m.openPropertyOwnership(propertyId);}\n async function render(){";
 if(!source.includes(anchorA))throw Error('V267_PROPERTY_OWNERSHIP_FUNCTION_ANCHOR_MISSING');
 source=source.replace(anchorA,replacementA);
 const anchorB="if(file.permissions?.finance!==false)head.append(button('مركز تكلفة العقار والتوزيع',financeCenter),button('كشف الملاك المحسوب',ownerStatement));mount('summary',head,p.name);";
 const replacementB="if(file.permissions?.finance!==false)head.append(button('مركز تكلفة العقار والتوزيع',financeCenter),button('كشف الملاك المحسوب',ownerStatement));head.append(button('الملكية والمساحات والورثة',ownershipProfile));mount('summary',head,p.name);";
 if(!source.includes(anchorB))throw Error('V267_PROPERTY_OWNERSHIP_BUTTON_ANCHOR_MISSING');
 source=source.replace(anchorB,replacementB);
 writeFileSync(path,source);
 console.log('Installed V267 property ownership/area entry into Property Hub.');
}else console.log('V267 property ownership/area entry already installed.');

const directoryPath=new URL('../src/v267/components/service-directory.js',import.meta.url);
let directorySource=readFileSync(directoryPath,'utf8');
const previewAnchor="return String(current.hostname||'').endsWith('.vercel.app');";
const previewReplacement="const hostname=String(current.hostname||'');return hostname==='myaqari.com'||hostname.endsWith('.vercel.app');";
if(directorySource.includes(previewAnchor))directorySource=directorySource.replace(previewAnchor,previewReplacement);
else if(!directorySource.includes(previewReplacement))throw Error('V267_SERVICE_DIRECTORY_PREVIEW_ANCHOR_MISSING');
const sectionAnchor="box.className='aq267-service-group';box.dataset.group=group.key;box.open=!!query||expanded.has(group.key);count.className='aq267-service-count';";
const sectionReplacement="box.className='aq267-service-group';box.dataset.group=group.key;box.open=!!query||expanded.has(group.key);summary.onclick=event=>{event?.preventDefault?.();box.open=!box.open;};count.className='aq267-service-count';";
if(directorySource.includes(sectionAnchor))directorySource=directorySource.replace(sectionAnchor,sectionReplacement);
else if(!directorySource.includes(sectionReplacement))throw Error('V267_SERVICE_DIRECTORY_SECTION_ANCHOR_MISSING');
const serviceIconAnchor="button.dataset.service=group.key;";
const serviceIconReplacement="button.dataset.service=item.source?.dataset?.aq267Label||group.key;";
if(directorySource.includes(serviceIconAnchor))directorySource=directorySource.replace(serviceIconAnchor,serviceIconReplacement);
else if(!directorySource.includes(serviceIconReplacement))throw Error('V267_SERVICE_DIRECTORY_ICON_KEY_ANCHOR_MISSING');
writeFileSync(directoryPath,directorySource);
console.log('Installed V267 fixed-site service-section hotfix and semantic service icon keys for myaqari.com/iPad Safari.');

const workspacePath=new URL('../src/v267/workspace.js',import.meta.url);
let workspaceSource=readFileSync(workspacePath,'utf8');
const entryAnchor=" const entry=(source,section,manager=false,keywords='')=>({source,section,manager,keywords});";
const entryReplacement=` const displayKeys=new Map([
  [rentalContracts,'rental_contracts'],[contractScan,'contract_scan'],[statements,'property_statements'],[utilities,'maintenance_utilities'],[quality,'data_quality'],[review,'lease_review'],[partners,'partner_access'],[employees,'employees_payroll'],[propertyNotices,'property_notices'],[staffCirculars,'staff_circulars'],[staffAccess,'staff_access'],[financialRegister,'financial_register'],[openingBalances,'opening_balances'],[partnerDistributions,'partner_distributions'],[commercialCollections,'commercial_collections'],[deposits,'deposit_ledger'],[vacating,'vacating_settlement'],[exitReview,'exit_review'],[guideButton,'user_guide'],[complianceButton,'compliance_center'],[kpiButton,'kpi_dashboard'],[maintenancePlansButton,'maintenance_plans'],[maintenanceReportButton,'maintenance_report'],[securityCenter,'security_center'],[operationsCenter,'operations_center'],[finalGapButton,'final_gap_center'],[officialDocumentsButton,'official_documents'],[integrationsButton,'integration_center'],[financialArchiveButton,'financial_archive'],[expiryReportButton,'lease_expiry_report'],[readinessButton,'unit_readiness'],[originals,'original_documents'],[vacatingReview,'vacating_review']
 ]);
 const entry=(source,section,manager=false,keywords='')=>{const displayKey=displayKeys.get(source);if(source&&displayKey)source.dataset.aq267Label=displayKey;return {source,section,manager,keywords};};`;
if(workspaceSource.includes(entryAnchor))workspaceSource=workspaceSource.replace(entryAnchor,entryReplacement);
else if(!workspaceSource.includes("displayKeys=new Map(["))throw Error('V267_EDITABLE_SERVICE_LABELS_ENTRY_ANCHOR_MISSING');
const groupAnchor="serviceDirectory=organizeServices({tools,allowed:directoryAllowed,groups:[";
const groupReplacement="serviceDirectory=organizeServices({tools,allowed:directoryAllowed,groupLabel:key=>label('group_'+key,getLocale(),access?.labels||{}),groups:[";
if(workspaceSource.includes(groupAnchor))workspaceSource=workspaceSource.replace(groupAnchor,groupReplacement);
else if(!workspaceSource.includes(groupReplacement))throw Error('V267_EDITABLE_GROUP_LABELS_ANCHOR_MISSING');
writeFileSync(workspacePath,workspaceSource);
console.log('Installed V267 editable service/group display labels without changing internal routing keys.');

const staffAccessPath=new URL('../src/v267/pages/staff-access.js',import.meta.url);
let staffAccessSource=readFileSync(staffAccessPath,'utf8');
const staffAccessAnchor="const d=createDialog('صلاحيات حسابات الموظفين والعقارات');if(!d)return;";
const staffAccessReplacement="const d=createDialog('صلاحيات حسابات الموظفين والعقارات');if(!d)return;d.el.classList.add('aq267-staff-access');";
if(staffAccessSource.includes(staffAccessAnchor))staffAccessSource=staffAccessSource.replace(staffAccessAnchor,staffAccessReplacement);
else if(!staffAccessSource.includes(staffAccessReplacement))throw Error('V267_STAFF_ACCESS_VISUAL_SCOPE_ANCHOR_MISSING');
writeFileSync(staffAccessPath,staffAccessSource);
console.log('Installed V267 visual scope for the audited staff-permission editor.');

execFileSync(process.execPath,['--check','src/v267/pages/control-center.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-manager-control-design.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 manager-control and ultra-luxury presentation contract.');
