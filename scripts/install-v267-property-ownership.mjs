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
 const propertyLabel=text=>source.includes("t as translateStatic")?"translateStatic('"+text+"')":"'"+text+"'";
 const anchorB="if(file.permissions?.finance!==false)head.append(button("+propertyLabel('مركز تكلفة العقار والتوزيع')+",financeCenter),button("+propertyLabel('كشف الملاك المحسوب')+",ownerStatement));mount('summary',head,p.name);";
 const replacementB=anchorB.replace("mount('summary',head,p.name);","head.append(button("+propertyLabel('الملكية والمساحات والورثة')+",ownershipProfile));mount('summary',head,p.name);");
 if(!source.includes(anchorB))throw Error('V267_PROPERTY_OWNERSHIP_BUTTON_ANCHOR_MISSING');
 source=source.replace(anchorB,replacementB);
 writeFileSync(path,source);
 console.log('Installed V267 property ownership/area entry into Property Hub.');
}else console.log('V267 property ownership/area entry already installed.');

const directoryPath=new URL('../src/v267/components/service-directory.js',import.meta.url);
let directorySource=readFileSync(directoryPath,'utf8');
const previewAnchor="return String(current.hostname||'').endsWith('.vercel.app');";
const previewReplacement="const hostname=String(current.hostname||'');return hostname==='myaqari.com'||hostname.endsWith('.vercel.app');";
// The current directory intentionally filters unavailable services on production.
const productionFilteredPreview="return hostname.endsWith('.vercel.app')&&hostname!=='aqari-lovat.vercel.app'&&hostname!=='aqari-m-vib-5421.vercel.app';";
if(directorySource.includes(productionFilteredPreview)){}else if(directorySource.includes(previewAnchor))directorySource=directorySource.replace(previewAnchor,previewReplacement);
else if(!directorySource.includes(previewReplacement))throw Error('V267_SERVICE_DIRECTORY_PREVIEW_ANCHOR_MISSING');
const sectionAnchor="box.className='aq267-service-group';box.dataset.group=group.key;box.open=!!query||expanded.has(group.key);count.className='aq267-service-count';";
const sectionReplacement="box.className='aq267-service-group';box.dataset.group=group.key;box.open=!!query||expanded.has(group.key);summary.onclick=event=>{event?.preventDefault?.();box.open=!box.open;};count.className='aq267-service-count';";
const nativeSectionReplacement=sectionReplacement.replace("summary.onclick=event=>{event?.preventDefault?.();box.open=!box.open;};",'/* Native summary activation owns expansion for touch, mouse and keyboard. */');
if(directorySource.includes(sectionReplacement))directorySource=directorySource.replace(sectionReplacement,nativeSectionReplacement);
if(directorySource.includes("summary.className='aq267-service-heading'")){}else if(directorySource.includes(nativeSectionReplacement)){}else if(directorySource.includes(sectionAnchor))directorySource=directorySource.replace(sectionAnchor,nativeSectionReplacement);
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
const staffTitle=staffAccessSource.includes("t as translateStatic")?"translateStatic('صلاحيات حسابات الموظفين والعقارات')":"'صلاحيات حسابات الموظفين والعقارات'";
const staffAccessAnchor="const d=createDialog("+staffTitle+");if(!d)return;";
const staffAccessReplacement=staffAccessAnchor+"d.el?.classList?.add('aq267-staff-access');";
if(!staffAccessSource.includes(staffAccessReplacement)&&staffAccessSource.includes(staffAccessAnchor))staffAccessSource=staffAccessSource.replace(staffAccessAnchor,staffAccessReplacement);
else if(!staffAccessSource.includes(staffAccessReplacement))throw Error('V267_STAFF_ACCESS_VISUAL_SCOPE_ANCHOR_MISSING');
writeFileSync(staffAccessPath,staffAccessSource);
console.log('Installed V267 visual scope for the audited staff-permission editor.');

