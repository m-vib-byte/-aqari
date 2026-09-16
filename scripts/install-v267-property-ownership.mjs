import {readFileSync,writeFileSync} from 'node:fs';

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

// Trial-site section reliability hotfix. Keep myaqari.com in the same full-preview
// behavior as Vercel Preview, and toggle service sections explicitly instead of
// relying on the browser's native <details>/<summary> click behavior on iPad/Safari.
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
writeFileSync(directoryPath,directorySource);
console.log('Installed V267 fixed-site service-section hotfix for myaqari.com/iPad Safari.');
