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