// Fixed-domain Safari/iPad navigation reliability: route first, verify the target
// became visible, and only then reset the viewport. This removes the old behavior
// where every click scrolled to the top even when the section transition failed.
const navigationPath=new URL('../v199-ui.js',import.meta.url);
let navigationSource=readFileSync(navigationPath,'utf8');
const navigationAnchor=`  function installNavigationHook(){
    const original=window.go;
    if(typeof original!=='function'||original.__v199Presentation)return;
    const wrapped=function(target){
      const result=original.apply(this,arguments);
      markActive(target);
      return result;
    };
    wrapped.__v199Presentation=true;
    window.go=wrapped;
  }

  function navigate(target){
    closeLayers(false);
    if(typeof window.go==='function')window.go(target);
    markActive(target);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});
  }`;
const navigationReplacement=`  function routeNode(target){
    const id=target==='properties'||target==='tenants'?'list':target;
    return document.getElementById(id);
  }

  function routeVisible(target){
    const page=routeNode(target);
    if(!page)return null;
    if(page.hidden||page.getAttribute('aria-hidden')==='true')return false;
    const style=window.getComputedStyle?.(page);
    return !style||(style.display!=='none'&&style.visibility!=='hidden');
  }

  function installNavigationHook(){
    const original=window.go;
    if(typeof original!=='function'||original.__v199Presentation)return;
    if(typeof window.AQARI_V199_BASE_GO!=='function')window.AQARI_V199_BASE_GO=original;
    const wrapped=function(target){
      const result=original.apply(this,arguments);
      markActive(target);
      return result;
    };
    wrapped.__v199Presentation=true;
    window.go=wrapped;
  }

  function navigate(target){
    closeLayers(false);
    const stableTargets=['home','properties','tenants','collectionProPage','maintenanceProPage'];
    const current=window.go;
    const stable=window.AQARI_V199_BASE_GO;
    const runner=stableTargets.includes(target)&&typeof stable==='function'?stable:current;
    let result;
    try{if(typeof runner==='function')result=runner.call(window,target);}
    catch(error){
      if(typeof current==='function'&&current!==runner)result=current.call(window,target);
      else throw error;
    }
    markActive(target);
    const verify=function(){
      if(routeVisible(target)===false&&typeof current==='function'&&current!==runner){
        try{current.call(window,target)}catch(_error){}
      }
      requestAnimationFrame(function(){
        if(routeVisible(target)===true)window.scrollTo({top:0,behavior:'auto'});
      });
    };
    if(result&&typeof result.then==='function')Promise.resolve(result).finally(function(){requestAnimationFrame(verify)});
    else requestAnimationFrame(verify);
    return result;
  }`;
if(navigationSource.includes(navigationAnchor))navigationSource=navigationSource.replace(navigationAnchor,navigationReplacement);
else if(!navigationSource.includes("window.AQARI_V199_BASE_GO=original"))throw Error('V267_PRIMARY_NAVIGATION_ANCHOR_MISSING');
if(navigationSource.includes("window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});"))throw Error('V267_PRIMARY_NAVIGATION_UNCONDITIONAL_SCROLL_REMAINS');
if(!navigationSource.includes("if(routeVisible(target)===true)window.scrollTo({top:0,behavior:'auto'});")&&!navigationSource.includes("if(routeReady()===true&&page)"))throw Error('V267_PRIMARY_NAVIGATION_VERIFICATION_MISSING');
writeFileSync(navigationPath,navigationSource);
console.log('Installed V267 verified primary-section navigation hotfix for myaqari.com/Safari.');

// Visual-only usability pass after the navigation gate is green. No route, data,
// permission or accounting key is changed by this CSS append.
const luxuryPath=new URL('../src/v267/styles/ultra-luxury.css',import.meta.url);
let luxurySource=readFileSync(luxuryPath,'utf8');
const usabilityMarker='/* AQARI V267 — fixed-domain interaction polish */';
if(!luxurySource.includes(usabilityMarker)){
 luxurySource+=`\n${usabilityMarker}\n@media screen {\n  body.aq-v267 :is(button,a,summary,input,select,textarea){-webkit-tap-highlight-color:transparent}\n  body.aq-v267 :is(button,a,summary,input,select,textarea):focus-visible{outline:3px solid rgba(159,115,43,.34)!important;outline-offset:2px!important;box-shadow:0 0 0 2px #fff,0 0 0 5px rgba(159,115,43,.16)!important}\n  body.aq-v267 .aq267-dialog-body{display:grid;gap:14px;align-content:start}\n  body.aq-v267 .aq267-dialog-body :is(form,section,article,details){scroll-margin-block-start:18px}\n  body.aq-v267 .aq267-field{display:grid;gap:6px;min-width:0}\n  body.aq-v267 .aq267-field>label{font-weight:720;color:#504535;line-height:1.45}\n  body.aq-v267 .aq267-field :is(input,select,textarea){box-sizing:border-box;width:100%;min-height:48px;padding:10px 12px;border:1px solid #ddd0bb;border-radius:12px;background:#fff;color:#2f2a22;box-shadow:inset 0 1px 2px rgba(75,51,16,.025)}\n  body.aq-v267 .aq267-field textarea{min-height:112px;resize:vertical;line-height:1.65}\n  body.aq-v267 .aq267-field :is(input,select,textarea):focus{border-color:#a77b34!important;background:#fffdf8!important}\n  body.aq-v267 :is(.aq267-dialog button:not(.aq267-close),.aq267-service-links button,.v199-nav-button,.v199-bottom-button){touch-action:manipulation}\n  body.aq-v267 :is(.aq267-dialog button:not(.aq267-close),.aq267-service-links button,.v199-nav-button,.v199-bottom-button):not(:disabled):active{transform:translateY(1px)}\n  body.aq-v267 .aq267-service-group>summary{cursor:pointer;user-select:none;touch-action:manipulation}\n  body.aq-v267 .aq267-service-links button{justify-content:flex-start!important;text-align:start!important;line-height:1.5!important;position:relative;overflow:hidden}\n  body.aq-v267 .aq267-dialog :is(button,input,select,textarea){font-family:inherit}\n  body.aq-v267 .aq267-dialog button:not(.aq267-close){min-height:44px}\n}\n@media screen and (min-width:700px) and (max-width:1179px){\n  body.aq-v267 .aq267-dialog{width:min(920px,calc(100vw - 36px));max-height:calc(100dvh - 36px)}\n  body.aq-v267 .aq267-dialog-body{gap:16px}\n  body.aq-v267 .aq267-service-links button{min-height:68px!important;padding:14px!important}\n  body.aq-v267 .aq267-manager-hero{gap:18px}\n}\n@media screen and (max-width:699px){\n  body.aq-v267 .aq267-field :is(input,select,textarea){font-size:16px!important;min-height:50px}\n  body.aq-v267 .aq267-dialog-body{gap:12px}\n  body.aq-v267 .aq267-service-links{grid-template-columns:1fr!important}\n  body.aq-v267 .aq267-service-links button{min-height:64px!important;padding:13px 12px!important}\n  body.aq-v267 .aq267-service-group>summary{touch-action:manipulation}\n}\n@media (prefers-reduced-motion:reduce){\n  body.aq-v267 *,body.aq-v267 *::before,body.aq-v267 *::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}\n}\n`;
 writeFileSync(luxuryPath,luxurySource);
 console.log('Installed V267 fixed-domain interaction and responsive usability polish.');
}
if(!luxurySource.includes(usabilityMarker))throw Error('V267_USABILITY_POLISH_MISSING');

// Validate the final navigation behavior after the existing section-context repair.
execFileSync(process.execPath,['scripts/install-v267-section-target-navigation.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','v199-ui.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--check','src/v267/pages/control-center.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v205-click-routing.test.cjs','tests/v267-manager-control-design.test.mjs','tests/v267-navigation-matrix.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 navigation matrix plus manager-control presentation contracts.');
